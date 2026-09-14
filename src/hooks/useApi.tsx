import type { Api } from '@jellyfin/sdk';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client';
import type { ApiClient, Event } from 'jellyfin-apiclient';
import React, { type FC, type PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';

import { ServerConnections } from 'lib/jellyfin-apiclient';
import events from 'utils/events';

export interface JellyfinApiContext {
    __legacyApiClient__?: ApiClient
    api?: Api
    user?: UserDto
    isUserLoading?: boolean
}

export const ApiContext = createContext<JellyfinApiContext>({});
export const useApi = () => useContext(ApiContext);

export const ApiProvider: FC<PropsWithChildren<unknown>> = ({ children }) => {
    const [ legacyApiClient, setLegacyApiClient ] = useState<ApiClient>();
    const [ api, setApi ] = useState<Api>();
    const [ user, setUser ] = useState<UserDto>();
    const [ isUserLoading, setIsUserLoading ] = useState(true);

    const context = useMemo(() => ({
        __legacyApiClient__: legacyApiClient,
        api,
        user,
        isUserLoading
    }), [ api, legacyApiClient, user, isUserLoading ]);

    useEffect(() => {
        let active = true;
        let revision = 0;

        const updateApiUser = (_e: Event | undefined, newUser: UserDto) => {
            revision++;
            setIsUserLoading(false);
            setUser(newUser);

            if (newUser.ServerId) {
                setLegacyApiClient(ServerConnections.getApiClient(newUser.ServerId));
            }
        };

        const resetApiUser = () => {
            revision++;
            setIsUserLoading(false);
            setLegacyApiClient(undefined);
            setUser(undefined);
        };

        events.on(ServerConnections, 'localusersignedin', updateApiUser);
        events.on(ServerConnections, 'localusersignedout', resetApiUser);

        const initialRevision = revision;
        const client = ServerConnections.currentApiClient();
        if (client) {
            client.getCurrentUser().then(newUser => {
                if (active && revision === initialRevision) updateApiUser(undefined, newUser);
            }).catch(err => {
                console.info('[ApiProvider] Could not get current user', err);
            }).finally(() => {
                if (active && revision === initialRevision) setIsUserLoading(false);
            });
        } else {
            setIsUserLoading(false);
        }

        return () => {
            active = false;
            events.off(ServerConnections, 'localusersignedin', updateApiUser);
            events.off(ServerConnections, 'localusersignedout', resetApiUser);
        };
    }, [ setLegacyApiClient, setUser ]);

    useEffect(() => {
        setApi(legacyApiClient ? ServerConnections.getApi(legacyApiClient.serverId()) : undefined);
    }, [ legacyApiClient, setApi ]);

    return (
        <ApiContext.Provider value={context}>
            {children}
        </ApiContext.Provider>
    );
};
