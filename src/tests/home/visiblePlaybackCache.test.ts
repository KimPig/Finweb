import { beforeAll, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ registerElement: vi.fn(), lazyChildren: vi.fn() }));
vi.mock('webcomponents.js/webcomponents-lite', () => ({}));
vi.mock('components/shortcuts', () => ({ default: { on: vi.fn(), off: vi.fn() } }));
vi.mock('scripts/inputManager', () => ({ default: {} }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: {} }));
vi.mock('components/images/imageLoader', () => ({ default: { lazyChildren: mocks.lazyChildren } }));
vi.mock('components/layoutManager', () => ({ default: { desktop: false, mobile: false, tv: false } }));
vi.mock('scripts/browser', () => ({ default: { touch: false } }));
vi.mock('utils/dom', () => ({ default: {} }));
vi.mock('components/loading/loading', () => ({ default: {} }));
vi.mock('components/focusManager', () => ({ default: {} }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { currentApiClient: () => null } }));

type ContainerPrototype = {
    pause: () => void;
    resume: (options: { refresh: boolean }) => Promise<void>;
    refreshItems: () => Promise<void>
};
let prototype: ContainerPrototype;

beforeAll(async () => {
    Object.defineProperty(document, 'registerElement', { configurable: true, value: mocks.registerElement });
    await import('../../elements/emby-itemscontainer/emby-itemscontainer');
    prototype = mocks.registerElement.mock.calls[0][1].prototype as ContainerPrototype;
});

it.each(['resume', 'nextup'])('retains the rendered %s row while its refresh is pending', async query => {
    const section = document.createElement('div');
    const container = Object.assign(document.createElement('div'), {
        pause: prototype.pause,
        resume: prototype.resume,
        refreshItems: prototype.refreshItems,
        parentContainer: section,
        getItemsHtml: (items: { Id: string }[]) => items.map(item => `<span>${item.Id}</span>`).join(''),
        fetchData: vi.fn<() => Promise<{ Items: { Id: string }[] }>>()
    });
    container.setAttribute('data-home-playback-query', query);
    container.innerHTML = '<span>previous card</span>';
    section.append(container);
    document.body.append(section);
    const card = container.firstChild;
    let finishFetch!: (result: { Items: { Id: string }[] }) => void;
    container.fetchData.mockImplementation(() => new Promise(resolve => {
        finishFetch = resolve;
    }));
    try {
        container.pause();
        await container.refreshItems();
        expect(container.fetchData).not.toHaveBeenCalled();
        const updating = container.resume({ refresh: false });
        expect(container.fetchData).toHaveBeenCalledTimes(1);
        expect(container.firstChild).toBe(card);
        expect(section.classList.contains('hide')).toBe(false);
        await Promise.resolve();
        expect(container.textContent).toBe('previous card');
        finishFetch({ Items: [{ Id: 'latest card' }] });
        await updating;
        expect(container.textContent).toBe('latest card');
        expect(section.classList.contains('hide')).toBe(false);
    } finally {
        section.remove();
    }
});
