import type { ApiClient } from 'jellyfin-apiclient';
import type { TrickplayInfoDto } from '@jellyfin/sdk/lib/generated-client/models/trickplay-info-dto';

/** Jellyfin tiles use the item's absolute timeline, including after transcoding. */
export function getTrickplayTile(api: ApiClient, info: TrickplayInfoDto, itemId: string, mediaSourceId: string, positionTicks: number) {
    const { Width, Height, Interval, TileWidth, TileHeight } = info;
    if (![Width, Height, Interval, TileWidth, TileHeight].every(value => Number.isFinite(value) && value! > 0)
        || !Number.isFinite(positionTicks)) return undefined;
    const tile = Math.floor(Math.max(0, positionTicks) / 10_000 / Interval!);
    const sheetSize = TileWidth! * TileHeight!;
    const offset = tile % sheetSize;
    return {
        url: api.getUrl(`Videos/${encodeURIComponent(itemId)}/Trickplay/${Width}/${Math.floor(tile / sheetSize)}.jpg`, {
            ApiKey: api.accessToken(), MediaSourceId: mediaSourceId
        }),
        x: -(offset % TileWidth!) * Width!,
        y: -Math.floor(offset / TileWidth!) * Height!
    };
}
