import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import { useLocation, useSearchParams } from 'react-router-dom';

import { MetaView } from 'apps/modern/constants/metaView';
import { useAncestors } from 'apps/modern/features/libraries/hooks/api/useAncestors';
import { isDetailsPath, isLibraryPath } from 'apps/modern/features/libraries/utils/path';
import useCurrentTab from 'hooks/useCurrentTab';

export function getSelectedUserView(
    views: BaseItemDto[] | undefined,
    pathname: string,
    libraryId: string | null,
    collectionType: string | null,
    tab: number
) {
    if (!isDetailsPath(pathname) && !isLibraryPath(pathname) && !['/home', '/list'].includes(pathname)) return undefined;
    if (collectionType === CollectionType.Livetv) return views?.find(view => view.CollectionType === CollectionType.Livetv);
    if (pathname === '/home' && tab === 1) return MetaView.Favorites;
    // eslint-disable-next-line sonarjs/different-types-comparison
    return views?.find(view => view.Id === libraryId);
}

export function useSelectedUserView(views: BaseItemDto[] | undefined) {
    const { pathname } = useLocation();
    const [params] = useSearchParams();
    const { activeTab } = useCurrentTab();
    const { data: ancestors } = useAncestors({ itemId: params.get('id') || undefined });
    const libraryId = params.get('topParentId') || params.get('parentId')
        || ancestors?.find(item => item.Type === BaseItemKind.CollectionFolder)?.Id || null;
    return getSelectedUserView(views, pathname, libraryId, params.get('collectionType'), activeTab);
}
