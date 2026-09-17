import type { ApiClient } from 'jellyfin-apiclient';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

import type { UserSettings } from 'scripts/settings/userSettings';
import { beginHomePlaybackReport } from 'utils/query/pendingHomePlaybackReports';
import { refreshHomePlaybackQueries } from 'utils/query/refreshHomePlaybackQueries';

const mocks = vi.hoisted(() => ({
    fetch: vi.fn()
}));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('components/cardbuilder/cardBuilder', () => ({ default: { getCardsHtml: vi.fn() } }));
vi.mock('lib/jellyfin-apiclient/ServerConnections', () => ({ default: {
    getApi: () => ({})
} }));
vi.mock('utils/query/queryClient', () => ({ queryClient: {
    fetchQuery: mocks.fetch
} }));
vi.mock('apps/legacy/features/libraries/api/useResumeItems', () => ({
    getResumeItemsQuery: () => ({ queryKey: ['resume'] })
}));
vi.mock('apps/legacy/features/libraries/api/useNextUp', () => ({
    getNextUpQuery: () => ({ queryKey: ['nextup'] })
}));
vi.mock('components/layoutManager', () => ({ default: { tv: false } }));
vi.mock('components/router/appRouter', () => ({ appRouter: { getRouteUrl: () => '/nextup' } }));

import { loadResume } from '../../components/homesections/sections/resume';
import { loadNextUp } from '../../components/homesections/sections/nextUp';

it('keeps ordinary navigation cached and reads once after a slow stop report', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60000, retry: false } } });
    let result = { Items: [{ Id: 'old' }] };
    const serverRead = vi.fn(async () => result);
    mocks.fetch.mockImplementation(query => client.fetchQuery({
        queryKey: ['User', 'user-a', query.queryKey[0] === 'resume' ? 'ResumeItems' : 'NextUp'],
        queryFn: serverRead
    }));
    const apiClient = {
        serverId: () => 'server-a', getCurrentUserId: () => 'user-a'
    } as unknown as ApiClient;
    const settings = {
        useEpisodeImagesInNextUpAndResume: () => false,
        maxDaysForNextUp: () => 30,
        enableRewatchingInNextUp: () => false
    } as unknown as UserSettings;
    const makeSections = () => {
        const resumeSection = document.createElement('div');
        const nextUpSection = document.createElement('div');
        loadResume(resumeSection, apiClient, 'Resume', 'Video', settings, { enableOverflow: false });
        loadNextUp(nextUpSection, apiClient, settings, { enableOverflow: false });
        return [resumeSection, nextUpSection].map(section => section.querySelector('.itemsContainer') as Element & {
            fetchData: () => Promise<unknown>
        });
    };

    let report: ReturnType<typeof beginHomePlaybackReport> | undefined;
    try {
        await Promise.all(makeSections().map(section => section.fetchData()));
        await Promise.all(makeSections().map(section => section.fetchData()));
        expect(serverRead).toHaveBeenCalledTimes(2);

        report = beginHomePlaybackReport('server-a', 'user-a');
        const sections = makeSections();
        const reading = Promise.all(sections.map(section => section.fetchData()));
        await Promise.resolve();
        expect(serverRead).toHaveBeenCalledTimes(2);
        result = { Items: [{ Id: 'latest' }] };
        await refreshHomePlaybackQueries('user-a', client);
        report.finish();
        expect(await reading).toEqual([result, result]);
        expect(serverRead).toHaveBeenCalledTimes(4);

        await Promise.all(makeSections().map(section => section.fetchData()));
        expect(serverRead).toHaveBeenCalledTimes(4);
    } finally {
        report?.finish();
        client.clear();
        mocks.fetch.mockReset();
    }
});

afterEach(() => {
    vi.clearAllMocks();
});
