import { useEffect, useReducer } from 'react';
import { useLocation } from 'react-router-dom';

import { useApi } from 'hooks/useApi';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import events from 'utils/events';

/** Login can target a different server before ApiProvider has an authenticated user. */
export function useBrandingApi() {
    const { api } = useApi();
    const location = useLocation();
    const [, update] = useReducer(value => value + 1, 0);

    useEffect(() => {
        events.on(ServerConnections, 'apiclientcreated', update);
        return () => events.off(ServerConnections, 'apiclientcreated', update);
    }, []);

    if (location.pathname === '/selectserver' || location.pathname === '/addserver') return undefined;
    const serverId = new URLSearchParams(location.search).get('serverid');
    try {
        return serverId ? ServerConnections.getApi(serverId) : api || ServerConnections.getApi();
    } catch {
        return undefined;
    }
}
