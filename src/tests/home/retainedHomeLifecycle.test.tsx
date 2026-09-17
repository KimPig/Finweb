import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import Events from 'utils/events';
import { EventType } from 'constants/eventType';
import { HomePlaybackVisibility } from '../../apps/modern/routes/HomePlaybackVisibility';

const mocks = vi.hoisted(() => ({
    resume: vi.fn(), pause: vi.fn(), destroy: vi.fn(), title: vi.fn(),
    tabChange: undefined as undefined | ((event: { detail: { selectedTabIndex: string; previousIndex: null } }) => void)
}));
vi.mock('elements/emby-tabs/emby-tabs', () => ({}));
vi.mock('elements/emby-button/emby-button', () => ({}));
vi.mock('elements/emby-scroller/emby-scroller', () => ({}));
vi.mock('components/Page', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('components/backdrop/backdrop', () => ({ clearBackdrop: vi.fn() }));
vi.mock('components/layoutManager', () => ({ default: { tv: false } }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('scripts/libraryMenu', () => ({ default: { setTitle: mocks.title } }));
vi.mock('components/maintabsmanager', () => ({
    setTabs: (_view: unknown, _index: number, _tabs: unknown, _containers: unknown, _before: unknown,
        change: typeof mocks.tabChange) => { mocks.tabChange = change; },
    selectedTabIndex: (index: number) => mocks.tabChange?.({ detail: { selectedTabIndex: String(index), previousIndex: null } })
}));
vi.mock('apps/legacy/controllers/hometab', () => ({
    default: class {
        constructor(readonly view: HTMLElement) {}
        onResume() {
            mocks.resume();
            if (!this.view.querySelector('.card')) {
                this.view.querySelector('.sections')!.innerHTML = '<div class="card">Saved Home</div>';
            }
            return Promise.resolve();
        }
        onPause() { mocks.pause(); }
        destroy() {
            mocks.destroy();
            this.view.innerHTML = '';
        }
    }
}));

import Home from '../../apps/modern/routes/home';

it('pauses retained Home without destroying it or reacting to the video header', async () => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
    const header = document.createElement('div');
    header.className = 'skinHeader';
    header.innerHTML = '<div class="headerTabs"></div>';
    document.body.append(header);
    const element = document.createElement('div');
    document.body.append(element);
    const root = createRoot(element);
    const render = (visible: boolean) => root.render(
        <MemoryRouter initialEntries={['/home']}>
            <HomePlaybackVisibility.Provider value={visible}><Home /></HomePlaybackVisibility.Provider>
        </MemoryRouter>
    );
    try {
        await act(async () => render(true));
        await act(async () => {
            await vi.waitFor(() => expect(element.querySelector('.card')).not.toBeNull());
        });
        const card = element.querySelector('.card');
        await act(async () => render(false));
        expect(mocks.pause).toHaveBeenCalled();
        expect(mocks.destroy).not.toHaveBeenCalled();
        const calls = mocks.resume.mock.calls.length;
        mocks.title.mockClear();
        await act(async () => {
            Events.trigger(document, EventType.HEADER_RENDERED);
        });
        expect(mocks.resume).toHaveBeenCalledTimes(calls);
        expect(mocks.title).not.toHaveBeenCalled();
        expect(header.classList.contains('noHomeButtonHeader')).toBe(false);
        await act(async () => render(true));
        await vi.waitFor(() => expect(mocks.resume.mock.calls.length).toBeGreaterThan(calls));
        expect(element.querySelector('.card')).toBe(card);
        expect(mocks.destroy).not.toHaveBeenCalled();
    } finally {
        await act(async () => root.unmount());
        header.remove();
        element.remove();
    }
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
});
