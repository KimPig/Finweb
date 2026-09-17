import { Api } from '@jellyfin/sdk';
import { getBrandingApi } from '@jellyfin/sdk/lib/utils/api/branding-api';
import { queryOptions, useQuery } from '@tanstack/react-query';
import type { AxiosRequestConfig } from 'axios';

import { useBrandingApi } from 'hooks/useBrandingApi';

export const QUERY_KEY = 'BrandingOptions';

const fetchBrandingOptions = async (
    api: Api,
    options?: AxiosRequestConfig
) => {
    return getBrandingApi(api)
        .getBrandingOptions(options)
        .then(({ data }) => data);
};

export const getBrandingOptionsQuery = (
    api?: Api
) => queryOptions({
    queryKey: [ QUERY_KEY, api?.basePath ],
    queryFn: ({ signal }) => fetchBrandingOptions(api!, { signal }),
    enabled: !!api
});

export const useBrandingOptions = () => {
    return useQuery(getBrandingOptionsQuery(useBrandingApi()));
};
