import type { SubtitleDiagnosticTrace } from './diagnostics';

type Resource = string | Uint8Array<ArrayBuffer>;
interface Pending<T> {
    controller: AbortController;
    promise: Promise<T>;
    consumers: number;
}

/** Completed resources belong to the video, not to a renderer or selection. */
export class SubtitleResourceCache<T extends Resource> {
    private readonly entries = new Map<string, T>();
    private readonly pending = new Map<string, Pending<T>>();
    private bytes = 0;
    private disposed = false;

    constructor(private readonly maxBytes: number, private readonly maxEntries: number) { }

    private size(value: T) { return typeof value === 'string' ? value.length * 2 : value.byteLength; }

    private remember(key: string, value: T) {
        const bytes = this.size(value);
        if (bytes > this.maxBytes) return;
        while (this.entries.size && (this.bytes + bytes > this.maxBytes || this.entries.size >= this.maxEntries)) {
            const oldest = this.entries.keys().next().value!;
            this.bytes -= this.size(this.entries.get(oldest)!);
            this.entries.delete(oldest);
        }
        this.entries.set(key, value);
        this.bytes += bytes;
    }

    async load(key: string, signal: AbortSignal, loader: (signal: AbortSignal) => Promise<T>, diagnostic: SubtitleDiagnosticTrace): Promise<T> {
        if (this.disposed || signal.aborted) throw new Error('Subtitle resource cancelled');
        const cached = this.entries.get(key);
        if (cached !== undefined) {
            this.entries.delete(key);
            this.entries.set(key, cached);
            diagnostic.record('cache-hit', { bytes: this.size(cached) });
            return cached;
        }
        let pending = this.pending.get(key);
        diagnostic.record(pending ? 'cache-join' : 'cache-miss');
        if (!pending) {
            const controller = new AbortController();
            const created: Pending<T> = { controller, consumers: 0, promise: Promise.resolve().then(() => loader(controller.signal)) };
            created.promise = created.promise.then(value => {
                if (!this.disposed && !controller.signal.aborted) this.remember(key, value);
                return value;
            }).finally(() => {
                if (this.pending.get(key) === created) this.pending.delete(key);
            });
            this.pending.set(key, created);
            pending = created;
        }
        return this.consume(key, pending, signal);
    }

    private consume(key: string, pending: Pending<T>, signal: AbortSignal): Promise<T> {
        pending.consumers++;
        return new Promise((resolve, reject) => {
            let finished = false;
            const finish = (work: () => void) => {
                if (finished) return;
                finished = true;
                signal.removeEventListener('abort', cancel);
                pending.controller.signal.removeEventListener('abort', disposed);
                if (--pending.consumers === 0 && this.pending.get(key) === pending) {
                    this.pending.delete(key);
                    pending.controller.abort(signal.reason);
                }
                work();
            };
            const cancel = () => finish(() => reject(new Error('Subtitle resource cancelled')));
            const disposed = () => finish(() => reject(new Error('Subtitle resource disposed')));
            signal.addEventListener('abort', cancel, { once: true });
            pending.controller.signal.addEventListener('abort', disposed, { once: true });
            pending.promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
        });
    }

    dispose() {
        this.disposed = true;
        this.entries.clear();
        this.bytes = 0;
        for (const pending of this.pending.values()) pending.controller.abort('selection-cancelled');
        this.pending.clear();
    }
}
