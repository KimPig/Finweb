import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SeekPreview from './SeekPreview';

describe('SeekPreview', () => {
    let preview: SeekPreview;
    let bubble: HTMLDivElement;
    let images: HTMLImageElement[];
    const tile = { width: 320, height: 180, x: -320, y: -180 };
    const source = { url: '/sheet-0.jpg', tile };
    const media = () => bubble.querySelector<HTMLElement>('.finweb-seek-image')!;
    const finish = (index: number, event = 'load') => images[index].dispatchEvent(new Event(event));

    beforeEach(() => {
        images = [];
        vi.stubGlobal('Image', vi.fn(function () {
            const image = document.createElement('img');
            Object.defineProperties(image, {
                naturalWidth: { value: 640 }, naturalHeight: { value: 360 }
            });
            images.push(image);
            return image;
        }));
        bubble = document.createElement('div');
        document.body.appendChild(bubble);
        preview = new SeekPreview();
    });

    afterEach(() => {
        preview.reset();
        document.body.textContent = '';
        vi.unstubAllGlobals();
    });

    it('reserves 85% image dimensions without displaying an image while loading', () => {
        preview.update(bubble, '13:29', '', source);
        expect(media().style.width).toBe('272px');
        expect(media().style.height).toBe('153px');
        expect(media().style.backgroundImage).toBe('none');
        expect(media().classList.contains('finweb-seek-loading')).toBe(true);
        expect(media().hidden).toBe(false);
        expect(bubble.querySelector('.chapterThumbText-dim')?.textContent).toBe('');
    });

    it('shows the sheet immediately on load and scales both sprite size and offsets', () => {
        preview.update(bubble, '13:29', 'Chapter 3', source);
        finish(0);
        expect(media().style.backgroundImage).toContain('/sheet-0.jpg');
        expect(media().style.backgroundSize).toBe('544px 306px');
        expect(media().style.backgroundPosition).toBe('-272px -153px');
        expect(media().classList.contains('finweb-seek-loading')).toBe(false);
    });

    it('reuses one request and renders the latest tile/time within a pending sheet', () => {
        preview.update(bubble, '1:00', '', source);
        preview.update(bubble, '2:00', 'Next', { ...source, tile: { ...tile, x: 0, y: 0 } });
        finish(0);
        expect(images).toHaveLength(1);
        expect(media().style.backgroundPosition).toBe('0px 0px');
        expect(bubble.querySelector('h2')?.textContent).toBe('2:00');
        expect(bubble.querySelector('.chapterThumbText-dim')?.textContent).toBe('Next');
    });

    it('does not flash a spinner again for a loaded sheet', () => {
        preview.update(bubble, '1:00', '', source);
        finish(0);
        preview.update(bubble, '2:00', '', source);
        expect(images).toHaveLength(1);
        expect(media().classList.contains('finweb-seek-loading')).toBe(false);
    });

    it('ignores stale success and failure after moving to a different sheet', () => {
        preview.update(bubble, '1:00', '', source);
        preview.update(bubble, '3:00', '', { ...source, url: '/sheet-1.jpg' });
        finish(0);
        expect(media().style.backgroundImage).toBe('none');
        expect(media().classList.contains('finweb-seek-loading')).toBe(true);
        finish(1);
        preview.update(bubble, '4:00', '', { ...source, url: '/sheet-2.jpg' });
        preview.update(bubble, '3:00', '', { ...source, url: '/sheet-1.jpg' });
        finish(2, 'error');
        expect(media().hidden).toBe(false);
        expect(media().style.backgroundImage).toContain('/sheet-1.jpg');
    });

    it('removes image space and spinner on error, keeps time/chapter and allows other images', () => {
        preview.update(bubble, '1:00', 'Chapter', source);
        finish(0, 'error');
        expect(media().hidden).toBe(true);
        expect(media().classList.contains('finweb-seek-loading')).toBe(false);
        expect(bubble.querySelector('.finweb-seek-has-image')).toBeNull();
        expect(bubble.textContent).toBe('1:00Chapter');
        preview.update(bubble, '2:00', '', { ...source, url: '/sheet-1.jpg' });
        expect(media().hidden).toBe(false);
        finish(1);
        expect(media().style.backgroundImage).toContain('/sheet-1.jpg');
    });

    it('handles chapter images through the same loader and preserves their aspect ratio', () => {
        preview.update(bubble, '1:00', 'Chapter', { url: '/chapter.jpg' });
        expect(media().classList.contains('finweb-seek-chapter')).toBe(true);
        expect(media().style.width).toBe('');
        finish(0);
        expect(media().style.getPropertyValue('--finweb-chapter-ratio')).toBe(String(640 / 360));
        expect(media().style.backgroundSize).toBe('100% 100%');
    });

    it('handles missing images and chapter names without requests or raw HTML', () => {
        preview.update(bubble, '1:00', '<img src=x onerror=alert(1)>');
        expect(media().hidden).toBe(true);
        expect(images).toHaveLength(0);
        expect(bubble.querySelector('img')).toBeNull();
        preview.update(bubble, '2:00', '');
        expect(bubble.textContent).toBe('2:00');
    });

    it('bounds the sheet cache and detaches callbacks on eviction and view exit', () => {
        for (let index = 0; index < 10; index++) {
            preview.update(bubble, '1:00', '', { ...source, url: `/sheet-${index}.jpg` });
        }
        expect(images[0].onload).toBeNull();
        expect(images[1].onerror).toBeNull();
        expect(images[9].onload).not.toBeNull();
        preview.reset();
        expect(images.every(image => image.onload === null && image.onerror === null)).toBe(true);
        expect(bubble.children).toHaveLength(0);
        preview.update(bubble, '1:00', '', source);
        expect(images).toHaveLength(11);
    });
});
