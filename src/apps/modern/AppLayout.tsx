import React, { StrictMode, useCallback, useLayoutEffect, useState } from 'react';
import Box from '@mui/material/Box';
import { type Theme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { Outlet, useLocation } from 'react-router-dom';

import AppBody from 'components/AppBody';
import CustomCss from 'components/CustomCss';
import OffsetAppBar from 'components/OffsetAppBar';
import ThemeCss from 'components/ThemeCss';
import { useApi } from 'hooks/useApi';

import AppToolbar from './components/AppToolbar';
import AppDrawer, { FINWEB_DRAWER_WIDTH, isDrawerPath } from './components/drawers/AppDrawer';
import LibraryToolbar from './features/libraries/components/LibraryToolbar';
import { LibraryProvider } from './features/libraries/hooks/useLibrary';
import { isLibraryPath } from './features/libraries/utils/path';

import './AppOverrides.scss';
import { useVideoPresentation } from './useVideoPresentation';

export const Component = () => {
    useVideoPresentation();
    const [ isDrawerActive, setIsDrawerActive ] = useState(false);
    const { user, isUserLoading } = useApi();
    const location = useLocation();

    const isMediumScreen = useMediaQuery((t: Theme) => t.breakpoints.up('md'));
    const isDrawerAvailable = isDrawerPath(location.pathname) && Boolean(user);
    const isSidebarVisible = isDrawerPath(location.pathname) && Boolean(user || isUserLoading) && isMediumScreen;
    const isDrawerOpen = isDrawerActive && isDrawerAvailable && !isMediumScreen;

    useLayoutEffect(() => {
        document.body.classList.add('finweb-modern-layout');
        document.body.classList.toggle('finweb-sidebar-visible', isSidebarVisible);
        document.body.style.setProperty('--finweb-sidebar-width', `${FINWEB_DRAWER_WIDTH}px`);
        setIsDrawerActive(false);
        return () => {
            document.body.classList.remove('finweb-modern-layout');
            document.body.classList.remove('finweb-sidebar-visible');
            document.body.style.removeProperty('--finweb-sidebar-width');
        };
    }, [isSidebarVisible, location.pathname]);

    const onToggleDrawer = useCallback(() => {
        setIsDrawerActive(!isDrawerActive);
    }, [ isDrawerActive, setIsDrawerActive ]);

    return (
        <LibraryProvider>
            <Box
                className='finweb-layout'
                sx={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%'
                }}
            >
                <StrictMode>
                    <OffsetAppBar dense transparentOnScroll syncLayout sx={isSidebarVisible ? {
                        width: `calc(100% - ${FINWEB_DRAWER_WIDTH}px)`,
                        marginLeft: `${FINWEB_DRAWER_WIDTH}px`
                    } : undefined}>
                        <div className='finweb-appbar-content mui-fixed'>
                            <AppToolbar
                                isSidebarVisible={isSidebarVisible}
                                isDrawerAvailable={!isMediumScreen && isDrawerAvailable}
                                isDrawerOpen={isDrawerOpen}
                                onDrawerButtonClick={onToggleDrawer}
                            />
                            {isLibraryPath(location.pathname) && <LibraryToolbar />}
                        </div>
                    </OffsetAppBar>

                    {
                        isDrawerAvailable && (
                            <AppDrawer
                                open={isDrawerOpen}
                                onClose={onToggleDrawer}
                                onOpen={onToggleDrawer}
                            />
                        )
                    }
                </StrictMode>

                <Box
                    component='main'
                    sx={{
                        position: 'relative',
                        width: isSidebarVisible ? `calc(100% - ${FINWEB_DRAWER_WIDTH}px)` : '100%',
                        marginLeft: isSidebarVisible ? `${FINWEB_DRAWER_WIDTH}px` : 0,
                        minHeight: 0,
                        flexGrow: 1
                    }}
                >
                    <AppBody>
                        <Outlet />
                    </AppBody>
                </Box>
            </Box>
            <ThemeCss />
            <CustomCss />
        </LibraryProvider>
    );
};
