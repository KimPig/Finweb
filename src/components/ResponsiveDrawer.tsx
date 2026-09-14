import type { Theme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import SwipeableDrawer from '@mui/material/SwipeableDrawer';
import useMediaQuery from '@mui/material/useMediaQuery';
import React, { type FC, type PropsWithChildren } from 'react';

import browser from 'scripts/browser';

export const DRAWER_WIDTH = 240;

export interface ResponsiveDrawerProps {
    width?: number
    className?: string
    open: boolean
    onClose: () => void
    onOpen: () => void
}

const ResponsiveDrawer: FC<PropsWithChildren<ResponsiveDrawerProps>> = ({
    children,
    open = false,
    onClose,
    onOpen,
    width = DRAWER_WIDTH,
    className
}) => {
    const isMediumScreen = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'));

    return ( isMediumScreen ? (
        /* DESKTOP DRAWER */
        <Drawer
            className={className}
            sx={{
                width,
                flexShrink: 0,
                '& .MuiDrawer-paper': {
                    width,
                    paddingBottom: '4.2rem', // Padding for now playing bar
                    boxSizing: 'border-box'
                }
            }}
            variant='permanent'
            anchor='left'
        >
            {children}
        </Drawer>
    ) : (
        /* MOBILE DRAWER */
        <SwipeableDrawer
            className={className}
            anchor='left'
            open={open}
            sx={{
                '& .MuiDrawer-paper': {
                    width,
                    maxWidth: '100vw',
                    paddingBottom: '4.2rem', // Padding for now playing bar
                    boxSizing: 'border-box'
                }
            }}
            onClose={onClose}
            onOpen={onOpen}
            // Disable swipe to open on iOS since it interferes with back navigation
            disableDiscovery={browser.iOS}
            ModalProps={{
                keepMounted: true // Better open performance on mobile.
            }}
        >
            <Box
                role='presentation'
                // Close the drawer when the content is clicked
                onClick={onClose}
                onKeyDown={onClose}
            >
                {children}
            </Box>
        </SwipeableDrawer>
    ));
};

export default ResponsiveDrawer;
