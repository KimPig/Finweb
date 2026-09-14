import { useLayoutEffect } from 'react';

/** The player presents its poster before navigating to /video. Follow that same lifecycle. */
export function useVideoPresentation() {
    useLayoutEffect(() => {
        let player: Element | null = null;
        const update = () => {
            document.body.classList.toggle('finweb-video-presentation', Boolean(player?.classList.contains('videoPlayerContainer-onTop')));
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
        bodyObserver.observe(document.body, { childList: true });
        attach();
        return () => {
            bodyObserver.disconnect();
            playerObserver.disconnect();
            document.body.classList.remove('finweb-video-presentation');
        };
    }, []);
}
