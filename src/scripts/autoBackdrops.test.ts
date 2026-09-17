import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    clear: vi.fn(),
    set: vi.fn(),
    query: vi.fn(),
    getApi: vi.fn((id?: string) => ({ id, getUri: () => `/${id}/Branding/Splashscreen` })),
    show: undefined as ((this: HTMLElement) => void) | undefined
}));

vi.mock('components/backdrop/backdrop', () => ({ clearBackdrop: mocks.clear, setBackdropImages: mocks.set, setBackdrops: vi.fn() }));
vi.mock('scripts/settings/userSettings', () => ({ enableBackdrops: () => false }));
vi.mock('scripts/libraryMenu', () => ({ default: {} }));
vi.mock('utils/dashboard', () => ({
    pageClassOn: (_event: string, _className: string, callback: typeof mocks.show) => {
        mocks.show = callback;
    }
}));
vi.mock('utils/query/queryClient', () => ({ queryClient: { fetchQuery: mocks.query } }));
vi.mock('apps/dashboard/features/branding/api/useBrandingOptions', () => ({ getBrandingOptionsQuery: (api: unknown) => api }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApi: mocks.getApi } }));

function showLogin(server: string) {
    window.location.hash = `#/login?serverid=${server}`;
    const page = document.createElement('div');
    page.className = 'page backdropPage';
    page.dataset.backdroptype = 'splashscreen';
    mocks.show?.call(page);
}

beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    await import('./autoBackdrops');
});

describe('official login branding', () => {
    it('uses the selected login server and respects the splashscreen switch', async () => {
        mocks.query.mockResolvedValue({ SplashscreenEnabled: true });
        showLogin('server-b');
        await Promise.resolve();
        expect(mocks.getApi).toHaveBeenCalledWith('server-b');
        expect(mocks.set).toHaveBeenCalledWith(['/server-b/Branding/Splashscreen']);
        mocks.set.mockClear();
        mocks.query.mockResolvedValue({ SplashscreenEnabled: false });
        showLogin('server-b');
        await Promise.resolve();
        expect(mocks.set).not.toHaveBeenCalled();
        expect(mocks.clear).toHaveBeenCalled();
    });

    it('ignores a slow response from the previous server', async () => {
        let finishA: ((data: unknown) => void) | undefined;
        mocks.query.mockImplementationOnce(() => new Promise(resolve => {
            finishA = resolve;
        }));
        showLogin('server-a');
        mocks.query.mockResolvedValue({ SplashscreenEnabled: true });
        showLogin('server-b');
        await Promise.resolve();
        finishA?.({ SplashscreenEnabled: true });
        await Promise.resolve();
        expect(mocks.set.mock.calls).toEqual([[['/server-b/Branding/Splashscreen']]]);
    });

    it('clears the backdrop instead of failing login when branding cannot load', async () => {
        mocks.query.mockRejectedValue(new Error('Offline'));
        showLogin('server-a');
        await Promise.resolve();
        expect(mocks.set).not.toHaveBeenCalled();
        expect(mocks.clear).toHaveBeenCalled();
    });
});
