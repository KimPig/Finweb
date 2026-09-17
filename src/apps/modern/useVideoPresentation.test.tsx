import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';

import { useVideoPresentation } from './useVideoPresentation';

function Fixture() {
    useVideoPresentation();
    return <div className='finweb-layout'><button>Control</button></div>;
}

it('blocks presentation surfaces and restores their original inert state on handoff, failure and unmount', async () => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
    const container = document.createElement('div');
    const footer = document.createElement('div');
    footer.className = 'appfooter';
    footer.setAttribute('inert', '');
    document.body.append(container, footer);
    const root = createRoot(container);
    const player = document.createElement('div');
    player.className = 'videoPlayerContainer videoPlayerContainer-onTop';
    const drawer = document.createElement('aside');
    drawer.className = 'finweb-drawer';
    try {
        await act(async () => root.render(<Fixture />));
        const layout = container.querySelector('.finweb-layout')!;
        await act(async () => {
            document.body.prepend(player);
        });
        expect(layout.hasAttribute('inert')).toBe(true);
        expect(document.body.classList.contains('finweb-video-presentation')).toBe(true);
        await act(async () => {
            container.append(drawer);
        });
        expect(drawer.hasAttribute('inert')).toBe(true);
        await act(async () => {
            player.classList.remove('videoPlayerContainer-onTop');
        });
        expect(layout.hasAttribute('inert')).toBe(false);
        expect(drawer.hasAttribute('inert')).toBe(false);
        expect(footer.hasAttribute('inert')).toBe(true);
        await act(async () => {
            player.classList.add('videoPlayerContainer-onTop');
        });
        await act(async () => {
            player.remove();
        });
        expect(layout.hasAttribute('inert')).toBe(false);
        await act(async () => {
            document.body.prepend(player);
        });
        await act(async () => root.unmount());
        expect(drawer.hasAttribute('inert')).toBe(false);
        expect(document.body.classList.contains('finweb-video-presentation')).toBe(false);
        expect(footer.hasAttribute('inert')).toBe(true);
    } finally {
        player.remove();
        container.remove();
        footer.remove();
    }
});
