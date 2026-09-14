import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubtitleRenderer } from './subtitles/types';

const mocks = vi.hoisted(() => ({ renderers: [] as SubtitleRenderer[], fontInputs: [] as number[][], sessions: vi.fn(), bridge: vi.fn(), config: vi.fn(), fontList: vi.fn() }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApiClient: () => ({
    getSessions: mocks.sessions, deviceId: () => 'device', accessToken: () => 'token',
    getUrl: (path: string) => path, getNamedConfiguration: mocks.config, getJSON: mocks.fontList
}) } }));
vi.mock('./subtitleFontBridgeResolver', () => ({ resolveSubtitleFontBridge: mocks.bridge }));
vi.mock('./subtitles/renderers/NativeTextRenderer', () => ({
    NativeTextRenderer: class {
        constructor() { mocks.renderers.push(this); }
        load = vi.fn().mockResolvedValue(undefined);
        activate = vi.fn();
        update = vi.fn();
        setOffset = vi.fn();
        dispose = vi.fn();
    }
}));
vi.mock('./subtitles/renderers/JassubRenderer', async importOriginal => {
    const original = await importOriginal<typeof import('./subtitles/renderers/JassubRenderer')>();
    return { ...original, JassubRenderer: class {
        constructor(options: { fonts: Uint8Array[] }) {
            mocks.renderers.push(this);
            for (const font of options.fonts) {
                mocks.fontInputs.push([...font]);
                font.fill(0);
            }
        }
        initialize = vi.fn().mockResolvedValue(undefined);
        activate = vi.fn();
        update = vi.fn();
        setOffset = vi.fn();
        dispose = vi.fn();
    } };
});

import { FinwebPlaybackSession } from './FinwebPlaybackSession';

const live: FinwebPlaybackSession[] = [];
function create(transcode = false) {
    const video = document.createElement('video');
    const onStateChange = vi.fn();
    const session = new FinwebPlaybackSession({
        videoElement: video, onStateChange,
        getPlaybackOptions: () => ({ item: { Id: 'item', ServerId: 'server' }, playMethod: transcode ? 'Transcode' : 'DirectPlay',
            mediaSource: { Id: 'source', MediaStreams: [
                { Type: 'Subtitle', Index: 3, Codec: 'srt' },
                { Type: 'Subtitle', Index: 7, Codec: 'ass' }
            ] } }),
        getSubtitleUrl: track => `/subtitles/${track.Index}`,
        useManagedTrack: () => true, renderLegacy: vi.fn(), prepareManaged: vi.fn(),
        burnInWhenTranscoding: () => transcode, getCueLine: () => -1
    });
    live.push(session);
    mocks.bridge.mockResolvedValue({ fontUrls: [], fullyResolved: false });
    mocks.config.mockResolvedValue({ EnableFallbackFont: false });
    mocks.fontList.mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('WEBVTT\n\n')));
    return { session, onStateChange };
}

afterEach(() => {
    live.splice(0).forEach(session => {
        session.dispose();
    });
    mocks.renderers.length = 0;
    mocks.fontInputs.length = 0;
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('Finweb playback session', () => {
    it.each(['configuration-error', 'configuration-timeout', 'font-list-error'])('reuses attachment font plans after optional %s with no Bridge resolution', async failure => {
        vi.useFakeTimers();
        const { session } = create();
        session.playback.mediaSource.MediaAttachments = [{ MimeType: 'font/ttf', DeliveryUrl: '/attachment' }];
        if (failure === 'configuration-timeout') {
            mocks.config.mockImplementation(() => new Promise(() => undefined));
        } else if (failure === 'configuration-error') {
            mocks.config.mockRejectedValue(new Error('denied'));
        } else {
            mocks.config.mockResolvedValue({ EnableFallbackFont: true });
            mocks.fontList.mockRejectedValue(new Error('denied'));
        }
        const first = session.selectStream(7);
        await vi.advanceTimersByTimeAsync(5001);
        await first;
        expect(session.pipeline.getActiveTrackIndex(0)).toBe(7);
        expect(session.fontPlans.get(7)).toEqual(['/attachment']);
        await session.selectStream(3);
        mocks.config.mockImplementation(() => new Promise(() => undefined));
        // This must finish without advancing the 5-second timeout again.
        await session.selectStream(7);
        expect(session.pipeline.getActiveTrackIndex(0)).toBe(7);
        expect(mocks.bridge).toHaveBeenCalledTimes(1);
        expect(mocks.config).toHaveBeenCalledTimes(1);
        expect(mocks.fontList).toHaveBeenCalledTimes(failure === 'font-list-error' ? 1 : 0);
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('reuses both subtitle files, resolved font plan and isolated font bytes across off and repeated switches', async () => {
        const { session } = create();
        mocks.bridge.mockResolvedValue({ fontUrls: ['/font'], fullyResolved: true });
        vi.mocked(fetch).mockImplementation(async url => new Response(url === '/font' ? new Uint8Array([1, 2, 3]) : 'WEBVTT\n\n'));
        await session.selectStream(7);
        await session.selectStream(3);
        await session.selectStream(-1);
        await session.selectStream(7);
        await session.selectStream(3);
        expect(fetch).toHaveBeenCalledTimes(3);
        expect(mocks.bridge).toHaveBeenCalledTimes(1);
        expect(mocks.fontInputs).toEqual([[1, 2, 3], [1, 2, 3]]);
    });

    it('retries failed font data and does not retain an incomplete font plan', async () => {
        const { session } = create();
        mocks.bridge.mockResolvedValue({ fontUrls: ['/font'], fullyResolved: true });
        let fail = true;
        vi.mocked(fetch).mockImplementation(async url => {
            if (url === '/font') return new Response(fail ? '' : new Uint8Array([1]), { status: fail ? 503 : 200 });
            return new Response('WEBVTT\n\n');
        });
        await session.selectStream(7);
        expect(session.fontPlans.size).toBe(0);
        await session.selectStream(3);
        fail = false;
        await session.selectStream(7);
        expect(mocks.fontInputs).toEqual([[1]]);
        expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === '/font')).toHaveLength(2);
    });

    it('prefetches only one same-language alternate after the first renderer is ready', async () => {
        vi.useFakeTimers();
        const { session } = create();
        session.playback.mediaSource.MediaStreams.forEach(track => {
            track.Language = 'kor';
            track.DeliveryMethod = 'External';
        });
        await session.selectStream(7);
        expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(['/subtitles/7']);
        await vi.advanceTimersByTimeAsync(1500);
        expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(['/subtitles/7', '/subtitles/3']);
        expect(mocks.renderers).toHaveLength(1);
        await session.selectStream(3);
        await vi.advanceTimersByTimeAsync(1500);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('does not speculate across languages, forced tracks or when subtitles are off', async () => {
        vi.useFakeTimers();
        const { session } = create();
        const [srt, ass] = session.playback.mediaSource.MediaStreams;
        Object.assign(srt, { Language: 'eng', DeliveryMethod: 'External' });
        Object.assign(ass, { Language: 'kor', DeliveryMethod: 'External' });
        await session.selectStream(7);
        await vi.advanceTimersByTimeAsync(1500);
        expect(fetch).toHaveBeenCalledTimes(1);
        srt.Language = 'kor';
        srt.IsForced = true;
        await session.selectStream(7);
        await vi.advanceTimersByTimeAsync(1500);
        expect(fetch).toHaveBeenCalledTimes(1);
        srt.IsForced = false;
        await session.selectStream(7);
        await session.selectStream(-1);
        await vi.advanceTimersByTimeAsync(1500);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('joins an in-flight prefetch when selected without downloading its file twice', async () => {
        vi.useFakeTimers();
        const { session } = create();
        session.playback.mediaSource.MediaStreams.forEach(track => {
            Object.assign(track, { Language: 'kor', DeliveryMethod: 'External' });
        });
        await session.selectStream(7);
        let complete!: (response: Response) => void;
        vi.mocked(fetch).mockImplementation(() => new Promise(resolve => {
            complete = resolve;
        }));
        await vi.advanceTimersByTimeAsync(1500);
        const selection = session.selectStream(3);
        await vi.advanceTimersByTimeAsync(10);
        expect(fetch).toHaveBeenCalledTimes(2);
        complete(new Response('WEBVTT\n\n'));
        await selection;
        expect(session.pipeline.getActiveTrackIndex(0)).toBe(3);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('keeps prefetch failures silent and retries on explicit selection', async () => {
        vi.useFakeTimers();
        const { session, onStateChange } = create();
        session.playback.mediaSource.MediaStreams.forEach(track => {
            Object.assign(track, { Language: 'kor', DeliveryMethod: 'External' });
        });
        await session.selectStream(7);
        vi.mocked(fetch).mockImplementationOnce(async () => new Response('', { status: 503 }));
        await vi.advanceTimersByTimeAsync(1500);
        expect(session.pipeline.getActiveTrackIndex(0)).toBe(7);
        expect(onStateChange).not.toHaveBeenCalledWith(expect.objectContaining({ state: 'failed' }));
        await session.selectStream(3);
        expect(session.pipeline.getActiveTrackIndex(0)).toBe(3);
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('cancels an active prefetch when subtitles are disabled', async () => {
        vi.useFakeTimers();
        const { session } = create();
        session.playback.mediaSource.MediaStreams.forEach(track => {
            Object.assign(track, { Language: 'kor', DeliveryMethod: 'External' });
        });
        await session.selectStream(7);
        let signal: AbortSignal | undefined;
        vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_resolve, reject) => {
            signal = options?.signal || undefined;
            signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }));
        await vi.advanceTimersByTimeAsync(1500);
        expect(signal).toBeDefined();
        await session.selectStream(-1);
        expect(signal?.aborted).toBe(true);
        expect(session.pipeline.getActiveTrackIndex(0)).toBeUndefined();
    });

    it('preserves the active subtitle on a body timeout and retries the incomplete file', async () => {
        vi.useFakeTimers();
        const { session } = create();
        await session.selectStream(3);
        // eslint-disable-next-line compat/compat -- Simulate a stalled browser response body.
        vi.mocked(fetch).mockImplementation(async (_url, options) => new Response(new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('[Script Info]\n'));
                options?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')));
            }
        })));
        const pending = session.selectStream(7);
        await vi.advanceTimersByTimeAsync(30_001);
        await pending;
        expect(session.pipeline.getActiveTrackIndex(0)).toBe(3);
        expect(session.getTrackIndex(0)).toBe(3);
        vi.mocked(fetch).mockImplementation(async () => new Response('WEBVTT\n\n'));
        await session.selectStream(7);
        expect(session.pipeline.getActiveTrackIndex(0)).toBe(7);
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('rejects malformed WebVTT without caching it', async () => {
        const { session } = create();
        vi.mocked(fetch).mockImplementationOnce(async () => new Response('<html>error</html>'));
        await session.selectStream(3);
        expect(session.pipeline.getActiveTrackIndex(0)).toBeUndefined();
        await session.selectStream(3);
        expect(session.pipeline.getActiveTrackIndex(0)).toBe(3);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('restores delivery metadata previously changed by a burn-in session', async () => {
        const { session } = create();
        const track = session.playback.mediaSource.MediaStreams[0];
        track.realDeliveryMethod = 'External';
        track.DeliveryMethod = 'Encode';
        await session.selectStream(3);
        expect(track.DeliveryMethod).toBe('External');
        expect(session.pipeline.getActiveTrackIndex(0)).toBe(3);
    });

    it('selects sparse stream indices and keeps a ready renderer on reselection', async () => {
        const { session } = create();
        await session.selectStream(3);
        await session.selectStream(3);
        expect(session.getTrackIndex(0)).toBe(3);
        expect(mocks.renderers).toHaveLength(1);
    });

    it('aborts an outstanding resource request on off', async () => {
        const { session } = create();
        let signal: AbortSignal | undefined;
        vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_resolve, reject) => {
            signal = options?.signal || undefined;
            signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }));
        const selection = session.selectStream(3);
        await vi.waitFor(() => expect(signal).toBeDefined());
        await session.selectStream(-1);
        await selection;
        expect(signal?.aborted).toBe(true);
        expect(session.getTrackIndex(0)).toBeUndefined();
    });

    it('does not apply an old session lookup after off', async () => {
        const { session } = create(true);
        let resolve!: (value: unknown[]) => void;
        mocks.sessions.mockReturnValue(new Promise(done => {
            resolve = done;
        }));
        const selection = session.selectStream(7);
        await session.selectStream(-1);
        resolve([]);
        await selection;
        expect(fetch).not.toHaveBeenCalled();
        expect(session.getTrackIndex(0)).toBeUndefined();
    });

    it('reports desired selection while its session lookup is pending', async () => {
        const { session } = create(true);
        let resolve!: (value: unknown[]) => void;
        mocks.sessions.mockReturnValue(new Promise(done => {
            resolve = done;
        }));
        const selection = session.selectStream(3);
        expect(session.getTrackIndex(0)).toBe(3);
        session.dispose();
        resolve([]);
        await selection;
        expect(fetch).not.toHaveBeenCalled();
    });

    it('keeps both slots independent and clears both when primary is off', async () => {
        const { session } = create();
        await session.selectStream(3);
        await session.selectStream(7, 1);
        expect(session.getTrackIndex(1)).toBe(7);
        await session.selectStream(-1);
        expect(session.getTrackIndex(0)).toBeUndefined();
        expect(session.getTrackIndex(1)).toBeUndefined();
        expect(mocks.renderers.every(renderer => vi.mocked(renderer.dispose).mock.calls.length === 1)).toBe(true);
    });

    it('restores the previous track after an HTTP failure', async () => {
        const { session, onStateChange } = create();
        await session.selectStream(3);
        vi.mocked(fetch).mockResolvedValue(new Response('', { status: 503 }));
        await session.selectStream(7);
        expect(session.getTrackIndex(0)).toBe(3);
        expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({ state: 'failed', restoredTrackIndex: 3 }));
    });

    it('does not render text when the server is burning it into the video', async () => {
        const { session } = create(true);
        mocks.sessions.mockResolvedValue([{ TranscodingInfo: { IsVideoDirect: false } }]);
        await session.selectStream(7);
        expect(fetch).not.toHaveBeenCalled();
        expect(session.getTrackIndex(0)).toBeUndefined();
    });

    it('bounds diagnostics and never records subtitle URLs or contents', () => {
        const { session } = create();
        for (let index = 0; index < 200; index++) session.record('frame', 0, 7);
        expect(session.diagnostics).toHaveLength(100);
        expect(Object.keys(session.diagnostics[0]).sort((a, b) => a.localeCompare(b))).toEqual(['slot', 'stage', 'time', 'trackIndex']);
    });
});
