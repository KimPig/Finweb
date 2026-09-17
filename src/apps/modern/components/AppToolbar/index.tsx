import React, { type FC } from 'react';
import { useLocation } from 'react-router-dom';

import { appRouter, PUBLIC_PATHS } from 'components/router/appRouter';
import BaseToolbar from 'components/toolbar/AppToolbar';
import BrandLogo from 'components/toolbar/BrandLogo';
import { useApi } from 'hooks/useApi';

import RemotePlayButton from './RemotePlayButton';
import SyncPlayButton from './SyncPlayButton';
import SearchButton from './SearchButton';

interface AppToolbarProps {
    isSidebarVisible: boolean
    isDrawerAvailable: boolean
    isDrawerOpen: boolean
    onDrawerButtonClick: (event: React.MouseEvent<HTMLElement>) => void
}

const AppToolbar: FC<AppToolbarProps> = ({
    isDrawerAvailable,
    isDrawerOpen,
    onDrawerButtonClick
}) => {
    const location = useLocation();
    const { user } = useApi();

    // The video osd does not show the standard toolbar
    if (location.pathname === '/video') return null;

    // Only show the back button in apps when appropriate
    const isBackButtonAvailable = window.NativeShell && appRouter.canGoBack(location.pathname);

    // Check if the current path is a public path to hide user content
    const isPublicPath = PUBLIC_PATHS.includes(location.pathname);
    // Match the drawer's user readiness without removing the toolbar's reserved height.
    const showUserActions = !isPublicPath && Boolean(user);

    return (
        <BaseToolbar
            buttons={showUserActions && (
                <>
                    <SyncPlayButton />
                    <RemotePlayButton />
                    <SearchButton />
                </>
            )}
            isDrawerAvailable={isDrawerAvailable}
            isDrawerOpen={isDrawerOpen}
            onDrawerButtonClick={onDrawerButtonClick}
            isBackButtonAvailable={isBackButtonAvailable}
            isUserMenuAvailable={showUserActions}
            className='padded-left padded-right'
            actionsClassName={showUserActions ? 'finweb-header-actions' : undefined}
        >
            {isPublicPath && <BrandLogo />}
        </BaseToolbar>
    );
};

export default AppToolbar;
