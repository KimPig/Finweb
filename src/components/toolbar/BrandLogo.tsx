import React from 'react';
import banner from '@jellyfin/ux-web/banner-light.png';

export default function BrandLogo() {
    return <img className='finweb-brand-logo' src={banner} alt='Jellyfin' width={140} height={40} />;
}
