import type { QueryClient } from '@tanstack/react-query';

import { queryClient } from './queryClient';

/** Let a completed playback report replace the user's cached home lists. */
export async function refreshHomePlaybackQueries(userId: string, client: QueryClient = queryClient) {
    if (!userId) return;
    const keys = [
        ['User', userId, 'ResumeItems'],
        ['User', userId, 'NextUp']
    ];
    // A response started before the server saved playback must not repaint Home.
    await Promise.all(keys.map(queryKey => client.cancelQueries({ queryKey })));
    await Promise.all(keys.map(queryKey => client.invalidateQueries({ queryKey })));
}
