import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import React from 'react';

import { useUserSettings } from 'hooks/useUserSettings';
import globalize from 'lib/globalize';
import { useLibrary } from '../hooks/useLibrary';
import Pagination from './Pagination';

const LibraryPaginationFooter = () => {
    const { content, itemsResult, viewSettings, setViewSettings } = useLibrary();
    const { libraryPageSize } = useUserSettings();
    const total = itemsResult?.data?.TotalRecordCount ?? 0;
    const index = viewSettings?.StartIndex ?? 0;

    if (!content?.isPaginationEnabled || !setViewSettings || libraryPageSize <= 0 || total <= libraryPageSize) return null;

    return (
        <Box component='nav' aria-label={globalize.translate('ListPaging', index + 1, Math.min(index + libraryPageSize, total), total)}
            className='finweb-pagination-footer'
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 1, py: 3 }}>
            <Typography>
                {globalize.translate('ListPaging', index + 1, Math.min(index + libraryPageSize, total), total)}
            </Typography>
            <Pagination
                setLibraryViewSettings={setViewSettings}
                index={index}
                pageSize={libraryPageSize}
                total={total}
                disabled={itemsResult?.isPending || itemsResult?.isPlaceholderData}
            />
        </Box>
    );
};

export default LibraryPaginationFooter;
