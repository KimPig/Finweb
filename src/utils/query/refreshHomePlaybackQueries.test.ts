import { QueryClient } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

import { refreshHomePlaybackQueries } from './refreshHomePlaybackQueries';

it('replaces fresh Resume/NextUp data for the reported user without clearing other lists', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
    const resumeKey = ['User', 'user-a', 'ResumeItems', { limit: 12 }];
    const nextUpKey = ['User', 'user-a', 'NextUp', { limit: 24 }];
    const otherUserKey = ['User', 'user-b', 'ResumeItems', { limit: 12 }];
    const itemsKey = ['User', 'user-a', 'Items'];
    let resume = ['A', 'B', 'C'];
    let nextUp = ['episode-1'];
    const readResume = vi.fn(() => Promise.resolve(resume));
    const readNextUp = vi.fn(() => Promise.resolve(nextUp));
    await Promise.all([
        client.fetchQuery({ queryKey: resumeKey, queryFn: readResume }),
        client.fetchQuery({ queryKey: nextUpKey, queryFn: readNextUp }),
        client.fetchQuery({ queryKey: otherUserKey, queryFn: () => Promise.resolve(['other']) }),
        client.fetchQuery({ queryKey: itemsKey, queryFn: () => Promise.resolve(['library']) })
    ]);
    resume = ['C', 'A', 'B'];
    nextUp = ['episode-2'];
    expect(await client.fetchQuery({ queryKey: resumeKey, queryFn: readResume })).toEqual(['A', 'B', 'C']);
    await refreshHomePlaybackQueries('user-a', client);
    expect(await client.fetchQuery({ queryKey: resumeKey, queryFn: readResume })).toEqual(['C', 'A', 'B']);
    expect(await client.fetchQuery({ queryKey: nextUpKey, queryFn: readNextUp })).toEqual(['episode-2']);
    expect(readResume).toHaveBeenCalledTimes(2);
    expect(readNextUp).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(otherUserKey)).toEqual(['other']);
    expect(client.getQueryData(itemsKey)).toEqual(['library']);
    client.clear();
});

it('cancels a home response begun before playback was reported', async () => {
    const client = new QueryClient();
    const queryKey = ['User', 'user-a', 'ResumeItems', { limit: 12 }];
    let complete!: (items: string[]) => void;
    const oldRequest = client.fetchQuery({
        queryKey,
        queryFn: ({ signal }) => {
            // Reading the signal lets TanStack Query cancel this request.
            expect(signal.aborted).toBe(false);
            return new Promise<string[]>(resolve => {
                complete = resolve;
            });
        }
    }).catch(() => undefined);
    await refreshHomePlaybackQueries('user-a', client);
    complete(['old order']);
    await oldRequest;
    expect(client.getQueryData(queryKey)).toBeUndefined();
    client.clear();
});
