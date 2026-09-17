import React, { type FC } from 'react';

import { useUserSettings } from 'hooks/useUserSettings';
import { useBrandingOptions } from 'apps/dashboard/features/branding/api/useBrandingOptions';
import { readCustomScript } from 'utils/finweb/customScriptSettings';

const CustomCss: FC = () => {
    const { data: brandingOptions } = useBrandingOptions();
    const { customCss: userCustomCss, disableCustomCss } = useUserSettings();

    return (
        <>
            {!disableCustomCss && brandingOptions?.CustomCss && (
                <style>
                    {readCustomScript(brandingOptions.CustomCss).css}
                </style>
            )}
            {userCustomCss && (
                <style>
                    {userCustomCss}
                </style>
            )}
        </>
    );
};

export default CustomCss;
