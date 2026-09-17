import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('elements/emby-tabs/emby-tabs', () => ({}));
vi.mock('elements/emby-button/emby-button', () => ({}));
vi.mock('elements/emby-scroller/emby-scroller', () => ({}));
vi.mock('components/Page', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('components/backdrop/backdrop', () => ({ clearBackdrop: vi.fn() }));
vi.mock('components/layoutManager', () => ({ default: { tv: false } }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('components/loading/ContentLoadingBoundary', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));
vi.mock('scripts/libraryMenu', () => ({ default: { setTitle: vi.fn() } }));
vi.mock('components/maintabsmanager', () => ({ selectedTabIndex: vi.fn(), setTabs: vi.fn() }));

import Home from '../../apps/modern/routes/home';

it('renders modern Home without a test selector or a blocking loading overlay', async () => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
    const header = document.createElement('div');
    header.className = 'skinHeader';
    document.body.append(header);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
        await act(async () => {
            root.render(<MemoryRouter><Home /></MemoryRouter>);
        });
        expect(container.querySelector('#finweb-home-refresh-test')).toBeNull();
        expect(container.querySelector('#homeTab .sections')).not.toBeNull();
        expect(container.querySelector('[role="progressbar"]')).toBeNull();
        expect(container.querySelector('[inert]')).toBeNull();
    } finally {
        await act(async () => root.unmount());
        container.remove();
        header.remove();
    }
});
