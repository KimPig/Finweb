import { getDisplayVersion } from '@jellyfin/sdk/lib/utils/versioning';
import Box from '@mui/material/Box';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import React from 'react';

import { useSystemInfo } from 'hooks/useSystemInfo';
import ListItemLink from 'components/ListItemLink';

import appIcon from '@jellyfin/ux-web/icon-transparent.png';

const DrawerHeaderLink = () => {
    const { data: systemInfo } = useSystemInfo();

    return (
        <ListItemLink to='/' sx={{ minWidth: 0, width: '100%' }}>
            <ListItemIcon sx={{ minWidth: 56 }}>
                <Box
                    component='img'
                    src={appIcon}
                    alt='Jellyfin'
                    sx={{ width: '2.5rem', height: '2.5rem', objectFit: 'contain' }}
                />
            </ListItemIcon>
            <ListItemText
                primary={systemInfo?.ServerName || 'Jellyfin'}
                secondary={getDisplayVersion(systemInfo?.Version)}
                sx={{ minWidth: 0, overflowWrap: 'anywhere' }}
                slotProps={{ primary: { variant: 'h6' } }}
            />
        </ListItemLink>
    );
};

export default DrawerHeaderLink;
