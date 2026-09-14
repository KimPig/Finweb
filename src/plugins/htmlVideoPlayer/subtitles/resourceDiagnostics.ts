/* eslint-disable compat/compat -- Diagnostic streaming is capability-gated; normal fetch is unchanged. */
import { getSubtitleDiagnosticEpoch, SubtitleDiagnosticTrace, type SubtitleDiagnosticDetails } from './diagnostics';

interface Options {
    signal: AbortSignal;
    diagnostic: SubtitleDiagnosticTrace;
    kind: 'subtitle' | 'font';
    abortReason(): 'selection-cancelled' | 'preparation-timeout' | 'aborted';
}

const INTERVAL_MS = 2000;

class ResourceMonitor {
    readonly trace: SubtitleDiagnosticTrace;
    readonly epoch = getSubtitleDiagnosticEpoch();
    bytes = 0;
    chunks = 0;
    lastByteAt?: number;
    lastProgressAt = performance.now();
    lastTickAt = performance.now();
    headersAt?: number;
    finished = false;
    readonly timer: number;

    constructor(readonly options: Options) {
        this.trace = new SubtitleDiagnosticTrace({ ...options.diagnostic.details,
            parentTrace: options.diagnostic.id, resourceKind: options.kind });
        this.record('resource-request');
        this.timer = window.setInterval(() => {
            if (this.epoch !== getSubtitleDiagnosticEpoch()) {
                this.cleanup();
                return;
            }
            const now = performance.now();
            if (now - this.trace.started >= 60_000) {
                this.finish('observation-limit');
                return;
            }
            this.record('resource-wait', { timerLagMs: Math.max(0, Math.round(now - this.lastTickAt - INTERVAL_MS)) });
            this.lastTickAt = now;
        }, INTERVAL_MS);
        options.signal.addEventListener('abort', this.onAbort, { once: true });
        if (options.signal.aborted) this.onAbort();
    }

    record(stage: string, details: SubtitleDiagnosticDetails = {}) {
        if (this.finished && stage !== 'resource-end') return;
        if (this.epoch !== getSubtitleDiagnosticEpoch()) return;
        const now = performance.now();
        this.trace.record(stage, { bytes: this.bytes, count: this.chunks,
            idleMs: Math.round(now - (this.lastByteAt ?? this.headersAt ?? this.trace.started)),
            visibility: document.visibilityState as SubtitleDiagnosticDetails['visibility'], ...details });
    }

    headers(response: Response) {
        this.headersAt = performance.now();
        const length = response.headers.get('Content-Length');
        const contentLength = length && /^\d+$/.test(length) ? Number(length) : undefined;
        this.record('resource-headers', { status: response.status, contentLength,
            encoding: (response.headers.get('Content-Encoding') || 'unknown') as SubtitleDiagnosticDetails['encoding'] });
    }

    chunk(bytes: number) {
        if (this.finished) return;
        this.bytes += bytes;
        this.chunks++;
        const first = this.lastByteAt === undefined;
        this.lastByteAt = performance.now();
        if (first || this.lastByteAt - this.lastProgressAt >= INTERVAL_MS) {
            this.record(first ? 'resource-first-byte' : 'resource-progress');
            this.lastProgressAt = this.lastByteAt;
        }
    }

    onAbort = () => this.finish(this.options.abortReason());

    finish(outcome: SubtitleDiagnosticDetails['outcome']) {
        if (this.finished) return;
        this.finished = true;
        this.record('resource-end', { outcome });
        this.cleanup();
    }

    cleanup() {
        window.clearInterval(this.timer);
        this.options.signal.removeEventListener('abort', this.onAbort);
    }
}

/** Observe bytes in the consumer's stream, without cloning or eagerly buffering a second copy. */
export async function fetchSubtitleResource(url: string, options: Options): Promise<Response> {
    if (getSubtitleDiagnosticEpoch() === undefined) return fetch(url, { signal: options.signal });
    const monitor = new ResourceMonitor(options);
    let response: Response;
    try {
        response = await fetch(url, { signal: options.signal });
        monitor.headers(response);
    } catch (error) {
        monitor.finish(options.signal.aborted ? options.abortReason() : 'fetch-error');
        throw error;
    }
    if (!response.ok || !response.body) {
        monitor.finish(response.ok ? 'complete' : 'http-error');
        return response;
    }
    if (typeof ReadableStream === 'undefined' || !response.body.getReader) {
        monitor.finish('unobserved');
        return response;
    }
    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const result = await reader.read();
                if (result.done) {
                    monitor.finish('complete');
                    reader.releaseLock();
                    controller.close();
                } else {
                    if (result.value.byteLength) monitor.chunk(result.value.byteLength);
                    controller.enqueue(result.value);
                }
            } catch (error) {
                monitor.finish(options.signal.aborted ? options.abortReason() : 'body-error');
                reader.releaseLock();
                controller.error(error);
            }
        },
        async cancel(reason) {
            monitor.finish('consumer-cancelled');
            try {
                await reader.cancel(reason);
            } finally {
                reader.releaseLock();
            }
        }
    });
    // Native text()/arrayBuffer() still perform decoding/assembly after observation.
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}
/* eslint-enable compat/compat */
