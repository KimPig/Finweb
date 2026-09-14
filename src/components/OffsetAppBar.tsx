import AppBar, { type AppBarProps } from '@mui/material/AppBar';
import useScrollTrigger from '@mui/material/useScrollTrigger';
import React, { useLayoutEffect, useRef, useState, type FC, type PropsWithChildren } from 'react';
import { flushSync } from 'react-dom';
import ResizeObserver from 'resize-observer-polyfill';

/** The default height of an AppBar. */
const DEFAULT_APP_BAR_HEIGHT = 64;
/** The height of a dense AppBar. */
const DENSE_APP_BAR_HEIGHT = 48;

interface OffsetAppBarProps extends AppBarProps {
    /** Use the dense variant of the AppBar, which has a smaller default height. */
    dense?: boolean;
    /** The elevation to apply when the user has scrolled. Defaults to 1. */
    elevation?: number;
    transparentOnScroll?: boolean;
    syncLayout?: boolean;
}

/**
 * AppBar wrapper with a fixed position and a spacer to prevent content from rendering underneath.
 */
const OffsetAppBar: FC<PropsWithChildren<OffsetAppBarProps>> = ({
    children,
    dense = false,
    elevation = 1,
    transparentOnScroll = false,
    syncLayout = false,
    ...props
}) => {
    const appBarRef = useRef<HTMLHtmlElement>(null);
    const [height, setHeight] = useState(dense ? DENSE_APP_BAR_HEIGHT : DEFAULT_APP_BAR_HEIGHT);

    const scrollTrigger = useScrollTrigger({
        disableHysteresis: true,
        threshold: 0
    });

    // Route changes must reserve the new toolbar height before the first paint.
    useLayoutEffect(() => {
        if (syncLayout && appBarRef.current) {
            setHeight(Math.ceil(appBarRef.current.getBoundingClientRect().height));
        }
    }, [children, syncLayout]);

    useLayoutEffect(() => {
        const el = appBarRef.current;
        if (!el) return;

        // Set initial measured height
        const updateHeight = () => {
            setHeight(Math.ceil(el.getBoundingClientRect().height || 0));
        };

        updateHeight();

        // Use ResizeObserver for dynamic changes
        let frame = 0;
        const observer = new ResizeObserver(() => {
            if (syncLayout) {
                // Native ResizeObserver runs before paint; do not defer to another frame.
                flushSync(updateHeight);
            } else {
                window.cancelAnimationFrame(frame);
                frame = window.requestAnimationFrame(updateHeight);
            }
        });
        observer.observe(el);
        // Update on window resize as a fallback
        window.addEventListener('resize', updateHeight);

        return () => {
            observer.disconnect();
            window.cancelAnimationFrame(frame);
            window.removeEventListener('resize', updateHeight);
        };
    }, [syncLayout]);

    return (
        <>
            <AppBar
                {...props}
                ref={appBarRef}
                position='fixed'
                color={scrollTrigger && !transparentOnScroll ? 'default' : 'transparent'}
                elevation={scrollTrigger && !transparentOnScroll ? elevation : 0}
            >
                {children}
            </AppBar>
            {/* Spacer to prevent content rendering under the AppBar */}
            <div
                aria-hidden='true'
                style={{
                    height,
                    width: '100%',
                    flexShrink: 0
                }}
            />
        </>
    );
};

export default OffsetAppBar;
