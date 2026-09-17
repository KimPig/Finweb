import { expect, it, vi } from 'vitest';

vi.mock('components/images/blurhash.worker.ts', () => ({ default: class { addEventListener = vi.fn(); } }));
vi.mock('components/lazyLoader/lazyLoaderIntersectionObserver', () => ({ lazyChildren: vi.fn() }));
vi.mock('scripts/settings/userSettings', () => ({}));

import { fillImage } from '../../components/images/imageLoader';

it('keeps a loaded poster while Home is hidden, without disabling normal offscreen unloading', () => {
    const home = document.createElement('div');
    home.setAttribute('data-finweb-retained-home', '');
    home.hidden = true;
    const image = document.createElement('div');
    image.style.backgroundImage = 'url("https://example.test/poster.jpg")';
    image.className = 'lazy lazy-image-fadein';
    home.append(image);
    const background = image.style.backgroundImage;
    fillImage({ target: image, isIntersecting: false });
    expect(image.style.backgroundImage).toBe(background);
    expect(image.hasAttribute('data-src')).toBe(false);
    home.hidden = false;
    fillImage({ target: image, isIntersecting: true });
    expect(image.style.backgroundImage).toBe(background);
    fillImage({ target: image, isIntersecting: false });
    expect(image.style.backgroundImage).toBe('none');
    expect(image.classList.contains('lazy-hidden')).toBe(true);
});
