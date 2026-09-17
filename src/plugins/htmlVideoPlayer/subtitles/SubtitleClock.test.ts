import { describe, expect, it, vi } from 'vitest';

import { SubtitleClock } from './SubtitleClock';

function createVideoFrameHarness() {
    const video = document.createElement('video');
    const callbacks = new Map<number, VideoFrameRequestCallback>();
    let nextHandle = 0;
    const requestVideoFrameCallback = vi.fn((callback: VideoFrameRequestCallback) => {
        const handle = ++nextHandle;
        callbacks.set(handle, callback);
        return handle;
    });
    const cancelVideoFrameCallback = vi.fn((handle: number) => {
        callbacks.delete(handle);
    });

    Object.defineProperties(video, {
        paused: { configurable: true, value: false },
        ended: { configurable: true, value: false },
        requestVideoFrameCallback: {
            configurable: true,
            value: requestVideoFrameCallback
        },
        cancelVideoFrameCallback: {
            configurable: true,
            value: cancelVideoFrameCallback
        }
    });

    return {
        video,
        callbacks,
        requestVideoFrameCallback,
        cancelVideoFrameCallback
    };
}

describe('SubtitleClock', () => {
    it('retains an immediately paused first frame across pipelines but resets while no pipeline exists', () => {
        const video = document.createElement('video');
        Object.defineProperty(video, 'readyState', { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA });
        const clock = new SubtitleClock(video);
        video.dispatchEvent(new Event('playing'));
        video.dispatchEvent(new Event('pause'));
        clock.dispose();
        expect(video.played.length).toBe(0);
        const replacement = new SubtitleClock(video);
        expect(replacement.snapshot().videoFramePresented).toBe(true);
        replacement.dispose();
        video.dispatchEvent(new Event('loadstart'));
        const nextSource = new SubtitleClock(video);
        expect(nextSource.snapshot().videoFramePresented).toBe(false);
        nextSource.dispose();
    });

    it('recovers presentation from real progress if supported frame callbacks stop arriving', () => {
        const harness = createVideoFrameHarness();
        Object.defineProperties(harness.video, {
            readyState: { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA },
            currentTime: { configurable: true, writable: true, value: 0 }
        });
        const clock = new SubtitleClock(harness.video);
        harness.video.dispatchEvent(new Event('playing'));
        expect(clock.snapshot().videoFramePresented).toBe(false);
        harness.video.currentTime = 0.25;
        harness.video.dispatchEvent(new Event('timeupdate'));
        expect(clock.snapshot().videoFramePresented).toBe(true);
        clock.dispose();
    });

    it('waits for a presented frame, retains it while paused, and rejects callbacks from the previous source', () => {
        const harness = createVideoFrameHarness();
        Object.defineProperty(harness.video, 'readyState', { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA });
        const clock = new SubtitleClock(harness.video);
        for (const event of ['loadedmetadata', 'loadeddata', 'canplay', 'playing']) {
            harness.video.dispatchEvent(new Event(event));
            expect(clock.snapshot().videoFramePresented).toBe(false);
        }
        const callback = [...harness.callbacks.values()][0];
        callback(0, {} as VideoFrameCallbackMetadata);
        expect(clock.snapshot().videoFramePresented).toBe(true);
        for (const event of ['pause', 'waiting', 'seeking', 'seeked', 'ratechange']) {
            harness.video.dispatchEvent(new Event(event));
            expect(clock.snapshot().videoFramePresented).toBe(true);
        }
        const stale = [...harness.callbacks.values()].at(-1)!;
        harness.video.dispatchEvent(new Event('emptied'));
        stale(1, {} as VideoFrameCallbackMetadata);
        expect(clock.snapshot().videoFramePresented).toBe(false);
        clock.dispose();
        stale(2, {} as VideoFrameCallbackMetadata);
        expect(clock.snapshot().videoFramePresented).toBe(false);
    });

    it('does not treat preloaded paused frames as playback and supports the playing fallback', () => {
        const harness = createVideoFrameHarness();
        Object.defineProperties(harness.video, {
            paused: { configurable: true, value: true },
            readyState: { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA }
        });
        const clock = new SubtitleClock(harness.video);
        clock.onVideoFrame(0, {} as VideoFrameCallbackMetadata);
        expect(clock.snapshot().videoFramePresented).toBe(false);
        clock.dispose();
        const video = document.createElement('video');
        Object.defineProperty(video, 'readyState', { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA });
        const fallback = new SubtitleClock(video);
        video.dispatchEvent(new Event('loadeddata'));
        expect(fallback.snapshot().videoFramePresented).toBe(false);
        video.dispatchEvent(new Event('playing'));
        expect(fallback.snapshot().videoFramePresented).toBe(true);
        video.dispatchEvent(new Event('pause'));
        expect(fallback.snapshot().videoFramePresented).toBe(true);
        fallback.dispose();
    });

    it('recognizes an already played paused video when a pipeline attaches late', () => {
        const video = document.createElement('video');
        Object.defineProperties(video, {
            readyState: { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA },
            played: { configurable: true, value: { length: 1 } }
        });
        const clock = new SubtitleClock(video);
        expect(clock.snapshot().videoFramePresented).toBe(true);
        clock.dispose();
    });

    it('recovers from waiting when decoded frames advance without another playing event', () => {
        const harness = createVideoFrameHarness();
        const clock = new SubtitleClock(harness.video);
        Object.defineProperties(harness.video, {
            currentTime: { configurable: true, writable: true, value: 1 },
            readyState: { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA }
        });
        harness.video.dispatchEvent(new Event('waiting'));
        clock.onVideoFrame(0, {} as VideoFrameCallbackMetadata);
        expect(clock.snapshot().paused).toBe(true);
        harness.video.currentTime = 2;
        clock.onVideoFrame(1, {} as VideoFrameCallbackMetadata);
        expect(clock.snapshot().paused).toBe(false);
        clock.dispose();
    });

    it('uses timeupdate progress to recover on browsers without video frame callbacks', () => {
        const video = document.createElement('video');
        Object.defineProperties(video, {
            paused: { configurable: true, value: false },
            seeking: { configurable: true, writable: true, value: false },
            currentTime: { configurable: true, writable: true, value: 1 },
            readyState: { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA }
        });
        const clock = new SubtitleClock(video);
        video.dispatchEvent(new Event('waiting'));
        video.currentTime = 2;
        video.dispatchEvent(new Event('timeupdate'));
        expect(clock.snapshot().paused).toBe(false);
        Object.defineProperty(video, 'seeking', { configurable: true, value: true });
        video.dispatchEvent(new Event('seeking'));
        video.currentTime = 10;
        video.dispatchEvent(new Event('timeupdate'));
        expect(clock.snapshot().paused).toBe(true);
        clock.dispose();
    });

    it('cancels and rearms video-frame callbacks across repeated media sources', () => {
        const harness = createVideoFrameHarness();
        const clock = new SubtitleClock(harness.video);

        expect(harness.requestVideoFrameCallback).toHaveBeenCalledTimes(1);
        for (let source = 0; source < 20; source++) {
            harness.video.dispatchEvent(new Event('loadstart'));
            harness.video.dispatchEvent(new Event('loadedmetadata'));
            harness.video.dispatchEvent(new Event('playing'));
            expect(harness.callbacks.size).toBe(1);
        }

        expect(harness.cancelVideoFrameCallback).toHaveBeenCalledTimes(60);
        expect(harness.requestVideoFrameCallback).toHaveBeenCalledTimes(61);

        clock.dispose();
        expect(harness.callbacks.size).toBe(0);
        expect(harness.cancelVideoFrameCallback).toHaveBeenCalledTimes(61);
    });

    it('keeps the clock paused after seeking until playback actually resumes', () => {
        const harness = createVideoFrameHarness();
        const clock = new SubtitleClock(harness.video);
        const listener = vi.fn();
        clock.subscribe(listener);

        Object.defineProperty(harness.video, 'currentTime', {
            configurable: true,
            value: 0
        });
        harness.video.dispatchEvent(new Event('seeking'));
        harness.video.dispatchEvent(new Event('seeked'));

        expect(listener).toHaveBeenNthCalledWith(1, expect.objectContaining({
            currentTime: 0,
            paused: true,
            reason: 'seeking'
        }));
        expect(listener).toHaveBeenNthCalledWith(2, expect.objectContaining({
            currentTime: 0,
            paused: true,
            reason: 'seeked'
        }));

        harness.video.dispatchEvent(new Event('playing'));
        expect(listener).toHaveBeenNthCalledWith(3, expect.objectContaining({
            currentTime: 0,
            paused: false,
            reason: 'playing'
        }));

        clock.dispose();
    });

    it('does not resume subtitle time from canplay while media is still buffering', () => {
        const harness = createVideoFrameHarness();
        const clock = new SubtitleClock(harness.video);
        const listener = vi.fn();
        clock.subscribe(listener);

        harness.video.dispatchEvent(new Event('waiting'));
        harness.video.dispatchEvent(new Event('canplay'));
        harness.video.dispatchEvent(new Event('playing'));

        expect(listener).toHaveBeenNthCalledWith(1, expect.objectContaining({
            paused: true,
            reason: 'waiting'
        }));
        expect(listener).toHaveBeenNthCalledWith(2, expect.objectContaining({
            paused: true,
            reason: 'canplay'
        }));
        expect(listener).toHaveBeenNthCalledWith(3, expect.objectContaining({
            paused: false,
            reason: 'playing'
        }));

        clock.dispose();
    });

    it('pauses for encrypted-media waits and low-buffer stalls', () => {
        const harness = createVideoFrameHarness();
        const clock = new SubtitleClock(harness.video);
        const listener = vi.fn();
        clock.subscribe(listener);

        Object.defineProperty(harness.video, 'readyState', {
            configurable: true,
            value: HTMLMediaElement.HAVE_CURRENT_DATA
        });
        harness.video.dispatchEvent(new Event('stalled'));
        harness.video.dispatchEvent(new Event('playing'));
        harness.video.dispatchEvent(new Event('waitingforkey'));

        expect(listener).toHaveBeenNthCalledWith(1, expect.objectContaining({
            paused: true,
            reason: 'stalled'
        }));
        expect(listener).toHaveBeenNthCalledWith(3, expect.objectContaining({
            paused: true,
            reason: 'waitingforkey'
        }));

        clock.dispose();
    });
});
