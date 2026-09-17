import type { ApiClient } from 'jellyfin-apiclient';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getLanguages } from 'lib/globalize';

import { toApi, updateApiClientSdk } from './compat';

vi.mock('lib/globalize', () => ({ getLanguages: vi.fn() }));

function createClient() {
    return {
        appName: () => 'Finweb',
        appVersion: () => '12.1.0',
        deviceName: () => 'Test%20Browser',
        deviceId: () => 'test-device',
        serverAddress: () => 'https://example.com/jellyfin',
        accessToken: () => 'fixture-token'
    } as unknown as ApiClient;
}

describe('Finweb SDK compatibility', () => {
    beforeEach(() => {
        vi.mocked(getLanguages).mockReturnValue([ 'ko-kr', 'ko' ]);
    });

    it('preserves Finweb identity, credentials and languages in the real SDK', () => {
        const api = toApi(createClient());

        expect(api.clientInfo).toEqual({ name: 'Finweb', version: '12.1.0' });
        expect(api.deviceInfo).toEqual({
            name: 'Test Browser', id: 'test-device', languages: [ 'ko-kr', 'ko' ]
        });
        expect(api.basePath).toBe('https://example.com/jellyfin');
        expect(api.accessToken).toBe('fixture-token');
        expect(api.acceptLanguageHeader).toContain('ko-kr');
        expect(api.authorizationHeader).toContain('Test%20Browser');
        expect(api.authorizationHeader).not.toContain('%2520');
    });

    it('updates an existing SDK after language, server or authentication changes', () => {
        const client = createClient();
        const api = toApi(client);
        client._sdk = api;
        client.serverAddress = () => 'https://example.org/jellyfin';
        client.accessToken = () => 'replacement-fixture-token';
        vi.mocked(getLanguages).mockReturnValue([ 'en-us', 'en' ]);

        updateApiClientSdk(client);

        expect(client._sdk).toBe(api);
        expect(api.basePath).toBe('https://example.org/jellyfin');
        expect(api.accessToken).toBe('replacement-fixture-token');
        expect(api.deviceInfo.languages).toEqual([ 'en-us', 'en' ]);
        expect(api.acceptLanguageHeader).toContain('en-us');
        expect(api.acceptLanguageHeader).not.toContain('ko');
        expect(api.clientInfo).toEqual({ name: 'Finweb', version: '12.1.0' });
    });

    it('allows a legacy client without an SDK instance', () => {
        expect(() => updateApiClientSdk(createClient())).not.toThrow();
    });
});
