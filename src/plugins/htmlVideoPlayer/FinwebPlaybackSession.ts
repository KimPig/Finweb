/* eslint-disable compat/compat -- Modern browser playback; legacy bitmap/local paths stay in the host. */
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { resolveSubtitleFontBridge } from './subtitleFontBridgeResolver';
import { TextSubtitlePipeline } from './subtitles/TextSubtitlePipeline';
import { JassubRenderer, withSubtitleTimeout } from './subtitles/renderers/JassubRenderer';
import { NativeTextRenderer } from './subtitles/renderers/NativeTextRenderer';
import { SubtitleDiagnosticTrace, type SubtitleDiagnosticDetails } from './subtitles/diagnostics';
import { fetchSubtitleResource } from './subtitles/resourceDiagnostics';
import { SubtitleResourceCache } from './subtitles/SubtitleResourceCache';
import defaultFontUrl from 'jassub/dist/default.woff2';
import type { SubtitleLoadRequest, SubtitlePipelineStateChange, SubtitleSlot } from './subtitles/types';

export interface SessionTrack {
    Index: number;
    Codec?: string | null;
    Type?: string | null;
    DeliveryMethod?: string | null;
    realDeliveryMethod?: string | null;
    IsExternal?: boolean;
    Language?: string | null;
    IsForced?: boolean;
}

interface PlaybackOptions {
    item: { Id: string; ServerId: string };
    mediaSource: {
        Id: string;
        MediaStreams: SessionTrack[];
        MediaAttachments?: { MimeType?: string | null; DeliveryUrl: string }[] | null;
    };
    playMethod?: string;
    transcodingOffsetTicks?: number | null;
}

interface Options {
    videoElement: HTMLVideoElement;
    getPlaybackOptions(): PlaybackOptions;
    getSubtitleUrl(track: SessionTrack, item: PlaybackOptions['item']): string;
    onStateChange?(change: SubtitlePipelineStateChange): void;
    useManagedTrack(track: SessionTrack): boolean;
    renderLegacy(track: SessionTrack | null, slot: SubtitleSlot): void;
    prepareManaged(slot: SubtitleSlot): void;
    burnInWhenTranscoding(): boolean;
    getCueLine(slot: SubtitleSlot): number;
}

const ASS_CODECS = ['ass', 'ssa'];
const FONT_TYPES = /^(font\/|application\/(vnd\.ms-opentype|x-truetype-font|x-font-ttf|x-font-opentype))/i;

function ensureResourceActive(signal: AbortSignal) {
    if (signal.aborted) throw new Error('Subtitle resource cancelled');
}

/** One owner for a source's track choices, resource requests and presentation. */
export class FinwebPlaybackSession {
    readonly diagnostic = new SubtitleDiagnosticTrace();
    readonly selectionDiagnostics = new Map<SubtitleSlot, SubtitleDiagnosticTrace>();
    readonly mediaEvents = ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'playing', 'waiting', 'stalled', 'seeking', 'seeked', 'ratechange', 'pause', 'error'];
    readonly pipeline: TextSubtitlePipeline;
    readonly playback: PlaybackOptions;
    readonly identity: string;
    readonly selections = new Map<SubtitleSlot, symbol>();
    readonly desiredTracks = new Map<SubtitleSlot, number>();
    readonly diagnostics: { stage: string; slot: SubtitleSlot; trackIndex: number; time: number }[] = [];
    disposed = false;
    readonly subtitleResources = new SubtitleResourceCache<string>(16 * 1024 * 1024, 16);
    readonly fontResources = new SubtitleResourceCache<Uint8Array<ArrayBuffer>>(64 * 1024 * 1024, 64);
    readonly fontPlans = new Map<number, string[]>();
    prefetchTimer?: number;
    prefetch?: { index: number; controller: AbortController };
    prefetchAttempted = false;

    constructor(readonly options: Options) {
        this.playback = options.getPlaybackOptions();
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
                if (current() && this.pipeline.getActiveTrackIndex(slot) === index) this.schedulePrefetch(track);
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
        if (this.playback.playMethod !== 'DirectPlay' && this.options.burnInWhenTranscoding()) {
            const sessions = await this.getSessions();
            if (isCurrent()) this.updateDeliveryMethods(sessions[0]?.TranscodingInfo);
        } else {
            this.updateDeliveryMethods();
        }
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
        this.subtitleResources.dispose();
        this.fontResources.dispose();
        this.fontPlans.clear();
        this.diagnostic.record('source-disposed', { source: this.diagnostic.id });
        for (const event of this.mediaEvents) this.videoElement.removeEventListener(event, this.onMediaEvent);
        this.selections.clear();
        this.desiredTracks.clear();
        this.pipeline.dispose();
        this.selectionDiagnostics.clear();
    }

    onMediaEvent = (event: Event) => {
        this.diagnostic.record(`media-${event.type}`, { source: this.diagnostic.id,
            mediaTime: this.videoElement.currentTime, readyState: this.videoElement.readyState,
            playbackRate: this.videoElement.playbackRate, paused: this.videoElement.paused });
    };

    api() {
        const api = ServerConnections.getApiClient(this.playback.item.ServerId);
        if (!api) throw new Error('Jellyfin server connection is unavailable');
        return api;
    }

    stopPrefetch() {
        window.clearTimeout(this.prefetchTimer);
        this.prefetch?.controller.abort('selection-cancelled');
        this.prefetch = undefined;
    }

    schedulePrefetch(selected: SessionTrack) {
        if (this.prefetchAttempted || !selected.Language) return;
        const isAss = (track: SessionTrack) => ASS_CODECS.includes((track.Codec || '').toLowerCase());
        const alternative = this.playback.mediaSource.MediaStreams.find(track =>
            track.Type === 'Subtitle' && track.Index !== selected.Index
            && track.Language?.toLowerCase() === selected.Language?.toLowerCase()
            && !!track.IsForced === !!selected.IsForced
            && track.DeliveryMethod === 'External' && this.options.useManagedTrack(track)
            && isAss(track) !== isAss(selected));
        if (!alternative) return;
        window.clearTimeout(this.prefetchTimer);
        this.prefetchTimer = window.setTimeout(() => {
            if (this.disposed || [...this.pipeline.slots.values()].some(state => state.loading)) return;
            this.prefetchAttempted = true;
            const controller = new AbortController();
            this.prefetch = { index: alternative.Index, controller };
            const diagnostic = new SubtitleDiagnosticTrace({ source: this.diagnostic.id, trackIndex: alternative.Index });
            const timeout = window.setTimeout(() => controller.abort('preparation-timeout'), 30_000);
            diagnostic.record('prefetch-start');
            // One alternate track per video, sequential requests, never a renderer.
            void (async () => {
                await this.loadContent(alternative, controller.signal, diagnostic);
                if (isAss(alternative)) {
                    await this.loadFonts(alternative, url => this.loadFont(url, controller.signal, diagnostic), controller.signal, diagnostic, 1);
                    await this.loadFont(defaultFontUrl, controller.signal, diagnostic);
                }
                if (!controller.signal.aborted) diagnostic.record('prefetch-ready');
            })().catch(() => diagnostic.record('prefetch-unavailable')).finally(() => {
                window.clearTimeout(timeout);
                controller.abort('selection-cancelled');
                if (this.prefetch?.controller === controller) this.prefetch = undefined;
            });
        }, 1500);
    }

    async readResource(url: string, signal: AbortSignal, kind: 'subtitle' | 'font', diagnostic: SubtitleDiagnosticTrace) {
        ensureResourceActive(signal);
        const response = await fetchSubtitleResource(url, { signal, diagnostic, kind,
            abortReason: () => signal.reason === 'preparation-timeout' ? 'preparation-timeout' : 'selection-cancelled' });
        diagnostic.record(`${kind}-http`, { status: response.status });
        if (!response.ok) throw new Error(`Subtitle resource HTTP ${response.status}`);
        return response;
    }

    loadContent(track: SessionTrack, signal: AbortSignal, diagnostic: SubtitleDiagnosticTrace) {
        const url = this.options.getSubtitleUrl(track, this.playback.item);
        const key = JSON.stringify([track.Index, track.Codec, url]);
        const cacheTrace = new SubtitleDiagnosticTrace({ ...diagnostic.details, parentTrace: diagnostic.id, resourceKind: 'subtitle' });
        return this.subtitleResources.load(key, signal, async sharedSignal => diagnostic.measure('subtitle-download', async () => {
            const response = await diagnostic.measure('subtitle-response', () => this.readResource(url, sharedSignal, 'subtitle', diagnostic));
            const content = await diagnostic.measure('subtitle-body', () => response.text());
            if (!ASS_CODECS.includes((track.Codec || '').toLowerCase()) && !/^\uFEFF?WEBVTT(?:\s|$)/.test(content)) {
                throw new Error('Server did not return WebVTT subtitles');
            }
            return content;
        }), cacheTrace);
    }

    loadFont(url: string, signal: AbortSignal, diagnostic: SubtitleDiagnosticTrace) {
        const cacheTrace = new SubtitleDiagnosticTrace({ ...diagnostic.details, parentTrace: diagnostic.id, resourceKind: 'font' });
        return this.fontResources.load(url, signal, async sharedSignal => diagnostic.measure('font-download', async () => {
            const response = await this.readResource(url, sharedSignal, 'font', diagnostic);
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (!bytes.byteLength) throw new Error('Empty subtitle font');
            diagnostic.record('font-bytes', { bytes: bytes.byteLength });
            return bytes;
        }), cacheTrace);
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
        let renderer: JassubRenderer | NativeTextRenderer | undefined;
        const cancelRenderer = request.onCancel(() => renderer?.dispose());
        const read = (url: string) => this.loadFont(url, controller.signal, diagnostic);
        try {
            this.record('fetching', slot, track.Index);
            const contentPromise = this.loadContent(track, controller.signal, diagnostic);
            // Attach rejection handling immediately while font lookup is pending.
            const isAss = ASS_CODECS.includes((track.Codec || '').toLowerCase());
            const [content, fonts] = await Promise.all([
                contentPromise,
                isAss ? diagnostic.measure('fonts-total', () => this.loadFonts(track, read, controller.signal, diagnostic)) : Promise.resolve([])
            ]);
            if (!request.isCurrent() || controller.signal.aborted) throw new Error('Subtitle load cancelled or timed out');
            const baseOffset = (this.playback.transcodingOffsetTicks || 0) / 10_000_000;
            if (isAss) {
                renderer = new JassubRenderer({ video: this.videoElement, content, fonts: fonts.map(font => font.slice()), baseOffset, request,
                    loadDefaultFont: async signal => (await this.loadFont(defaultFontUrl, signal, diagnostic)).slice() });
                this.record('initializing-ass', slot, track.Index);
                await diagnostic.measure('ass-initialize', () => (renderer as JassubRenderer).initialize());
            } else {
                renderer = new NativeTextRenderer(this.videoElement, content, baseOffset, this.options.getCueLine(slot));
                await diagnostic.measure('webvtt-parse', () => (renderer as NativeTextRenderer).load(request));
            }
            if (!request.isCurrent()) throw new Error('Subtitle selection cancelled');
            return renderer;
        } catch (error) {
            renderer?.dispose();
            throw error;
        } finally {
            window.clearTimeout(timeout);
            controller.abort('selection-cancelled');
            cancel();
            cancelRenderer();
        }
    }

    async loadFonts(track: SessionTrack, read: (url: string) => Promise<Uint8Array<ArrayBuffer>>, signal: AbortSignal, diagnostic = new SubtitleDiagnosticTrace(), concurrency = 2) {
        ensureResourceActive(signal);
        const cachedPlan = this.fontPlans.get(track.Index);
        if (cachedPlan) {
            diagnostic.record('font-plan-hit', { count: cachedPlan.length });
            const loaded = await this.readFonts(cachedPlan, read, signal, diagnostic, concurrency);
            if (loaded.length === cachedPlan.length) return loaded;
            this.fontPlans.delete(track.Index);
            const attachments = this.attachmentUrls().filter(url => !cachedPlan.includes(url));
            loaded.push(...await this.readFonts(attachments, read, signal, diagnostic, concurrency));
            return loaded;
        }
        const api = this.api();
        const { item, mediaSource } = this.playback;
        const bridge = await diagnostic.measure('font-bridge', () => resolveSubtitleFontBridge(api, item.Id, mediaSource.Id, track.Index));
        diagnostic.record('font-bridge-result', { fullyResolved: bridge.fullyResolved, count: bridge.fontUrls.length });
        ensureResourceActive(signal);
        const attachments = this.attachmentUrls();
        const urls = bridge.fullyResolved ? [...bridge.fontUrls] : [...bridge.fontUrls, ...attachments];
        try {
            const config = await diagnostic.measure('font-config', () => withSubtitleTimeout(api.getNamedConfiguration('encoding'), 'Font configuration', 5_000)) as { EnableFallbackFont?: boolean };
            ensureResourceActive(signal);
            if (config.EnableFallbackFont) {
                const list = await diagnostic.measure('font-list', () => withSubtitleTimeout(api.getJSON(api.getUrl('FallbackFont/Fonts', { ApiKey: api.accessToken() })), 'Fallback font list', 5_000)) as { Name: string }[];
                urls.push(...list.map(font => api.getUrl(`FallbackFont/Fonts/${encodeURIComponent(font.Name)}`, { ApiKey: api.accessToken() })));
            }
        } catch {
            // Non-admin users or older servers may not expose this configuration.
        }
        ensureResourceActive(signal);
        const uniqueUrls = [...new Set(urls)];
        const loaded = await this.readFonts(uniqueUrls, read, signal, diagnostic, concurrency);
        // Reuse the complete set we could actually load for this playback even
        // when optional Bridge/configuration discovery was unavailable.
        if (!this.disposed && uniqueUrls.length && loaded.length === uniqueUrls.length) {
            if (this.fontPlans.size >= 16) this.fontPlans.delete(this.fontPlans.keys().next().value!);
            this.fontPlans.set(track.Index, uniqueUrls);
        } else if (bridge.fullyResolved && loaded.length < uniqueUrls.length) {
            loaded.push(...await this.readFonts(attachments.filter(url => !urls.includes(url)), read, signal, diagnostic, concurrency));
        }
        return loaded;
    }

    attachmentUrls() {
        return (this.playback.mediaSource.MediaAttachments || [])
            .filter(font => FONT_TYPES.test(font.MimeType || ''))
            .map(font => this.api().getUrl(font.DeliveryUrl));
    }

    async readFonts(urls: string[], read: (url: string) => Promise<Uint8Array<ArrayBuffer>>, signal: AbortSignal, diagnostic: SubtitleDiagnosticTrace, concurrency: number) {
        const loaded: Uint8Array<ArrayBuffer>[] = [];
        // Keep font priority deterministic while bounding simultaneous downloads.
        for (let index = 0; index < urls.length; index += concurrency) {
            ensureResourceActive(signal);
            const batch = await Promise.all(urls.slice(index, index + concurrency).map(async url => {
                try {
                    return await read(url);
                } catch {
                    diagnostic.record('font-unavailable');
                    return undefined;
                }
            }));
            loaded.push(...batch.filter((font): font is Uint8Array<ArrayBuffer> => !!font));
        }
        ensureResourceActive(signal);
        diagnostic.record('fonts-ready', { count: loaded.length });
        return loaded;
    }
}
/* eslint-enable compat/compat */
