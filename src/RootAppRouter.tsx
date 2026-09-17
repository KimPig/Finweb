import { ThemeProvider } from '@mui/material/styles';
import React, { useLayoutEffect } from 'react';
import {
    RouterProvider,
    createHashRouter,
    Outlet,
    useLocation
} from 'react-router-dom';

import { DASHBOARD_APP_PATHS, DASHBOARD_APP_ROUTES } from 'apps/dashboard/routes/routes';
import { APP_ROUTES as MODERN_APP_ROUTES } from 'apps/modern/routes/routes';
import { APP_ROUTES as LEGACY_APP_ROUTES } from 'apps/legacy/routes/routes';
import { WIZARD_APP_ROUTES } from 'apps/wizard/routes/routes';
import AppHeader from 'components/AppHeader';
import Backdrop from 'components/Backdrop';
import CustomJavaScript from 'components/CustomJavaScript';
import MobileAppNotice from 'components/MobileAppNotice';
import layoutManager from 'components/layoutManager';
import BangRedirect from 'components/router/BangRedirect';
import { createRouterHistory } from 'components/router/routerHistory';
import appTheme, { finwebTheme } from 'themes';
import { ThemeStorageManager } from 'themes/themeStorageManager';
import { usesFinwebTheme } from 'utils/finweb/themeScope';

const router = createHashRouter([
    {
        element: <RootAppLayout />,
        children: [
            ...(layoutManager.modern ? MODERN_APP_ROUTES : LEGACY_APP_ROUTES),
            ...DASHBOARD_APP_ROUTES,
            ...WIZARD_APP_ROUTES,
            {
                path: '!/*',
                Component: BangRedirect
            }
        ]
    }
]);

export const history = createRouterHistory(router);

export default function RootAppRouter() {
    return <RouterProvider router={router} />;
}

/**
 * Layout component that renders legacy components required on all pages.
 * NOTE: The app will crash if these get removed from the DOM.
 */
function RootAppLayout() {
    const location = useLocation();
    const isFinweb = usesFinwebTheme(location.pathname);
    useLayoutEffect(() => {
        document.documentElement.toggleAttribute('data-finweb-theme', isFinweb);
        return () => document.documentElement.removeAttribute('data-finweb-theme');
    }, [isFinweb]);
    const isNewLayoutPath = Object.values(DASHBOARD_APP_PATHS)
        .some(path => location.pathname.startsWith(`/${path}`));

    return (
        <ThemeProvider
            theme={isFinweb ? finwebTheme : appTheme}
            defaultMode='dark'
            storageManager={ThemeStorageManager}
        >
            <Backdrop />
            <CustomJavaScript />
            <AppHeader isHidden={layoutManager.modern || isNewLayoutPath} />

            <Outlet />
            <MobileAppNotice pathname={location.pathname} />
        </ThemeProvider>
    );
}
