import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import React, { type PropsWithChildren, useCallback, useLayoutEffect, useRef } from 'react';
import globalize from 'lib/globalize';

interface ContentLoadingBoundaryProps {
    loading: boolean;
    retainContent?: boolean;
    progressive?: boolean;
}

/** Wait for data only; individual posters manage their own loading state. */
const ContentLoadingBoundary = ({ loading, retainContent = false, progressive = false, children }: PropsWithChildren<ContentLoadingBoundaryProps>) => {
    const blocking = loading && !progressive;
    const content = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        // Retained query data stays visible, but must not remain interactive.
        content.current?.toggleAttribute('inert', blocking);
    }, [blocking]);
    const preventStaleAction = useCallback((event: React.SyntheticEvent) => {
        if (blocking) {
            event.preventDefault();
            event.stopPropagation();
        }
    }, [blocking]);

    const indicator = loading && (
        <Box sx={progressive ? { textAlign: 'center', padding: 2 } :
            { position: 'absolute', top: '25vh', left: '50%', transform: 'translateX(-50%)', zIndex: 1 }}>
            <CircularProgress size={32} aria-label={globalize.translate('MessagePleaseWait')} />
        </Box>
    );

    return (
        <Box className='finweb-content-boundary' aria-busy={loading}
            sx={{ position: 'relative', minHeight: 'calc(100vh - 160px)' }}>
            {!progressive && indicator}
            <div ref={content}
                style={{ visibility: blocking && !retainContent ? 'hidden' : 'visible', pointerEvents: blocking ? 'none' : undefined }}
                aria-hidden={blocking || undefined}
                onClickCapture={preventStaleAction} onKeyDownCapture={preventStaleAction}>
                {children}
            </div>
            {progressive && indicator}
        </Box>
    );
};

export default ContentLoadingBoundary;
