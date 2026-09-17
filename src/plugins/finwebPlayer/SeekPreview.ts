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

/** One preview per OSD; sprite sheets are reused while the pointer moves. */
export default class SeekPreview {
    private readonly container = document.createElement('div');
    private readonly media = document.createElement('div');
    private readonly time = document.createElement('h2');
    private readonly chapter = document.createElement('div');
    private readonly resources = new Map<string, ImageResource>();
    private bubble?: HTMLElement;
    private current?: PreviewImage;

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
        this.bubble = bubble;
        this.current = source;
        this.time.textContent = time;
        this.chapter.textContent = chapter;
        if (this.container.parentElement !== bubble) {
            bubble.textContent = '';
            bubble.appendChild(this.container);
        }
        this.media.style.width = source?.tile ? `${source.tile.width * IMAGE_SCALE}px` : '';
        this.media.style.height = source?.tile ? `${source.tile.height * IMAGE_SCALE}px` : '';
        this.media.classList.toggle('finweb-seek-chapter', Boolean(source && !source.tile));
        this.media.style.removeProperty('--finweb-chapter-ratio');

        if (source) {
            let resource = this.resources.get(source.url);
            if (!resource) {
                resource = { image: new Image(), state: 'loading' };
                this.resources.set(source.url, resource);
                const entry = resource;
                const finish = (state: ImageResource['state']) => {
                    entry.state = state;
                    entry.image.onload = null;
                    entry.image.onerror = null;
                    // A late response must not replace a newer sheet or chapter.
                    if (this.current?.url === source.url && this.resources.get(source.url) === entry) {
                        this.render();
                    }
                };
                resource.image.onload = () => finish('ready');
                resource.image.onerror = () => finish('error');
                resource.image.src = source.url;
            }
            this.resources.delete(source.url);
            this.resources.set(source.url, resource);
            if (this.resources.size > CACHE_LIMIT) {
                const oldest = this.resources.keys().next().value!;
                const discarded = this.resources.get(oldest)!;
                discarded.image.onload = null;
                discarded.image.onerror = null;
                this.resources.delete(oldest);
            }
        }
        this.render();
    }

    private render() {
        const source = this.current;
        const resource = source && this.resources.get(source.url);
        const hasImage = Boolean(resource && resource.state !== 'error');
        this.container.classList.toggle('finweb-seek-has-image', hasImage);
        this.media.hidden = !hasImage;
        this.media.classList.toggle('finweb-seek-loading', resource?.state === 'loading');
        this.media.style.backgroundImage = 'none';

        if (source && resource?.state === 'ready') {
            const { image } = resource;
            this.media.style.backgroundImage = `url(${JSON.stringify(source.url)})`;
            if (source.tile) {
                this.media.style.backgroundSize = `${image.naturalWidth * IMAGE_SCALE}px ${image.naturalHeight * IMAGE_SCALE}px`;
                this.media.style.backgroundPosition = `${source.tile.x * IMAGE_SCALE}px ${source.tile.y * IMAGE_SCALE}px`;
            } else {
                this.media.style.backgroundSize = '100% 100%';
                this.media.style.backgroundPosition = 'center';
                this.media.style.setProperty('--finweb-chapter-ratio', String(image.naturalWidth / image.naturalHeight));
            }
        }
        this.clampPosition();
    }

    private clampPosition() {
        const bubble = this.bubble;
        if (!bubble || this.container.parentElement !== bubble) return;
        const trackWidth = bubble.parentElement?.getBoundingClientRect().width || 0;
        const width = bubble.getBoundingClientRect().width;
        const left = parseFloat(bubble.style.left);
        if (trackWidth && width && Number.isFinite(left)) {
            bubble.style.left = `${Math.max(width / 2, Math.min(left, trackWidth - width / 2))}px`;
        }
    }

    reset() {
        this.current = undefined;
        this.bubble = undefined;
        this.container.remove();
        for (const { image } of this.resources.values()) {
            image.onload = null;
            image.onerror = null;
        }
        this.resources.clear();
    }
}
