/* eslint-disable compat/compat -- Modern browser playback; legacy bitmap/local paths stay in the host. */
import { TextSubtitlePipeline } from './subtitles/TextSubtitlePipeline';
import { withSubtitleTimeout } from './subtitles/withSubtitleTimeout';
import { createPreparedLibassWasmRenderer } from './subtitles/renderers/PreparedLibassWasmRenderer';
import { NativeTextRenderer } from './subtitles/renderers/NativeTextRenderer';
import { SubtitleDiagnosticTrace, type SubtitleDiagnosticDetails } from './subtitles/diagnostics';
import defaultFontUrl from '@jellyfin/libass-wasm/dist/js/default.woff2';
import type { SubtitleLoadRequest, SubtitlePipelineStateChange, SubtitleRenderer, SubtitleSlot } from './subtitles/types';

import { JellyfinSubtitleResources, type PlaybackOptions, type SessionTrack } from '../finwebPlayer/JellyfinSubtitleResources';
export type { SessionTrack } from '../finwebPlayer/JellyfinSubtitleResources';
interface Options {
    videoElement: HTMLVideoElement;
    getPlaybackOptions(): PlaybackOptions;
    getSubtitleUrl(track: SessionTrack, item: PlaybackOptions['item']): string;
    onStateChange?(change: SubtitlePipelineStateChange): void;
    onBackgroundSubtitlesReady?(): void;
    useManagedTrack(track: SessionTrack): boolean;
    renderLegacy(track: SessionTrack | null, slot: SubtitleSlot): void;
    prepareManaged(slot: SubtitleSlot): void;
    burnInWhenTranscoding(): boolean;
    getCueLine(slot: SubtitleSlot): number;
}

const ASS_CODECS = ['ass', 'ssa'];
interface PreparedSubtitle {
    content: string;
    fonts: Uint8Array<ArrayBuffer>[];
}

/** One owner for a source's track choices, resource requests and presentation. */
export class FinwebPlaybackSession extends JellyfinSubtitleResources {
    readonly diagnostic = new SubtitleDiagnosticTrace();
    readonly selectionDiagnostics = new Map<SubtitleSlot, SubtitleDiagnosticTrace>();
    readonly mediaEvents = ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'playing', 'waiting', 'stalled', 'seeking', 'seeked', 'ratechange', 'pause', 'error'];
    readonly pipeline: TextSubtitlePipeline;
    readonly identity: string;
    readonly selections = new Map<SubtitleSlot, symbol>();
    readonly desiredTracks = new Map<SubtitleSlot, number>();
    readonly diagnostics: { stage: string; slot: SubtitleSlot; trackIndex: number; time: number }[] = [];
    prefetchTimer?: number;
    prefetch?: { index: number; controller: AbortController };
    readonly prefetchAttempted = new Set<number>();
    readonly preparedSubtitles = new Map<number, PreparedSubtitle>();
    defaultFont?: Uint8Array<ArrayBuffer>;
    backgroundStarted = false;
    backgroundNotified = false;
    deliveryResolved = false;

    constructor(readonly options: Options) {
        super(options.getPlaybackOptions(), options.getSubtitleUrl);
        this.identity = JSON.stringify([
            this.playback.item.ServerId, this.playback.item.Id, this.playback.mediaSource.Id,
            this.playback.transcodingOffsetTicks || 0
        ]);
        this.diagnostic.record('source-created', { source: this.diagnostic.id,
            playMethod: this.playback.playMethod as SubtitleDiagnosticDetails['playMethod'] });
        for (const event of this.mediaEvents) this.videoElement.addEventListener(event, this.onMediaEvent);
        this.pipeline = new TextSubtitlePipeline(options.videoElement, {
            onStateChange: change => {
                this.record(change.state, change.slot, change.trackIndex);
                if (change.state === 'failed') {
                    if (this.desiredTracks.get(change.slot) !== change.trackIndex) return;
                    this.restoreDesiredTrack(change.slot, change.restoredTrackIndex);
                }
                options.onStateChange?.(change);
            }
        });
    }

    get videoElement() { return this.options.videoElement; }
    getTrackIndex(slot: SubtitleSlot) { return this.desiredTracks.get(slot); }
    setOffset(slot: SubtitleSlot, seconds: number) { this.pipeline.setOffset(slot, seconds); }
    sync() { this.pipeline.sync(); }

    record(stage: string, slot: SubtitleSlot, trackIndex: number) {
        this.selectionDiagnostics.get(slot)?.record(stage, { slot, trackIndex,
            mediaTime: this.videoElement.currentTime });
        this.diagnostics.push({ stage, slot, trackIndex, time: this.videoElement.currentTime });
        if (this.diagnostics.length > 100) this.diagnostics.shift();
        // No media URLs, authentication tokens or subtitle text in diagnostics.
        this.videoElement.dispatchEvent(new CustomEvent('finwebsubtitle', {
            detail: this.diagnostics[this.diagnostics.length - 1]
        }));
    }

    async selectStream(index: number, slot: SubtitleSlot = 0) {
        if (this.disposed) return;
        window.clearTimeout(this.prefetchTimer);
        if (this.prefetch?.index !== index) this.stopPrefetch();
        this.selectionDiagnostics.get(slot)?.record('selection-superseded');
        const diagnostic = new SubtitleDiagnosticTrace({ source: this.diagnostic.id, slot, trackIndex: index });
        this.selectionDiagnostics.set(slot, diagnostic);
        const token = Symbol();
        this.selections.set(slot, token);
        this.desiredTracks.set(slot, index);
        const current = () => !this.disposed && this.selections.get(slot) === token;
        const track = this.playback.mediaSource.MediaStreams.find(stream => stream.Type === 'Subtitle' && stream.Index === index);
        diagnostic.record('selection-request', { codec: track?.Codec?.toLowerCase() as SubtitleDiagnosticDetails['codec'],
            delivery: track?.DeliveryMethod as SubtitleDiagnosticDetails['delivery'],
            playMethod: this.playback.playMethod as SubtitleDiagnosticDetails['playMethod'],
            burnIn: this.options.burnInWhenTranscoding(), mediaTime: this.videoElement.currentTime,
            paused: this.videoElement.paused, playbackRate: this.videoElement.playbackRate });
        if (!track) {
            this.clear(slot === 0 ? undefined : slot);
            this.options.renderLegacy(null, slot);
            this.schedulePrefetch();
            return;
        }

        this.record('selected', slot, index);
        // Invalidate a previous in-flight selection immediately, not after a
        // slow session/API lookup. Existing visible subtitles can remain until commit.
        this.pipeline.cancelPending(slot);
        try {
            await diagnostic.measure('delivery-check', () => this.refreshDeliveryMethods(current));
            if (!current()) return;
            diagnostic.record('delivery-selected', { delivery: track.DeliveryMethod as SubtitleDiagnosticDetails['delivery'] });
            if (track.DeliveryMethod === 'Encode') {
                this.clear();
                this.options.renderLegacy(null, 0);
            } else if (this.options.useManagedTrack(track)) {
                this.options.prepareManaged(slot);
                await this.pipeline.select(slot, index, request => {
                    request.diagnostic = diagnostic;
                    return this.createRenderer(track, slot, request);
                });
            } else {
                this.pipeline.clear(slot);
                this.options.renderLegacy(track, slot);
            }
        } catch (error) {
            if (!current()) return;
            diagnostic.record('selection-failed');
            const restoredTrackIndex = this.pipeline.getActiveTrackIndex(slot) ?? -1;
            this.restoreDesiredTrack(slot, restoredTrackIndex);
            this.options.onStateChange?.({ slot, trackIndex: index, state: 'failed', error,
                restoredTrackIndex });
        } finally {
            if (current()) this.schedulePrefetch();
        }
    }

    restoreDesiredTrack(slot: SubtitleSlot, index = -1) {
        if (index < 0) this.desiredTracks.delete(slot);
        else this.desiredTracks.set(slot, index);
    }

    getSessions() {
        const api = this.api();
        return withSubtitleTimeout(api.getSessions({ deviceId: api.deviceId() }), 'Playback session lookup', 10_000);
    }

    async refreshDeliveryMethods(isCurrent: () => boolean) {
        if (this.deliveryResolved) return;
        if (this.playback.playMethod !== 'DirectPlay' && this.options.burnInWhenTranscoding()) {
            const sessions = await this.getSessions();
            if (!isCurrent()) return;
            const info = sessions[0]?.TranscodingInfo;
            this.updateDeliveryMethods(info);
            // Startup may precede server session registration; do not freeze an unknown mode.
            if (typeof info?.IsVideoDirect !== 'boolean') return;
        } else {
            this.updateDeliveryMethods();
        }
        this.deliveryResolved = true;
    }

    updateDeliveryMethods(info?: { IsVideoDirect?: boolean | null } | null) {
        for (const stream of this.playback.mediaSource.MediaStreams) {
            if (stream.Type !== 'Subtitle') continue;
            if (info && !info.IsVideoDirect) {
                stream.realDeliveryMethod ??= stream.DeliveryMethod;
                stream.DeliveryMethod = 'Encode';
            } else {
                stream.DeliveryMethod = stream.realDeliveryMethod ?? stream.DeliveryMethod;
            }
        }
    }

    clear(slot?: SubtitleSlot) {
        this.stopPrefetch();
        if (slot === undefined) {
            this.selections.clear();
            this.desiredTracks.clear();
        } else {
            this.selections.delete(slot);
            this.desiredTracks.delete(slot);
        }
        this.pipeline.clear(slot);
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.stopPrefetch();
        this.disposeResources();
        this.diagnostic.record('source-disposed', { source: this.diagnostic.id });
        for (const event of this.mediaEvents) this.videoElement.removeEventListener(event, this.onMediaEvent);
        this.selections.clear();
        this.desiredTracks.clear();
        this.pipeline.dispose();
        this.selectionDiagnostics.clear();
        this.preparedSubtitles.clear();
        this.defaultFont = undefined;
    }

    onMediaEvent = (event: Event) => {
        this.diagnostic.record(`media-${event.type}`, { source: this.diagnostic.id,
            mediaTime: this.videoElement.currentTime, readyState: this.videoElement.readyState,
            playbackRate: this.videoElement.playbackRate, paused: this.videoElement.paused });
    };

    stopPrefetch() {
        window.clearTimeout(this.prefetchTimer);
        if (this.prefetch) this.prefetchAttempted.delete(this.prefetch.index);
        this.prefetch?.controller.abort('selection-cancelled');
        this.prefetch = undefined;
    }

    backgroundTracks() {
        return this.playback.mediaSource.MediaStreams.filter(track =>
            track.Type === 'Subtitle' && track.DeliveryMethod === 'External'
            && this.options.useManagedTrack(track));
    }

    schedulePrefetch(delay = 1500) {
        if (this.disposed || this.prefetch) return;
        window.clearTimeout(this.prefetchTimer);
        this.prefetchTimer = window.setTimeout(() => {
            if (this.disposed || [...this.pipeline.slots.values()].some(state => state.loading)) return;
            const tracks = this.backgroundTracks();
            if (tracks.length && tracks.every(track => this.preparedSubtitles.has(track.Index))) {
                if (this.backgroundStarted && !this.backgroundNotified) {
                    this.backgroundNotified = true;
                    this.diagnostic.record('prefetch-all-ready', { count: tracks.length });
                    this.options.onBackgroundSubtitlesReady?.();
                }
                return;
            }
            const alternative = tracks.find(track => !this.preparedSubtitles.has(track.Index)
                && !this.prefetchAttempted.has(track.Index));
            if (!alternative) return;
            this.prefetchAttempted.add(alternative.Index);
            this.backgroundStarted = true;
            const controller = new AbortController();
            this.prefetch = { index: alternative.Index, controller };
            const diagnostic = new SubtitleDiagnosticTrace({ source: this.diagnostic.id, trackIndex: alternative.Index });
            const timeout = window.setTimeout(() => controller.abort('preparation-timeout'), 30_000);
            diagnostic.record('prefetch-start');
            // Prepare every downloadable text track, one at a time, without creating renderers.
            void (async () => {
                if (ASS_CODECS.includes((alternative.Codec || '').toLowerCase())) {
                    await this.loadDefaultFont(controller.signal, diagnostic);
                }
                await this.prepareResources(alternative, controller.signal, diagnostic, 1);
                if (!controller.signal.aborted && this.preparedSubtitles.has(alternative.Index)) diagnostic.record('prefetch-ready');
            })().catch(() => diagnostic.record('prefetch-unavailable')).finally(() => {
                window.clearTimeout(timeout);
                controller.abort('selection-cancelled');
                if (this.prefetch?.controller === controller) {
                    this.prefetch = undefined;
                    this.schedulePrefetch(0);
                }
            });
        }, delay);
    }

    async loadDefaultFont(signal: AbortSignal, diagnostic: SubtitleDiagnosticTrace) {
        if (this.defaultFont) return this.defaultFont;
        const font = await this.loadFont(defaultFontUrl, signal, diagnostic);
        if (!this.disposed && !signal.aborted) this.defaultFont = font;
        return font;
    }

    async prepareResources(track: SessionTrack, signal: AbortSignal, diagnostic: SubtitleDiagnosticTrace, concurrency = 2) {
        const cached = this.preparedSubtitles.get(track.Index);
        if (cached) {
            diagnostic.record('prepared-subtitle-hit');
            return cached;
        }
        let fontsComplete = true;
        const read = async (url: string) => {
            try {
                return await this.loadFont(url, signal, diagnostic);
            } catch (error) {
                fontsComplete = false;
                throw error;
            }
        };
        const isAss = ASS_CODECS.includes((track.Codec || '').toLowerCase());
        const [content, fonts] = await Promise.all([
            this.loadContent(track, signal, diagnostic),
            isAss ? diagnostic.measure('fonts-total', () => this.loadFonts(track, read, signal, diagnostic, concurrency)) : Promise.resolve([])
        ]);
        if (this.disposed || signal.aborted) throw new Error('Subtitle preparation cancelled');
        const prepared = { content, fonts };
        // Retain complete tracks for this source even when the bounded resource cache evicts files.
        if (fontsComplete) this.preparedSubtitles.set(track.Index, prepared);
        return prepared;
    }

    async createRenderer(track: SessionTrack, slot: SubtitleSlot, request: SubtitleLoadRequest) {
        const diagnostic = request.diagnostic || new SubtitleDiagnosticTrace();
        const controller = new AbortController();
        const cancel = request.onCancel(() => {
            controller.abort('selection-cancelled');
        });
        const timeout = window.setTimeout(() => {
            controller.abort('preparation-timeout');
        }, 30_000);
        let renderer: SubtitleRenderer | undefined;
        const cancelRenderer = request.onCancel(() => renderer?.dispose());
        try {
            this.record('fetching', slot, track.Index);
            const isAss = ASS_CODECS.includes((track.Codec || '').toLowerCase());
            const { content, fonts } = await this.prepareResources(track, controller.signal, diagnostic);
            if (!request.isCurrent() || controller.signal.aborted) throw new Error('Subtitle load cancelled or timed out');
            const baseOffset = (this.playback.transcodingOffsetTicks || 0) / 10_000_000;
            if (isAss) {
                diagnostic.record('ass-libass');
                this.record('initializing-ass', slot, track.Index);
                const defaultFont = await this.loadDefaultFont(controller.signal, diagnostic);
                const videoStream = this.playback.mediaSource.MediaStreams.find(stream => stream.Type === 'Video');
                renderer = await diagnostic.measure('ass-initialize', () => createPreparedLibassWasmRenderer({
                    video: this.videoElement, content, fonts: fonts.map(font => font.slice()),
                    defaultFont: defaultFont.slice(), baseOffset,
                    targetFps: videoStream?.ReferenceFrameRate || 24, request
                }));
            } else {
                renderer = new NativeTextRenderer(this.videoElement, content, baseOffset, this.options.getCueLine(slot));
                await diagnostic.measure('webvtt-parse', () => (renderer as NativeTextRenderer).load(request));
            }
            if (!request.isCurrent()) throw new Error('Subtitle selection cancelled');
            return renderer;
        } catch (error) {
            renderer?.dispose();
            if (ASS_CODECS.includes((track.Codec || '').toLowerCase()) && !this.defaultFont) {
                this.preparedSubtitles.delete(track.Index);
            }
            throw error;
        } finally {
            window.clearTimeout(timeout);
            controller.abort('selection-cancelled');
            cancel();
            cancelRenderer();
        }
    }
}
/* eslint-enable compat/compat */
