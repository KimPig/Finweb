/* eslint-disable compat/compat -- Tests exercise modern Fetch/Streams APIs. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubtitleDiagnosticTrace, subtitleDiagnostics } from './diagnostics';
import { fetchSubtitleResource } from './resourceDiagnostics';

const options = (controller = new AbortController(), kind: 'subtitle' | 'font' = 'subtitle') => ({
    signal: controller.signal, kind, diagnostic: new SubtitleDiagnosticTrace({ source: 1, slot: 0, trackIndex: 3 }),
    abortReason: () => 'selection-cancelled' as const
});
const entries = () => subtitleDiagnostics.snapshot().entries;
const mockFetch = (response: Response) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

afterEach(() => {
    subtitleDiagnostics.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('subtitle resource diagnostics', () => {
    it('leaves the original response and request options unchanged when disabled', async () => {
        subtitleDiagnostics.start();
        subtitleDiagnostics.stop();
        const original = new Response('WEBVTT');
        mockFetch(original);
        const config = options();
        expect(await fetchSubtitleResource('/subtitle', config)).toBe(original);
        expect(fetch).toHaveBeenCalledWith('/subtitle', { signal: config.signal });
        expect(entries()).toEqual([]);
    });

    it('distinguishes a late first byte, a mid-body stall and EOF while preserving UTF-8', async () => {
        vi.useFakeTimers();
        subtitleDiagnostics.start();
        let stream!: ReadableStreamDefaultController<Uint8Array>;
        const bytes = new TextEncoder().encode('\uFEFFWEBVTT\n\n\uD55C\uAE00');
        mockFetch(new Response(new ReadableStream({ start(controller) {
            stream = controller;
        } }), {
            headers: { 'Content-Length': String(bytes.length) }
        }));
        const response = await fetchSubtitleResource('/subtitle?secret', options());
        const text = response.text();
        await vi.advanceTimersByTimeAsync(2200);
        expect(entries().some(entry => entry.stage === 'resource-wait' && entry.bytes === 0)).toBe(true);
        stream.enqueue(bytes.slice(0, bytes.length - 2));
        await vi.advanceTimersByTimeAsync(2200);
        expect(entries().filter(entry => entry.stage === 'resource-first-byte')).toHaveLength(1);
        expect(entries().some(entry => entry.stage === 'resource-wait' && entry.bytes === bytes.length - 2)).toBe(true);
        stream.enqueue(bytes.slice(-2));
        await vi.advanceTimersByTimeAsync(2200);
        expect(entries().some(entry => entry.stage === 'resource-wait' && entry.bytes === bytes.length)).toBe(true);
        stream.close();
        expect(await text).toBe('WEBVTT\n\n\uD55C\uAE00');
        expect(entries().at(-1)).toMatchObject({ stage: 'resource-end', outcome: 'complete', bytes: bytes.length, count: 2 });
        expect(vi.getTimerCount()).toBe(0);
        expect(JSON.stringify(entries())).not.toContain('secret');
    });

    it.each(['selection-cancelled', 'preparation-timeout'] as const)('records %s separately and cleans up a stalled font', async reason => {
        vi.useFakeTimers();
        subtitleDiagnostics.start();
        const controller = new AbortController();
        mockFetch(new Response(new ReadableStream({
            start(stream) {
                controller.signal.addEventListener('abort', () => stream.error(new DOMException('secret', 'AbortError')));
                stream.enqueue(new Uint8Array([1, 2, 3]));
            }
        })));
        const response = await fetchSubtitleResource('/font', { ...options(controller, 'font'), abortReason: () => reason });
        const result = response.arrayBuffer().catch(error => error);
        await vi.advanceTimersByTimeAsync(2100);
        controller.abort();
        expect(await result).toBeInstanceOf(DOMException);
        expect(entries().filter(entry => entry.stage === 'resource-end')).toHaveLength(1);
        expect(entries().at(-1)).toMatchObject({ outcome: reason, resourceKind: 'font', bytes: 3 });
        expect(vi.getTimerCount()).toBe(0);
    });

    it('distinguishes HTTP rejection from fetch and body failures without exposing messages', async () => {
        subtitleDiagnostics.start();
        mockFetch(new Response('secret-body', { status: 503 }));
        const response = await fetchSubtitleResource('/secret', options());
        expect(response.status).toBe(503);
        expect(entries().at(-1)?.outcome).toBe('http-error');
        vi.mocked(fetch).mockRejectedValueOnce(new TypeError('secret-url'));
        await expect(fetchSubtitleResource('/secret', options())).rejects.toThrow('secret-url');
        expect(entries().at(-1)?.outcome).toBe('fetch-error');
        mockFetch(new Response(new ReadableStream({ start(stream) {
            stream.error(new Error('secret-body-error'));
        } })));
        const broken = await fetchSubtitleResource('/secret', options());
        await expect(broken.text()).rejects.toThrow('secret-body-error');
        expect(entries().at(-1)?.outcome).toBe('body-error');
        expect(JSON.stringify(entries())).not.toContain('secret');
    });

    it('identifies concurrent fonts independently and preserves binary bytes', async () => {
        subtitleDiagnostics.start();
        vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(new Uint8Array([0, 255, 1]))));
        const config = options(undefined, 'font');
        const responses = await Promise.all(['/a', '/b'].map(url => fetchSubtitleResource(url, config)));
        for (const response of responses) expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0, 255, 1]));
        const ends = entries().filter(entry => entry.stage === 'resource-end');
        expect(new Set(ends.map(entry => entry.trace)).size).toBe(2);
        expect(ends.every(entry => entry.parentTrace === config.diagnostic.id)).toBe(true);
    });

    it('does not leak old request events into a restarted capture', async () => {
        vi.useFakeTimers();
        subtitleDiagnostics.start();
        let stream!: ReadableStreamDefaultController<Uint8Array>;
        mockFetch(new Response(new ReadableStream({ start(controller) {
            stream = controller;
        } })));
        const response = await fetchSubtitleResource('/subtitle', options());
        const text = response.text();
        subtitleDiagnostics.start();
        await vi.advanceTimersByTimeAsync(2100);
        stream.close();
        await text;
        expect(entries()).toEqual([]);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('releases its timer when the consumer cancels the body', async () => {
        vi.useFakeTimers();
        subtitleDiagnostics.start();
        mockFetch(new Response(new ReadableStream()));
        const response = await fetchSubtitleResource('/subtitle', options());
        await response.body!.cancel();
        expect(entries().at(-1)?.outcome).toBe('consumer-cancelled');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('bounds observation time without cancelling an otherwise live request', async () => {
        vi.useFakeTimers();
        subtitleDiagnostics.start();
        let stream!: ReadableStreamDefaultController<Uint8Array>;
        mockFetch(new Response(new ReadableStream({ start(controller) {
            stream = controller;
        } })));
        const config = options();
        const response = await fetchSubtitleResource('/subtitle', config);
        const text = response.text();
        await vi.advanceTimersByTimeAsync(62_000);
        expect(entries().at(-1)?.outcome).toBe('observation-limit');
        expect(vi.getTimerCount()).toBe(0);
        expect(config.signal.aborted).toBe(false);
        stream.enqueue(new TextEncoder().encode('WEBVTT'));
        stream.close();
        expect(await text).toBe('WEBVTT');
        expect(entries().at(-1)?.outcome).toBe('observation-limit');
    });
});
/* eslint-enable compat/compat */
