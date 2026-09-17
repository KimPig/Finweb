/* eslint-disable compat/compat -- Node router Request shim for jsdom. */
import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    identity: { user: { Id: 'user-a' }, __legacyApiClient__: { serverId: (): string => 'server-a' } },
    mount: vi.fn(), unmount: vi.fn(), visibility: vi.fn()
}));
vi.mock('hooks/useApi', () => ({ useApi: () => mocks.identity }));

import PlaybackHomeOutlet from '../../apps/modern/routes/PlaybackHomeOutlet';
import { useHomePlaybackVisibility } from '../../apps/modern/routes/HomePlaybackVisibility';

const originalRequest = globalThis.Request;
beforeAll(() => {
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
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
});
afterAll(() => {
    globalThis.Request = originalRequest;
});
afterEach(() => {
    mocks.identity = { user: { Id: 'user-a' }, __legacyApiClient__: { serverId: () => 'server-a' } };
    vi.clearAllMocks();
});

function HomeFixture() {
    const visible = useHomePlaybackVisibility();
    useEffect(() => {
        mocks.mount();
        return () => {
            mocks.unmount();
        };
    }, []);
    useEffect(() => {
        mocks.visibility(visible);
    }, [visible]);
    return <div id='home-fixture'><div className='resume-row'><div className='card'>Continue watching</div></div>
        <div className='nextup-row'>Next up</div></div>;
}

async function openHome() {
    const router = createMemoryRouter([{
        Component: PlaybackHomeOutlet,
        children: [
            { path: '/home', Component: HomeFixture },
            { path: '/video', element: <div id='video-fixture'>Video</div> },
            { path: '/details', element: <div>Details</div> },
            { path: '/movies', element: <div>Movies</div> }
        ]
    }, { path: '/login', element: <div>Login</div> }], { initialEntries: ['/home'] });
    const element = document.createElement('div');
    document.body.append(element);
    const root = createRoot(element);
    await act(async () => {
        root.render(<RouterProvider router={router} />);
    });
    return {
        router, element,
        navigate: async (path: string) => {
            await act(async () => {
                await router.navigate(path);
            });
        },
        close: async () => {
            await act(async () => root.unmount());
            router.dispose();
            element.remove();
        }
    };
}

it.each([false, true])('restores the same Home and card nodes across playback (details: %s)', async details => {
    const page = await openHome();
    try {
        const home = page.element.querySelector('#home-fixture');
        const card = home!.querySelector('.card');
        if (details) await page.navigate('/details?id=item');
        await page.navigate('/video');
        expect(page.element.querySelector('#home-fixture')).toBe(home);
        expect(home!.closest('[data-finweb-retained-home]')?.hasAttribute('hidden')).toBe(true);
        expect(mocks.unmount).not.toHaveBeenCalled();
        expect(mocks.visibility).toHaveBeenLastCalledWith(false);
        await page.navigate('/home');
        expect(page.element.querySelector('#home-fixture')).toBe(home);
        expect(page.element.querySelector('.card')).toBe(card);
        expect(home!.closest('[data-finweb-retained-home]')?.hasAttribute('hidden')).toBe(false);
        expect(page.element.querySelector('.resume-row')?.textContent).toBe('Continue watching');
        expect(page.element.querySelector('.nextup-row')?.textContent).toBe('Next up');
        expect(mocks.mount).toHaveBeenCalledTimes(1);
        expect(mocks.visibility).toHaveBeenLastCalledWith(true);
    } finally { await page.close(); }
});

it('still recreates Home after ordinary library navigation', async () => {
    const page = await openHome();
    try {
        const home = page.element.querySelector('#home-fixture');
        await page.navigate('/movies');
        expect(page.element.querySelector('#home-fixture')).toBeNull();
        await page.navigate('/home');
        expect(page.element.querySelector('#home-fixture')).not.toBe(home);
        expect(mocks.mount).toHaveBeenCalledTimes(2);
    } finally { await page.close(); }
});

it.each(['user', 'server', 'logout'] as const)('discards retained Home after %s changes', async change => {
    const page = await openHome();
    try {
        await page.navigate('/video');
        if (change === 'user') mocks.identity.user = { Id: 'user-b' };
        if (change === 'server') mocks.identity.__legacyApiClient__ = { serverId: () => 'server-b' };
        await page.navigate(change === 'logout' ? '/login' : '/video?changed=1');
        expect(page.element.querySelector('#home-fixture')).toBeNull();
        expect(mocks.unmount).toHaveBeenCalledTimes(1);
    } finally { await page.close(); }
});
/* eslint-enable compat/compat */
