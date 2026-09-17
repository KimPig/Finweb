import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryTab } from 'types/libraryTab';
import type { LibraryViewSettings } from 'types/library';
import { getDefaultLibraryViewSettings, getSettingsKey } from '../utils/settings';
import { LibraryProvider, useLibrary } from './useLibrary';

vi.mock('hooks/useFetchItems', () => ({ useGetItemsViewByType: () => undefined }));
vi.mock('apps/modern/features/libraries/utils/path', () => ({
    isLibraryPath: (path: string) => path === '/movies',
    getDefaultViewIndex: () => 0
}));

let root: Root;
let container: HTMLDivElement;
let navigate: NavigateFunction;
let setViewSettings: React.Dispatch<React.SetStateAction<LibraryViewSettings>> | undefined;
const renderedLibraryPages: number[] = [];

function PageObserver() {
    const { pathname } = useLocation();
    navigate = useNavigate();
    const library = useLibrary();
    const { viewSettings } = library;
    setViewSettings = library.setViewSettings;
    if (pathname === '/movies') renderedLibraryPages.push(viewSettings?.StartIndex ?? -1);

    return null;
}

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    window.localStorage.clear();
    renderedLibraryPages.length = 0;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

describe('library page restoration', () => {
    it('shows only the saved page on the first render after Home and remembers a later page change', async () => {
        const libraryUrl = '/movies?topParentId=library-a&tab=0';
        const savedSettings = { ...getDefaultLibraryViewSettings(LibraryTab.Movies), StartIndex: 20 };
        window.localStorage.setItem(getSettingsKey(LibraryTab.Movies, 'library-a'), JSON.stringify(savedSettings));

        await act(() => root.render(
            <MemoryRouter initialEntries={['/home']}>
                <LibraryProvider><PageObserver /></LibraryProvider>
            </MemoryRouter>
        ));

        await act(() => navigate(libraryUrl));
        expect(renderedLibraryPages.length).toBeGreaterThan(0);
        expect(new Set(renderedLibraryPages)).toEqual(new Set([20]));

        await act(() => setViewSettings?.(previous => ({ ...previous, StartIndex: 40 })));
        expect(renderedLibraryPages.at(-1)).toBe(40);

        await act(() => navigate('/home'));
        renderedLibraryPages.length = 0;
        await act(() => navigate(libraryUrl));
        expect(renderedLibraryPages.length).toBeGreaterThan(0);
        expect(new Set(renderedLibraryPages)).toEqual(new Set([40]));
    });
});
