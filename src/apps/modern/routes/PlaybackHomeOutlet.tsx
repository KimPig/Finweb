import React, { useRef, type ReactElement } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';

import { useApi } from 'hooks/useApi';

import { HomePlaybackVisibility } from './HomePlaybackVisibility';

/** Keep only the pre-playback Home view, not a cache of every visited route. */
export default function PlaybackHomeOutlet() {
    const outlet = useOutlet();
    const { pathname } = useLocation();
    const { user, __legacyApiClient__: apiClient } = useApi();
    const owner = user?.Id && apiClient ? JSON.stringify([apiClient.serverId(), user.Id]) : null;
    const home = useRef<{ owner: string | null; outlet: ReactElement | null } | null>(null);
    const isHome = pathname === '/home';
    const retain = owner !== null
        && (pathname === '/video' || pathname === '/details');

    if (home.current?.owner !== owner || (!isHome && !retain)) home.current = null;
    if (isHome) home.current = { owner, outlet };

    return (
        <>
            {home.current && (
                <HomePlaybackVisibility.Provider value={isHome}>
                    <div key={home.current.owner} data-finweb-retained-home
                        hidden={!isHome} style={{ display: isHome ? 'contents' : 'none' }}>
                        {home.current.outlet}
                    </div>
                </HomePlaybackVisibility.Provider>
            )}
            {!isHome && outlet}
        </>
    );
}
