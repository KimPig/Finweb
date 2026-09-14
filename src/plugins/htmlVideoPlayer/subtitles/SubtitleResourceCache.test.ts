/* eslint-disable compat/compat -- Tests exercise the managed modern-browser playback path. */
import { describe, expect, it, vi } from 'vitest';
import { SubtitleResourceCache } from './SubtitleResourceCache';
import { SubtitleDiagnosticTrace } from './diagnostics';

const trace = new SubtitleDiagnosticTrace();
const signal = () => new AbortController().signal;

describe('per-video subtitle resource cache', () => {
    it('retains completed data and shares an in-flight request', async () => {
        const cache = new SubtitleResourceCache<string>(100, 5);
        const loader = vi.fn(async () => 'subtitle');
        expect(await Promise.all([cache.load('a', signal(), loader, trace), cache.load('a', signal(), loader, trace)])).toEqual(['subtitle', 'subtitle']);
        expect(await cache.load('a', signal(), loader, trace)).toBe('subtitle');
        expect(loader).toHaveBeenCalledTimes(1);
        cache.dispose();
    });

    it('does not cancel a shared download while another consumer needs it', async () => {
        const cache = new SubtitleResourceCache<string>(100, 5);
        const first = new AbortController();
        let complete!: (value: string) => void;
        let sharedSignal!: AbortSignal;
        const loader = vi.fn((input: AbortSignal) => {
            sharedSignal = input;
            return new Promise<string>(resolve => {
                complete = resolve;
            });
        });
        const a = cache.load('a', first.signal, loader, trace);
        const b = cache.load('a', signal(), loader, trace);
        const cancelled = expect(a).rejects.toThrow('cancelled');
        await Promise.resolve();
        first.abort();
        await cancelled;
        expect(sharedSignal.aborted).toBe(false);
        complete('ready');
        expect(await b).toBe('ready');
        cache.dispose();
    });

    it('aborts the final consumer and ignores a late successful completion', async () => {
        const cache = new SubtitleResourceCache<string>(100, 5);
        const controller = new AbortController();
        let complete!: (value: string) => void;
        let sharedSignal!: AbortSignal;
        const old = cache.load('a', controller.signal, input => {
            sharedSignal = input;
            return new Promise<string>(resolve => {
                complete = resolve;
            });
        }, trace);
        const cancelled = expect(old).rejects.toThrow('cancelled');
        await Promise.resolve();
        controller.abort('preparation-timeout');
        await cancelled;
        expect(sharedSignal.aborted).toBe(true);
        expect(sharedSignal.reason).toBe('preparation-timeout');
        expect(await cache.load('a', signal(), async () => 'new', trace)).toBe('new');
        complete('stale');
        await Promise.resolve();
        expect(await cache.load('a', signal(), async () => 'unexpected', trace)).toBe('new');
        cache.dispose();
    });

    it('retries a failed download instead of caching its rejection', async () => {
        const cache = new SubtitleResourceCache<string>(100, 5);
        await expect(cache.load('a', signal(), async () => {
            throw new Error('network');
        }, trace)).rejects.toThrow('network');
        expect(await cache.load('a', signal(), async () => 'ready', trace)).toBe('ready');
        cache.dispose();
    });

    it('bounds retained bytes and evicts the least recently used entry', async () => {
        const cache = new SubtitleResourceCache<string>(8, 10);
        const loader = vi.fn(async () => 'ab');
        await cache.load('a', signal(), loader, trace);
        await cache.load('b', signal(), loader, trace);
        await cache.load('a', signal(), loader, trace);
        await cache.load('c', signal(), loader, trace);
        await cache.load('a', signal(), loader, trace);
        expect(loader).toHaveBeenCalledTimes(3);
        await cache.load('b', signal(), loader, trace);
        expect(loader).toHaveBeenCalledTimes(4);
        cache.dispose();
    });

    it('bounds entry count and does not retain oversized data', async () => {
        const cache = new SubtitleResourceCache<string>(8, 1);
        const loader = vi.fn(async () => 'a');
        await cache.load('a', signal(), loader, trace);
        await cache.load('b', signal(), loader, trace);
        await cache.load('a', signal(), loader, trace);
        expect(loader).toHaveBeenCalledTimes(3);
        const big = vi.fn(async () => 'oversized');
        await cache.load('big', signal(), big, trace);
        await cache.load('big', signal(), big, trace);
        expect(big).toHaveBeenCalledTimes(2);
        cache.dispose();
    });

    it('disposes pending requests and refuses reuse in another video', async () => {
        const cache = new SubtitleResourceCache<string>(100, 5);
        const pending = cache.load('a', signal(), () => new Promise(() => undefined), trace);
        const rejected = expect(pending).rejects.toThrow('disposed');
        cache.dispose();
        await rejected;
        await expect(cache.load('a', signal(), async () => 'late', trace)).rejects.toThrow('cancelled');
    });

    it('does not fetch for an already cancelled consumer', async () => {
        const cache = new SubtitleResourceCache<string>(100, 5);
        const controller = new AbortController();
        controller.abort();
        const loader = vi.fn(async () => 'unused');
        await expect(cache.load('a', controller.signal, loader, trace)).rejects.toThrow('cancelled');
        expect(loader).not.toHaveBeenCalled();
        cache.dispose();
    });
});
/* eslint-enable compat/compat */
