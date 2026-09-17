import { getBrandingApi } from '@jellyfin/sdk/lib/utils/api/branding-api';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { useBrandingApi } from 'hooks/useBrandingApi';
import globalize from 'lib/globalize';
import { parseCustomScriptUrls, readCustomScript } from 'utils/finweb/customScriptSettings';
import { CustomScriptRuntime, isScriptExcludedPath, readSafeMode } from 'utils/finweb/customScriptRuntime';
import { injectCustomScript, loadCustomScripts } from 'utils/finweb/injectCustomScript';

function getSafeMode() {
    try {
        return readSafeMode(window.location.search, window.sessionStorage);
    } catch {
        return readSafeMode(window.location.search);
    }
}

const safeMode = getSafeMode();
const runtime = new CustomScriptRuntime(safeMode);
const settingsByServer = new Map<string, Promise<ReturnType<typeof readCustomScript> | null>>();
let pendingServer: string | undefined;
let currentPath = '';

function exitSafeMode() {
    const url = new URL(window.location.href);
    url.searchParams.set('finwebSafeMode', '0');
    window.location.replace(url.href);
}

export default function CustomJavaScript() {
    const location = useLocation();
    const api = useBrandingApi();
    const server = api?.basePath;
    currentPath = location.pathname;
    pendingServer = server;

    useEffect(() => {
        if (runtime.needsReload(server, location.pathname)) {
            window.location.reload();
            return;
        }
        if (!api || !server || safeMode) return;

        // Snapshot even on the dashboard: saving there cannot hot-run newly entered code.
        // Never execute persisted query-cache data.
        let settings = settingsByServer.get(server);
        if (!settings) {
            settings = getBrandingApi(api).getBrandingOptions({ timeout: 10000 })
                .then(({ data }) => readCustomScript(data.CustomCss || ''))
                .catch(() => {
                    console.warn('[Finweb] Custom JavaScript settings could not be loaded; skipping execution.');
                    return null;
                });
            settingsByServer.set(server, settings);
        }
        void settings.then(async parsed => {
            if (pendingServer !== server) return;
            if (!parsed) return;
            const { script, invalid } = parsed;
            if (invalid || !script.enabled) return;
            const code = script.mode !== 'url' ? script.code.trim() : '';
            const urls = script.mode !== 'code' ? script.url.trim() : '';
            if (!code && !urls) return;
            const external = parseCustomScriptUrls(urls);
            if (external.invalidLine) {
                console.warn('[Finweb] External JS URL is invalid; skipping execution.');
                return;
            }
            // Navigation may have entered the dashboard while the request was in flight.
            if (isScriptExcludedPath(currentPath)) return;
            if (!runtime.claim(server, currentPath)) return;
            // Even a failing script can have side effects before throwing; keep cleanup conservative.
            runtime.markExecuted();
            const canContinue = () => pendingServer === server && !isScriptExcludedPath(currentPath);
            if (urls && !await loadCustomScripts(urls, canContinue)) return;
            if (code && canContinue()) {
                injectCustomScript(script.code);
            }
        });
    }, [api, server, location.pathname]);

    return safeMode ? (
        <Alert
            severity='warning'
            className='finweb-safe-mode'
            sx={{ position: 'relative', zIndex: 2100 }}
            action={<Button color='inherit' onClick={exitSafeMode}>{globalize.translate('FinwebExitSafeMode')}</Button>}
        >
            {globalize.translate('FinwebSafeModeActive')}
        </Alert>
    ) : null;
}
