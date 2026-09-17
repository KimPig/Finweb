import type {
    SubtitleClockReason,
    SubtitleClockSnapshot
} from './types';

type SubtitleClockListener = (snapshot: SubtitleClockSnapshot) => void;

interface VideoPresentation {
    framePresented: boolean;
    playbackStarted: boolean;
}

const presentations = new WeakMap<HTMLVideoElement, VideoPresentation>();

function getVideoPresentation(video: HTMLVideoElement): VideoPresentation {
    let state = presentations.get(video);
    if (!state) {
        const presented = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.played.length > 0;
        state = { framePresented: presented, playbackStarted: presented };
        presentations.set(video, state);
        // These two listeners follow the video, not a subtitle track or pipeline.
        // This also resets state if a source changes between subtitle pipelines.
        const presentation = state;
        const reset = () => {
            presentation.framePresented = false;
            presentation.playbackStarted = false;
        };
        video.addEventListener('loadstart', reset);
        video.addEventListener('emptied', reset);
    }
    return state;
}

const VIDEO_EVENTS = [
    'loadstart',
    'emptied',
    'loadedmetadata',
    'loadeddata',
    'canplay',
    'playing',
    'pause',
    'waiting',
    'stalled',
    'waitingforkey',
    'seeking',
    'seeked',
    'ratechange'
] as const;

const FRAME_LOOP_RESET_EVENTS = new Set<SubtitleClockReason>([
    'loadstart',
    'emptied',
    'loadedmetadata',
    'playing',
    'waiting',
    'stalled',
    'waitingforkey',
    'seeking',
    'seeked'
]);

export class SubtitleClock {
    readonly videoElement: HTMLVideoElement;
    readonly listeners = new Set<SubtitleClockListener>();
    disposed = false;
    buffering = false;
    readonly presentation: VideoPresentation;
    frameGeneration = 0;
    lastObservedTime: number;
    videoFrameHandle?: number;
    animationFrameHandle?: number;

    constructor(videoElement: HTMLVideoElement) {
        this.videoElement = videoElement;
        this.lastObservedTime = videoElement.currentTime;
        this.presentation = getVideoPresentation(videoElement);

        for (const eventName of VIDEO_EVENTS) {
            videoElement.addEventListener(eventName, this.onVideoEvent);
        }

        videoElement.addEventListener('timeupdate', this.onTimeUpdate);
        this.scheduleFrame();
    }

    subscribe(listener: SubtitleClockListener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    snapshot(reason: SubtitleClockReason = 'manual'): SubtitleClockSnapshot {
        return {
            currentTime: Number.isFinite(this.videoElement.currentTime) ? this.videoElement.currentTime : 0,
            videoFramePresented: this.presentation.framePresented,
            paused: this.videoElement.paused || this.videoElement.seeking || this.buffering,
            playbackRate: this.videoElement.playbackRate || 1,
            reason
        };
    }

    pulse(reason: SubtitleClockReason = 'manual') {
        if (this.disposed) return;

        const snapshot = this.snapshot(reason);
        for (const listener of this.listeners) {
            listener(snapshot);
        }
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;

        for (const eventName of VIDEO_EVENTS) {
            this.videoElement.removeEventListener(eventName, this.onVideoEvent);
        }
        this.videoElement.removeEventListener('timeupdate', this.onTimeUpdate);
        this.cancelScheduledFrame();
        this.listeners.clear();
    }

    onVideoEvent = (event: Event) => {
        const reason = event.type as SubtitleClockReason;
        if (reason === 'loadstart' || reason === 'emptied') {
            this.presentation.framePresented = false;
            this.presentation.playbackStarted = false;
        } else if (reason === 'playing') {
            this.presentation.playbackStarted = true;
            if (!this.videoElement.requestVideoFrameCallback
                && this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                this.presentation.framePresented = true;
            }
        }
        this.lastObservedTime = this.videoElement.currentTime;
        if (
            reason === 'loadstart'
            || reason === 'emptied'
            || reason === 'waiting'
            || reason === 'waitingforkey'
            || reason === 'seeking'
            || (reason === 'stalled' && this.videoElement.readyState < HTMLMediaElement.HAVE_FUTURE_DATA)
        ) {
            this.buffering = true;
        } else if (reason === 'playing') {
            this.buffering = false;
        }

        if (FRAME_LOOP_RESET_EVENTS.has(reason)) {
            this.cancelScheduledFrame();
        }

        this.pulse(reason);
        this.scheduleFrame();
    };

    onTimeUpdate = () => {
        // timeupdate is a fallback heartbeat for browsers and WebViews that
        // do not reliably deliver video-frame callbacks.
        this.observeProgress();
        this.pulse('frame');
        this.scheduleFrame();
    };

    onVideoFrame: VideoFrameRequestCallback = () => {
        if (this.disposed) return;
        this.videoFrameHandle = undefined;
        // Metadata and decoded data alone can still leave the poster on screen.
        if (this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
            && (this.presentation.playbackStarted || !this.videoElement.paused)) {
            this.presentation.framePresented = true;
        }
        this.observeProgress();
        this.pulse('frame');
        this.scheduleFrame();
    };

    onAnimationFrame = () => {
        this.animationFrameHandle = undefined;
        if (!this.videoElement.paused && !this.videoElement.ended && !this.buffering) {
            this.pulse('frame');
        }
        this.scheduleFrame();
    };

    observeProgress() {
        const video = this.videoElement;
        // Media-time progress also covers WebViews that silently miss frame callbacks.
        if (!video.paused && !video.seeking
            && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
            && video.currentTime > this.lastObservedTime) {
            this.presentation.framePresented = true;
        }
        if (
            this.buffering
            && !video.paused
            && !video.seeking
            && !video.ended
            && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
            && video.currentTime > this.lastObservedTime
        ) {
            this.buffering = false;
        }
        this.lastObservedTime = video.currentTime;
    }

    cancelScheduledFrame() {
        this.frameGeneration++;
        if (this.videoFrameHandle !== undefined) {
            this.videoElement.cancelVideoFrameCallback?.(this.videoFrameHandle);
            this.videoFrameHandle = undefined;
        }
        if (this.animationFrameHandle !== undefined) {
            cancelAnimationFrame(this.animationFrameHandle);
            this.animationFrameHandle = undefined;
        }
    }

    scheduleFrame() {
        if (this.disposed) return;

        if (this.videoElement.requestVideoFrameCallback) {
            if (this.videoFrameHandle === undefined) {
                const generation = this.frameGeneration;
                this.videoFrameHandle = this.videoElement.requestVideoFrameCallback((now, metadata) => {
                    if (generation === this.frameGeneration) this.onVideoFrame(now, metadata);
                });
            }
            return;
        }

        if (this.videoElement.paused || this.videoElement.ended || this.buffering) return;

        if (this.animationFrameHandle === undefined) {
            this.animationFrameHandle = requestAnimationFrame(this.onAnimationFrame);
        }
    }
}
