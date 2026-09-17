const IMAGE_SCALE = 0.85;
const CACHE_LIMIT = 8;

interface PreviewImage {
    url: string;
    tile?: { width: number; height: number; x: number; y: number };
}

interface ImageResource {
    image: HTMLImageElement;
    state: 'loading' | 'ready' | 'error';
}

/** Content only; the standard slider owns pointer tracking and positioning. */
export default class SeekPreview {
    private readonly container = document.createElement('div');
    private readonly media = document.createElement('div');
    private readonly time = document.createElement('h2');
    private readonly chapter = document.createElement('div');
    private readonly resources = new Map<string, ImageResource>();
    private current?: PreviewImage;
    private resource?: ImageResource;
    private initialized = false;

    constructor() {
        this.container.className = 'chapterThumbContainer finweb-seek-preview';
        this.media.className = 'chapterThumbWrapper finweb-seek-image';
        this.media.setAttribute('aria-hidden', 'true');
        const text = document.createElement('div');
        text.className = 'chapterThumbTextContainer';
        this.time.className = 'chapterThumbText';
        this.chapter.className = 'chapterThumbText chapterThumbText-dim';
        text.append(this.time, this.chapter);
        this.container.append(this.media, text);
    }

    update(bubble: HTMLElement, time: string, chapter: string, source?: PreviewImage) {
        const chapterName = chapter.trim();
        if (this.time.textContent !== time) this.time.textContent = time;
        if (this.chapter.textContent !== chapterName) this.chapter.textContent = chapterName;
        if (this.container.parentElement !== bubble) {
            bubble.textContent = '';
            bubble.appendChild(this.container);
        }

        const previous = this.current;
        this.current = source;
        if (!this.initialized || previous?.url !== source?.url) {
            this.initialized = true;
            this.resource = source ? this.getResource(source.url) : undefined;
            this.updateLoadState();
        } else if (previous?.tile?.width !== source?.tile?.width || previous?.tile?.height !== source?.tile?.height) {
            this.updateImageSize();
        }

        // Moving within a sheet only changes the crop, never its loading state.
        if (source?.tile) {
            this.setStyle('background-position', `${source.tile.x * IMAGE_SCALE}px ${source.tile.y * IMAGE_SCALE}px`);
        } else {
            this.setStyle('background-position', 'center');
        }
    }

    private getResource(url: string): ImageResource {
        let resource = this.resources.get(url);
        if (!resource) {
            resource = { image: new Image(), state: 'loading' };
            const entry = resource;
            const finish = (state: ImageResource['state']) => {
                entry.state = state;
                entry.image.onload = null;
                entry.image.onerror = null;
                if (this.current?.url === url && this.resource === entry) this.updateLoadState();
            };
            resource.image.onload = () => finish('ready');
            resource.image.onerror = () => finish('error');
            resource.image.src = url;
        }
        this.resources.delete(url);
        this.resources.set(url, resource);
        if (this.resources.size > CACHE_LIMIT) {
            const oldest = this.resources.keys().next().value!;
            const discarded = this.resources.get(oldest)!;
            discarded.image.onload = null;
            discarded.image.onerror = null;
            this.resources.delete(oldest);
        }
        return resource;
    }

    private updateLoadState() {
        const state = this.resource?.state;
        const hasImage = Boolean(this.resource && state !== 'error');
        this.container.classList.toggle('finweb-seek-has-image', hasImage);
        this.media.hidden = !hasImage;
        this.media.classList.toggle('finweb-seek-loading', state === 'loading');
        this.media.style.backgroundImage = state === 'ready' && this.current ?
            `url(${JSON.stringify(this.current.url)})` : 'none';
        this.updateImageSize();
    }

    private updateImageSize() {
        const tile = this.current?.tile;
        const image = this.resource?.state === 'ready' ? this.resource.image : undefined;
        this.media.classList.toggle('finweb-seek-chapter', Boolean(this.current && !tile));
        this.setStyle('width', tile ? `${tile.width * IMAGE_SCALE}px` : '');
        this.setStyle('height', tile ? `${tile.height * IMAGE_SCALE}px` : '');
        this.setStyle('background-size', tile && image ?
            `${image.naturalWidth * IMAGE_SCALE}px ${image.naturalHeight * IMAGE_SCALE}px` : '100% 100%');
        this.setStyle('--finweb-chapter-ratio', !tile && image ? String(image.naturalWidth / image.naturalHeight) : '');
    }

    private setStyle(property: string, value: string) {
        if (this.media.style.getPropertyValue(property) !== value) {
            this.media.style.setProperty(property, value);
        }
    }

    reset() {
        this.current = undefined;
        this.resource = undefined;
        this.initialized = false;
        this.container.remove();
        for (const { image } of this.resources.values()) {
            image.onload = null;
            image.onerror = null;
        }
        this.resources.clear();
    }
}
