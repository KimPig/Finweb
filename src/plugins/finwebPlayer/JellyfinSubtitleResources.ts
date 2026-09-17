import { ServerConnections } from 'lib/jellyfin-apiclient';
import { resolveSubtitleFontBridge } from '../htmlVideoPlayer/subtitleFontBridgeResolver';
import { withSubtitleTimeout } from '../htmlVideoPlayer/subtitles/withSubtitleTimeout';
import { SubtitleDiagnosticTrace } from '../htmlVideoPlayer/subtitles/diagnostics';
import { fetchSubtitleResource } from '../htmlVideoPlayer/subtitles/resourceDiagnostics';
import { SubtitleResourceCache } from '../htmlVideoPlayer/subtitles/SubtitleResourceCache';

export interface SessionTrack {
    Index: number;
    Codec?: string | null;
    Type?: string | null;
    DeliveryMethod?: string | null;
    realDeliveryMethod?: string | null;
    IsExternal?: boolean;
    Language?: string | null;
    IsForced?: boolean;
    ReferenceFrameRate?: number | null;
}

export interface PlaybackOptions {
    item: { Id: string; ServerId: string };
    mediaSource: {
        Id: string;
        MediaStreams: SessionTrack[];
        MediaAttachments?: { MimeType?: string | null; DeliveryUrl: string }[] | null;
    };
    playMethod?: string;
    transcodingOffsetTicks?: number | null;
}

const ASS_CODECS = ['ass', 'ssa'];
const FONT_TYPES = /^(font\/|application\/(vnd\.ms-opentype|x-truetype-font|x-font-ttf|x-font-opentype))/i;

function ensureResourceActive(signal: AbortSignal) {
    if (signal.aborted) throw new Error('Subtitle resource cancelled');
}

/** Server resources only: no media clock, track selection or rendering ownership. */
export class JellyfinSubtitleResources {
    disposed = false;
    readonly subtitleResources = new SubtitleResourceCache<string>(16 * 1024 * 1024, 16);
    readonly fontResources = new SubtitleResourceCache<Uint8Array<ArrayBuffer>>(64 * 1024 * 1024, 64);
    readonly fontPlans = new Map<number, string[]>();

    constructor(readonly playback: PlaybackOptions,
        readonly getSubtitleUrl: (track: SessionTrack, item: PlaybackOptions['item']) => string) {}

    api() {
        const api = ServerConnections.getApiClient(this.playback.item.ServerId);
        if (!api) throw new Error('Jellyfin server connection is unavailable');
        return api;
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
        const url = this.getSubtitleUrl(track, this.playback.item);
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
    disposeResources() {
        this.disposed = true;
        this.subtitleResources.dispose();
        this.fontResources.dispose();
        this.fontPlans.clear();
    }
}
