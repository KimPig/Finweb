type PendingReport = {
    id: number;
    serverId: string;
    userId: string;
    done: Promise<void>;
};

const pending = new Set<PendingReport>();
let nextId = 0;

/** Keep Home's playback lists from loading before a stop report is saved. */
export function beginHomePlaybackReport(serverId: string, userId: string) {
    let finish!: () => void;
    const done = new Promise<void>(resolve => {
        finish = resolve;
    });
    const report = { id: ++nextId, serverId, userId, done };
    pending.add(report);

    return {
        id: report.id,
        finish: () => {
            pending.delete(report);
            finish();
        }
    };
}

export function getPendingHomePlaybackReports(serverId: string, userId: string) {
    const reports = Array.from(pending).filter(report => report.serverId === serverId && report.userId === userId);
    return reports.length ? {
        ids: reports.map(report => report.id),
        done: Promise.all(reports.map(report => report.done)).then(() => undefined)
    } : null;
}
