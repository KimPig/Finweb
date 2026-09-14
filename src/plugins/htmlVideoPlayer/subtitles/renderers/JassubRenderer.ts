/* eslint-disable compat/compat -- JASSUB requires modern WASM/OffscreenCanvas browsers. */
import type JASSUB from 'jassub';
import defaultFontUrl from 'jassub/dist/default.woff2';
import { supportsJassub } from '../support';
import { SubtitleDiagnosticTrace } from '../diagnostics';
import type { SubtitleClockSnapshot, SubtitleLoadRequest, SubtitleRenderer } from '../types';

export function withSubtitleTimeout<T>(promise: Promise<T>, stage: string, milliseconds = 30_000): Promise<T> {
    return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error(`${stage} timed out`)), milliseconds);
        promise.then(value => {
            window.clearTimeout(timeout);
            resolve(value);
        }, error => {
            window.clearTimeout(timeout);
            reject(error);
        });
    });
}

interface Options {
    video: HTMLVideoElement;
    content: string;
    fonts: Uint8Array[];
    baseOffset: number;
    request: SubtitleLoadRequest;
    loadDefaultFont?(signal: AbortSignal): Promise<Uint8Array>;
}

export class JassubRenderer implements SubtitleRenderer {
    readonly host = document.createElement('div');
    readonly canvas = document.createElement('canvas');
    engine?: JASSUB;
    disposed = false;
    offset = 0;
    pending?: SubtitleClockSnapshot;
    drawing = false;
    size = '';
    ready = false;
    firstFrame?: { resolve(): void; reject(error: unknown): void };
    readonly observer: ResizeObserver;

    constructor(readonly options: Options) {
        this.host.className = 'finweb-ass-surface';
        Object.assign(this.host.style, { position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none', visibility: 'hidden', zIndex: '1' });
        Object.assign(this.canvas.style, { position: 'absolute', pointerEvents: 'none' });
        this.host.appendChild(this.canvas);
        options.video.parentElement!.appendChild(this.host);
        this.observer = new ResizeObserver(() => this.update(this.snapshot()));
        this.observer.observe(options.video);
    }

    snapshot(): SubtitleClockSnapshot {
        const video = this.options.video;
        return { currentTime: video.currentTime, paused: video.paused, playbackRate: video.playbackRate, reason: 'manual' };
    }

    async initialize() {
        const diagnostic = this.options.request.diagnostic || new SubtitleDiagnosticTrace();
        if (!supportsJassub()) throw new Error('This browser does not support the Finweb ASS renderer');
        const fontController = new AbortController();
        const cancel = this.options.request.onCancel(() => fontController.abort());
        const timer = window.setTimeout(() => fontController.abort(), 15_000);
        let defaultFont: Uint8Array;
        try {
            defaultFont = await diagnostic.measure('ass-default-font', async () => {
                if (this.options.loadDefaultFont) return this.options.loadDefaultFont(fontController.signal);
                const response = await fetch(defaultFontUrl, { signal: fontController.signal });
                if (!response.ok) throw new Error('Default subtitle font is unavailable');
                return new Uint8Array(await response.arrayBuffer());
            });
        } finally {
            window.clearTimeout(timer);
            cancel();
        }
        const { default: Engine } = await diagnostic.measure('ass-module', () => import('jassub'));
        if (this.disposed || !this.options.request.isCurrent()) throw new Error('Subtitle selection cancelled');
        // Canvas-only public API: the session's SubtitleClock is the sole clock.
        // No Worker interception and no second video-frame loop inside JASSUB.
        this.engine = new Engine({
            canvas: this.canvas,
            subContent: this.options.content,
            fonts: [defaultFont, ...this.options.fonts],
            availableFonts: { 'liberation sans': defaultFont },
            queryFonts: false
        });
        await diagnostic.measure('ass-worker-ready', () => withSubtitleTimeout(this.engine!.ready, 'ASS initialization'));
        await diagnostic.measure('ass-track-validation', () => withSubtitleTimeout(this.engine!.renderer.getStyles(), 'ASS track validation'));
        this.ready = true;
    }

    async activate(snapshot: SubtitleClockSnapshot) {
        const firstFrame = new Promise<void>((resolve, reject) => {
            this.firstFrame = { resolve, reject };
        });
        this.update(snapshot);
        await withSubtitleTimeout(firstFrame, 'ASS first frame');
        if (!this.disposed) this.host.style.visibility = 'visible';
    }

    setOffset(offset: number) {
        this.offset = offset;
    }

    update(snapshot: SubtitleClockSnapshot) {
        if (this.disposed) return;
        this.pending = snapshot;
        if (this.ready && !this.drawing) void this.draw();
    }

    async draw() {
        const engine = this.engine;
        if (!engine || this.disposed) return;
        this.drawing = true;
        try {
            while (this.pending && !this.disposed) {
                const snapshot = this.pending;
                this.pending = undefined;
                const video = this.options.video;
                if (!video.videoWidth || !video.videoHeight || !video.clientWidth || !video.clientHeight) continue;
                const { width, height } = this.layout();
                const size = `${width}:${height}`;
                Object.assign(this.canvas.style, {
                    width: `${width}px`, height: `${height}px`,
                    left: `${video.offsetLeft + (video.clientWidth - width) / 2}px`,
                    top: `${video.offsetTop + (video.clientHeight - height) / 2}px`
                });
                if (size !== this.size) {
                    await withSubtitleTimeout(engine.resize(false, width, height), 'ASS resize');
                    this.size = size;
                }
                if (this.disposed) break;
                engine.timeOffset = this.options.baseOffset + this.offset;
                await withSubtitleTimeout(engine.manualRender({
                    mediaTime: snapshot.currentTime, expectedDisplayTime: performance.now(),
                    width: video.videoWidth, height: video.videoHeight
                }, snapshot.reason !== 'frame'), 'ASS rendering');
                this.firstFrame?.resolve();
                if (this.firstFrame) this.options.request.diagnostic?.record('ass-first-render-ack');
                this.firstFrame = undefined;
            }
        } catch (error) {
            this.firstFrame?.reject(error);
            this.firstFrame = undefined;
            if (!this.disposed) this.options.request.reportRuntimeError(error);
        } finally {
            this.drawing = false;
        }
    }

    layout() {
        const video = this.options.video;
        const fit = getComputedStyle(video).objectFit;
        const scale = (fit === 'cover' ? Math.max : Math.min)(video.clientWidth / video.videoWidth, video.clientHeight / video.videoHeight);
        return {
            width: fit === 'fill' ? video.clientWidth : Math.max(1, Math.round(video.videoWidth * scale)),
            height: fit === 'fill' ? video.clientHeight : Math.max(1, Math.round(video.videoHeight * scale))
        };
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.pending = undefined;
        this.firstFrame?.reject(new Error('Subtitle renderer disposed'));
        this.firstFrame = undefined;
        this.observer.disconnect();
        this.host.remove();
        void this.engine?.destroy().catch(error => console.debug('ASS cleanup failed', error));
    }
}
/* eslint-enable compat/compat */
