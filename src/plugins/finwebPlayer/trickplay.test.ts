import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from 'jellyfin-apiclient';
import { getTrickplayTile } from './trickplay';

describe('Shared Jellyfin trickplay adapter', () => {
    const getUrl = vi.fn((path: string) => path);
    const api = { getUrl, accessToken: () => 'fixture-token' } as unknown as ApiClient;
    const info = { Width: 160, Height: 90, TileWidth: 2, TileHeight: 2, Interval: 1000 };

    it('uses absolute ticks and selects the next sheet at its boundary', () => {
        expect(getTrickplayTile(api, info, 'item', 'version', 30_000_000)).toEqual({
            url: 'Videos/item/Trickplay/160/0.jpg', x: -160, y: -90
        });
        const tile = getTrickplayTile(api, info, 'item', 'version', 40_000_000);
        expect(tile?.url).toBe('Videos/item/Trickplay/160/1.jpg');
        expect(tile?.x).toBe(-0);
        expect(tile?.y).toBe(-0);
    });

    it('preserves server authentication and the played media source', () => {
        getTrickplayTile(api, info, 'item', 'alternate-version', 0);
        expect(getUrl).toHaveBeenLastCalledWith('Videos/item/Trickplay/160/0.jpg', {
            ApiKey: 'fixture-token', MediaSourceId: 'alternate-version'
        });
    });

    it('rejects invalid server tile metadata instead of dividing by zero', () => {
        expect(getTrickplayTile(api, { ...info, Interval: 0 }, 'item', 'source', 0)).toBeUndefined();
        expect(getTrickplayTile(api, {}, 'item', 'source', 0)).toBeUndefined();
    });
});
