import { useLayoutEffect } from 'react';

/** The player presents its poster before navigating to /video. Follow that same lifecycle. */
export function useVideoPresentation() {
    useLayoutEffect(() => {
        let player: Element | null = null;
        const surfaces = new Map<Element, boolean>();
        const restore = (element: Element, wasInert: boolean) => {
            if (wasInert) element.setAttribute('inert', '');
            else element.removeAttribute('inert');
            surfaces.delete(element);
        };
        const update = () => {
            const presenting = Boolean(player?.classList.contains('videoPlayerContainer-onTop'));
            document.body.classList.toggle('finweb-video-presentation', presenting);
            surfaces.forEach((wasInert, element) => {
                if (!presenting || !element.isConnected) restore(element, wasInert);
            });
            if (presenting) {
                document.querySelectorAll('.finweb-layout, .finweb-drawer, .appfooter').forEach(element => {
                    if (!surfaces.has(element)) surfaces.set(element, element.hasAttribute('inert'));
                    element.setAttribute('inert', '');
                });
            }
        };
        const playerObserver = new MutationObserver(update);
        const attach = () => {
            const next = document.querySelector('.videoPlayerContainer');
            if (next !== player) {
                playerObserver.disconnect();
                player = next;
                if (player) playerObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
            }
            update();
        };
        const bodyObserver = new MutationObserver(attach);
        bodyObserver.observe(document.body, { childList: true, subtree: true });
        attach();
        return () => {
            bodyObserver.disconnect();
            playerObserver.disconnect();
            document.body.classList.remove('finweb-video-presentation');
            surfaces.forEach((wasInert, element) => {
                restore(element, wasInert);
            });
        };
    }, []);
}
