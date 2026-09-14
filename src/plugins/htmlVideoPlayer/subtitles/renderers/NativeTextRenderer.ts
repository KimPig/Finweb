/* eslint-disable compat/compat -- Native text tracks are capability-checked by the player. */
import type { SubtitleLoadRequest, SubtitleRenderer } from '../types';

export class NativeTextRenderer implements SubtitleRenderer {
    request?: SubtitleLoadRequest;
    readonly element = document.createElement('track');
    readonly originalTimes = new Map<VTTCue, [number, number]>();
    readonly url: string;
    offset = 0;
    disposed = false;

    constructor(readonly video: HTMLVideoElement, content: string, readonly baseOffset: number, readonly line: number) {
        this.url = URL.createObjectURL(new Blob([content], { type: 'text/vtt' }));
        this.element.kind = 'subtitles';
        this.element.label = 'Finweb';
        this.element.srclang = 'und';
    }

    async load(request: SubtitleLoadRequest) {
        this.request = request;
        await new Promise<void>((resolve, reject) => {
            const finish = (error?: Error) => {
                window.clearTimeout(timeout);
                this.element.onload = null;
                this.element.onerror = null;
                unsubscribe();
                if (error) reject(error);
                else resolve();
            };
            const timeout = window.setTimeout(() => finish(new Error('WebVTT parsing timed out')), 15_000);
            let unsubscribe: () => void = () => undefined;
            unsubscribe = request.onCancel(() => finish(new Error('Subtitle selection cancelled')));
            this.element.onload = () => finish();
            this.element.onerror = () => finish(new Error('Unable to parse WebVTT subtitles'));
            this.element.src = this.url;
            this.video.appendChild(this.element);
            this.element.track.mode = 'hidden';
        });
        for (const cue of Array.from(this.element.track.cues || []) as VTTCue[]) {
            this.originalTimes.set(cue, [cue.startTime, cue.endTime]);
            if (cue.line === 'auto') cue.line = this.line;
        }
        this.setOffset(this.offset);
        request.diagnostic?.record('webvtt-cues-ready', { count: this.element.track.cues?.length || 0 });
    }

    activate() {
        if (!this.disposed) {
            this.element.track.addEventListener('cuechange', this.onCueChange);
            this.element.track.mode = 'showing';
            this.onCueChange();
        }
    }

    onCueChange = () => {
        const count = this.element.track.activeCues?.length || 0;
        if (this.disposed || !count) return;
        this.request?.diagnostic?.record('webvtt-first-active-cue', { count, mediaTime: this.video.currentTime });
        this.element.track.removeEventListener('cuechange', this.onCueChange);
    };

    update() {
        // Browser owns cue scheduling, including seeks and playback-rate changes.
    }

    setOffset(offset: number) {
        this.offset = offset;
        for (const [cue, [start, end]] of this.originalTimes) {
            cue.startTime = start - this.baseOffset - offset;
            cue.endTime = end - this.baseOffset - offset;
        }
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.element.track.removeEventListener('cuechange', this.onCueChange);
        this.element.track.mode = 'disabled';
        this.element.remove();
        URL.revokeObjectURL(this.url);
        this.originalTimes.clear();
    }
}
/* eslint-enable compat/compat */
