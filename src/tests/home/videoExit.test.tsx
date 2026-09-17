/* eslint-disable compat/compat -- This runs in Node and jsdom with a router Request shim. */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    player: {},
    currentPlayer: vi.fn(),
    isPlayingVideo: vi.fn(),
    stop: vi.fn(),
    currentApiClient: vi.fn(),
    pending: vi.fn(),
    refetch: vi.fn()
}));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: {
    getCurrentPlayer: mocks.currentPlayer, isPlayingVideo: mocks.isPlayingVideo, stop: mocks.stop
} }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { currentApiClient: mocks.currentApiClient } }));
vi.mock('utils/query/queryClient', () => ({ queryClient: { refetchQueries: mocks.refetch } }));
vi.mock('utils/query/pendingHomePlaybackReports', () => ({ getPendingHomePlaybackReports: mocks.pending }));
vi.mock('apps/modern/components/AppToolbar/RemotePlayButton', () => ({ default: () => null }));
vi.mock('apps/modern/components/AppToolbar/SyncPlayButton', () => ({ default: () => null }));
vi.mock('components/toolbar/AppToolbar', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('components/viewManager/ViewManagerPage', () => ({ default: () => null }));

import VideoPage from '../../apps/modern/routes/video';

const originalRequest = globalThis.Request;
beforeAll(() => {
    // jsdom's AbortSignal is rejected by Node's Request implementation.
    globalThis.Request = class {
        url: string;
        signal: AbortSignal;
        method: string;
        constructor(url: string, options: RequestInit = {}) {
            this.url = url;
            this.signal = options.signal!;
            this.method = options.method || 'GET';
        }
    } as unknown as typeof Request;
    (globalThis as unknown as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;
});
afterAll(() => {
    globalThis.Request = originalRequest;
});

afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

it('leaves video immediately without a save-and-prefetch gate', async () => {
    const router = createMemoryRouter([
        { path: '/video', Component: VideoPage },
        { path: '/home', element: <div>Home is open</div> }
    ], { initialEntries: ['/video'] });
    const element = document.createElement('div');
    document.body.append(element);
    const root = createRoot(element);
    try {
        await act(async () => {
            root.render(<RouterProvider router={router} />);
        });
        await act(async () => {
            await router.navigate('/home');
        });
        expect(element.textContent).toContain('Home is open');
        expect(mocks.pending).not.toHaveBeenCalled();
        expect(mocks.refetch).not.toHaveBeenCalled();
    } finally {
        await act(async () => root.unmount());
        router.dispose();
    }
});

/* eslint-enable compat/compat */
