import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubtitleDiagnosticTrace, subtitleDiagnostics, type SubtitleDiagnosticDetails } from './diagnostics';

afterEach(() => {
    subtitleDiagnostics.stop();
    vi.restoreAllMocks();
});

describe('subtitle timing diagnostics', () => {
    it('does not record until explicitly enabled', () => {
        subtitleDiagnostics.start();
        subtitleDiagnostics.stop();
        new SubtitleDiagnosticTrace().record('disabled');
        expect(subtitleDiagnostics.snapshot().entries).toEqual([]);
    });

    it('measures wall-clock durations without using media time', async () => {
        subtitleDiagnostics.start();
        let now = 100;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        const trace = new SubtitleDiagnosticTrace({ source: 1, trackIndex: 7 });
        await trace.measure('subtitle-response', async () => {
            now = 10_100;
        });
        const entry = subtitleDiagnostics.snapshot().entries.at(-1);
        expect(entry).toMatchObject({ stage: 'subtitle-response', phase: 'end', durationMs: 10_000, elapsedMs: 10_000 });
    });

    it('records failure timing but never exception text or arbitrary metadata', async () => {
        subtitleDiagnostics.start();
        const trace = new SubtitleDiagnosticTrace({ codec: 'secret-url', url: 'secret-token' } as unknown as SubtitleDiagnosticDetails);
        const error = new Error('secret-auth-url');
        await expect(trace.measure('subtitle-response', () => Promise.reject(error))).rejects.toBe(error);
        const snapshot = subtitleDiagnostics.snapshot();
        expect(snapshot.entries.at(-1)).toMatchObject({ codec: 'other', phase: 'error' });
        expect(JSON.stringify(snapshot)).not.toContain('secret');
    });

    it('bounds memory and returns detached snapshots', () => {
        subtitleDiagnostics.start();
        const trace = new SubtitleDiagnosticTrace();
        for (let i = 0; i < 2500; i++) trace.record('sample', { count: i });
        const snapshot = subtitleDiagnostics.snapshot();
        expect(snapshot.entries).toHaveLength(2000);
        expect(snapshot.entries[0].count).toBe(500);
        snapshot.entries[0].count = -1;
        expect(subtitleDiagnostics.snapshot().entries[0].count).toBe(500);
    });

    it('does not attribute an old pending span to a restarted capture', async () => {
        subtitleDiagnostics.start();
        let complete!: () => void;
        const pending = new SubtitleDiagnosticTrace().measure('old', () => new Promise<void>(resolve => {
            complete = resolve;
        }));
        subtitleDiagnostics.start();
        complete();
        await pending;
        expect(subtitleDiagnostics.snapshot().entries).toEqual([]);
    });
});
