import { expect, it } from 'vitest';

import { beginHomePlaybackReport, getPendingHomePlaybackReports } from './pendingHomePlaybackReports';

it('waits for all matching stop reports without delaying another user or server', async () => {
    const first = beginHomePlaybackReport('server-a', 'user-a');
    const second = beginHomePlaybackReport('server-a', 'user-a');
    const other = beginHomePlaybackReport('server-b', 'user-a');
    const waiting = getPendingHomePlaybackReports('server-a', 'user-a');
    expect(waiting?.ids).toEqual([first.id, second.id]);
    expect(getPendingHomePlaybackReports('server-a', 'user-b')).toBeNull();

    let ready = false;
    void waiting?.done.then(() => {
        ready = true;
    });
    first.finish();
    await Promise.resolve();
    expect(ready).toBe(false);

    second.finish();
    await waiting?.done;
    expect(ready).toBe(true);
    expect(getPendingHomePlaybackReports('server-a', 'user-a')).toBeNull();
    other.finish();
});
