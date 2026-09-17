export interface SubtitleDiagnosticDetails {
    source?: number;
    slot?: number;
    trackIndex?: number;
    codec?: 'ass' | 'ssa' | 'srt' | 'subrip' | 'vtt' | 'webvtt' | 'other';
    playMethod?: 'DirectPlay' | 'DirectStream' | 'Transcode' | 'other';
    delivery?: 'External' | 'Embed' | 'Encode' | 'Hls' | 'other';
    previousDelivery?: SubtitleDiagnosticDetails['delivery'];
    status?: number;
    count?: number;
    bytes?: number;
    parentTrace?: number;
    contentLength?: number;
    idleMs?: number;
    timerLagMs?: number;
    resourceKind?: 'subtitle' | 'font' | 'other';
    outcome?: 'complete' | 'http-error' | 'fetch-error' | 'body-error' | 'selection-cancelled' | 'preparation-timeout' | 'aborted' | 'consumer-cancelled' | 'unobserved' | 'observation-limit' | 'other';
    encoding?: 'gzip' | 'br' | 'deflate' | 'identity' | 'unknown' | 'other';
    visibility?: 'visible' | 'hidden' | 'other';
    mediaTime?: number;
    playbackRate?: number;
    readyState?: number;
    paused?: boolean;
    fullyResolved?: boolean;
    burnIn?: boolean;
    probeMode?: 'current' | 'minimal' | 'other';
    probePass?: number;
    total?: number;
    failures?: number;
    networkState?: number;
    bufferedEnd?: number;
    transferSize?: number;
    encodedBodySize?: number;
    decodedBodySize?: number;
    requestStart?: number;
    responseStart?: number;
    responseEnd?: number;
    probeMediaResource?: boolean;
    protocol?: 'http/1.1' | 'h2' | 'h3' | 'other';
}

interface Entry extends SubtitleDiagnosticDetails {
    trace: number;
    stage: string;
    phase: 'event' | 'start' | 'end' | 'error';
    atMs: number;
    elapsedMs: number;
    durationMs?: number;
}

const LIMIT = 2000;
const entries: Entry[] = [];
let enabled = false;
let epoch = 0;
let nextId = 0;

// Allowlisted scalar metadata only. Never accept errors, URLs, IDs or cue text.
// eslint-disable-next-line sonarjs/function-return-type -- Missing optional metadata remains undefined, not an invented value.
function knownValue<T extends string>(value: T | undefined, values: string[]): T | 'other' | undefined {
    return value && !values.includes(value) ? 'other' : value;
}

function safeDetails(details: SubtitleDiagnosticDetails): SubtitleDiagnosticDetails {
    const result: SubtitleDiagnosticDetails = {};
    for (const key of ['source', 'slot', 'trackIndex', 'status', 'count', 'bytes', 'parentTrace', 'contentLength', 'idleMs', 'timerLagMs', 'mediaTime', 'playbackRate', 'readyState', 'probePass', 'total', 'failures', 'networkState', 'bufferedEnd', 'transferSize', 'encodedBodySize', 'decodedBodySize', 'requestStart', 'responseStart', 'responseEnd'] as const) {
        const value = details[key];
        if (typeof value === 'number' && Number.isFinite(value)) result[key] = value;
    }
    for (const key of ['paused', 'fullyResolved', 'burnIn', 'probeMediaResource'] as const) {
        if (typeof details[key] === 'boolean') result[key] = details[key];
    }
    result.codec = knownValue(details.codec, ['ass', 'ssa', 'srt', 'subrip', 'vtt', 'webvtt']);
    result.probeMode = knownValue(details.probeMode, ['current', 'minimal']);
    result.protocol = knownValue(details.protocol, ['http/1.1', 'h2', 'h3']);
    result.playMethod = knownValue(details.playMethod, ['DirectPlay', 'DirectStream', 'Transcode']);
    result.resourceKind = knownValue(details.resourceKind, ['subtitle', 'font']);
    result.outcome = knownValue(details.outcome, ['complete', 'http-error', 'fetch-error', 'body-error', 'selection-cancelled', 'preparation-timeout', 'aborted', 'consumer-cancelled', 'unobserved', 'observation-limit']);
    result.encoding = knownValue(details.encoding, ['gzip', 'br', 'deflate', 'identity', 'unknown']);
    result.visibility = knownValue(details.visibility, ['visible', 'hidden']);
    for (const key of ['delivery', 'previousDelivery'] as const) {
        result[key] = knownValue(details[key], ['External', 'Embed', 'Encode', 'Hls']);
    }
    return result;
}

export function getSubtitleDiagnosticEpoch() {
    return enabled ? epoch : undefined;
}

export function isSubtitlePrefetchNoticeEnabled() {
    return typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).get('subtitlePrefetchNotice') === '1';
}

export class SubtitleDiagnosticTrace {
    readonly id = ++nextId;
    readonly started = performance.now();

    constructor(readonly details: SubtitleDiagnosticDetails = {}) { }

    record(stage: string, details: SubtitleDiagnosticDetails = {}, phase: Entry['phase'] = 'event', durationMs?: number) {
        if (!enabled) return;
        const now = performance.now();
        entries.push({ ...safeDetails({ ...this.details, ...details }), trace: this.id,
            stage, phase, atMs: Math.round(now), elapsedMs: Math.round(now - this.started),
            ...(durationMs === undefined ? {} : { durationMs: Math.round(durationMs) }) });
        if (entries.length > LIMIT) entries.splice(0, entries.length - LIMIT);
    }

    async measure<T>(stage: string, work: () => Promise<T>): Promise<T> {
        const started = performance.now();
        const recordingEpoch = epoch;
        this.record(stage, {}, 'start');
        try {
            const value = await work();
            if (recordingEpoch === epoch) this.record(stage, {}, 'end', performance.now() - started);
            return value;
        } catch (error) {
            if (recordingEpoch === epoch) this.record(stage, {}, 'error', performance.now() - started);
            throw error;
        }
    }
}

export const subtitleDiagnostics = {
    start() {
        entries.length = 0;
        epoch++;
        enabled = true;
        return 'Finweb subtitle timing enabled (memory only).';
    },
    stop() { enabled = false; },
    snapshot() {
        // eslint-disable-next-line compat/compat -- Older browsers use the current wall/monotonic clock difference.
        const timeOriginMs = performance.timeOrigin ?? Date.now() - performance.now();
        return { schema: 2, enabled, capacity: LIMIT, timeOriginMs,
            exportedAt: new Date().toISOString(), entries: entries.map(entry => ({ ...entry })) };
    },
    download() {
        const url = URL.createObjectURL(new Blob([JSON.stringify(this.snapshot(), null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'finweb-subtitle-diagnostics.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
};

declare global {
    interface Window {
        finwebSubtitleDiagnostics: typeof subtitleDiagnostics;
    }
}

if (typeof window !== 'undefined') {
    window.finwebSubtitleDiagnostics = subtitleDiagnostics;
    const query = new URLSearchParams(window.location.search);
    if (query.get('subtitleDiagnostics') === '1') subtitleDiagnostics.start();
}
