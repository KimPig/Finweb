import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MobileAppNotice from './index';
import { dismissMobileAppNotice, isMobileAppNoticeDismissed, isMobileAppNoticeEligible } from './policy';

vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('scripts/browser', () => ({ default: { android: true } }));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    window.localStorage.clear();
    window.sessionStorage.clear();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

async function render(pathname = '/home') {
    await act(() => root.render(<MobileAppNotice pathname={pathname} />));
}

async function close() {
    const button = [...document.querySelectorAll('button')].find(element => element.textContent === 'ButtonClose');
    expect(button).toBeDefined();
    await act(() => button?.click());
}

describe('mobile app notice', () => {
    it.each([
        [{ android: true }, '/home', true],
        [{ iOS: true }, '/login', true],
        [{ iOS: true }, '/selectserver', true],
        [{ android: true }, '/addserver', true],
        [{}, '/home', false],
        [{ android: true, tv: true }, '/home', false],
        [{ android: true }, '/video', false],
        [{ iOS: true }, '/dashboard', false],
        [{ android: true }, '/wizard/start', false]
    ])('checks device and entry route: %o %s', (platform, pathname, expected) => {
        expect(isMobileAppNoticeEligible(platform, pathname)).toBe(expected);
    });

    it('shows both safe store links with an unchecked opt-out', async () => {
        await render();
        const links = [...document.querySelectorAll('a')];
        expect(links.map(link => link.href)).toEqual([
            'https://play.google.com/store/apps/details?id=dev.jdtech.jellyfin',
            'https://apps.apple.com/app/swiftfin/id1604098728'
        ]);
        for (const link of links) {
            expect(link.rel).toBe('noopener noreferrer');
            expect(link.target).toBe('_blank');
        }
        expect(document.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);
        expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-labelledby')).toBe('finweb-mobile-app-notice-title');
    });

    it('also shows inside a native app and opens each store through the native bridge', async () => {
        const openUrl = vi.fn();
        vi.stubGlobal('NativeShell', { openUrl });
        await render();
        for (const link of document.querySelectorAll('a')) {
            await act(() => link.click());
            expect(openUrl).toHaveBeenCalledWith(link.href, '_blank');
        }
        expect(openUrl).toHaveBeenCalledTimes(2);
        expect(isMobileAppNoticeDismissed()).toBe(false);
    });

    it('close lasts through navigation but not a fresh page mount', async () => {
        await render();
        await close();
        expect(isMobileAppNoticeDismissed()).toBe(false);
        expect(window.localStorage.length).toBe(0);
        expect(window.sessionStorage.length).toBe(0);
        await render('/login');
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 300));
        });
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        await act(() => root.render(null));
        await render();
        expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    });

    it('ignores the session-only dismissal saved by older builds', async () => {
        window.sessionStorage.setItem('finweb.mobileAppNotice.dismissed.v1', '1');
        await render();
        expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    });

    it('only saves permanent dismissal when checked and closed', async () => {
        await render();
        await act(() => document.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());
        expect(window.localStorage.length).toBe(0);
        await close();
        window.sessionStorage.clear();
        expect(isMobileAppNoticeDismissed()).toBe(true);
        await act(() => root.render(null));
        await render();
        expect(document.querySelector('[role="dialog"]')).toBeNull();
    });

    it('waits for an eligible screen without marking the notice dismissed', async () => {
        await render('/video');
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(isMobileAppNoticeDismissed()).toBe(false);
        await render('/home');
        expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    });

    it('still closes and stays closed during navigation when storage is blocked', async () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        expect(() => dismissMobileAppNotice(true)).not.toThrow();
        await render();
        await close();
        await render('/login');
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 300));
        });
        expect(document.querySelector('[role="dialog"]')).toBeNull();
    });
});
