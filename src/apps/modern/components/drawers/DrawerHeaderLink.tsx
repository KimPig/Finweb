import { useTheme } from '@mui/material/styles';
import React from 'react';

import darkBanner from '@jellyfin/ux-web/banner-dark.png';
import lightBanner from '@jellyfin/ux-web/banner-light.png';

const DrawerHeaderLink = () => {
    const theme = useTheme();

    return (
        <div className='finweb-drawer-brand'>
            <img src={theme.palette.mode === 'dark' ? lightBanner : darkBanner} alt='Jellyfin' />
        </div>
    );
};

export default DrawerHeaderLink;
