import { createAssRendererAdapter } from './AssRendererAdapter';
import type { SubtitleClockSnapshot, SubtitleLoadRequest, SubtitleRenderer } from '../types';

interface Options {
    video: HTMLVideoElement;
    content: string;
    fonts: Uint8Array[];
    defaultFont: Uint8Array;
    baseOffset: number;
    targetFps: number;
    request: SubtitleLoadRequest;
}

class PreparedLibassWasmRenderer implements SubtitleRenderer {
    disposed = false;

    constructor(readonly renderer: SubtitleRenderer, readonly fontUrls: string[]) { }

    activate(snapshot: SubtitleClockSnapshot) { return this.renderer.activate(snapshot); }
    update(snapshot: SubtitleClockSnapshot) { this.renderer.update(snapshot); }
    setOffset(seconds: number) { this.renderer.setOffset(seconds); }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        try {
            this.renderer.dispose();
        } finally {
            this.fontUrls.forEach(url => {
                URL.revokeObjectURL(url);
            });
        }
    }
}

/** Render ASS using the session's prepared subtitle and font bytes. */
export async function createPreparedLibassWasmRenderer(options: Options): Promise<SubtitleRenderer> {
    const fontUrls = [options.defaultFont, ...options.fonts].map(font =>
        URL.createObjectURL(new Blob([font.slice()], { type: 'application/octet-stream' })));
    const libraryBase = new URL('libraries/', document.baseURI).href;
    try {
        const renderer = await createAssRendererAdapter({
            videoElement: options.video,
            subtitleContent: options.content,
            fonts: fontUrls,
            fallbackFont: fontUrls[0],
            workerUrl: `${libraryBase}subtitles-octopus-worker.js`,
            legacyWorkerUrl: `${libraryBase}subtitles-octopus-worker-legacy.js`,
            baseTimeOffsetSeconds: options.baseOffset,
            targetFps: options.targetFps,
            request: options.request
        });
        return new PreparedLibassWasmRenderer(renderer, fontUrls);
    } catch (error) {
        fontUrls.forEach(url => {
            URL.revokeObjectURL(url);
        });
        throw error;
    }
}
