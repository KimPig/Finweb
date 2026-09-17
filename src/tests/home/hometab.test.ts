import { afterEach, expect, it, vi } from 'vitest';
import Events from 'utils/events';

const mocks = vi.hoisted(() => ({
    manager: {},
    current: vi.fn(),
    refresh: vi.fn(),
    load: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
    destroy: vi.fn(),
    pending: vi.fn()
}));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { currentApiClient: mocks.current } }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: mocks.manager }));
vi.mock('scripts/settings/userSettings', () => ({}));
vi.mock('components/focusManager', () => ({ default: { autoFocus: vi.fn() } }));
vi.mock('components/homesections/homesections', () => ({
    default: { refreshPlaybackSections: mocks.refresh, loadSections: mocks.load, resume: mocks.resume, pause: mocks.pause, destroySections: mocks.destroy }
}));
vi.mock('elements/emby-itemscontainer/emby-itemscontainer', () => ({}));
vi.mock('utils/query/pendingHomePlaybackReports', () => ({ getPendingHomePlaybackReports: mocks.pending }));

import HomeTab from '../../apps/legacy/controllers/hometab';

const controllers: InstanceType<typeof HomeTab>[] = [];
afterEach(() => {
    controllers.splice(0).forEach(controller => {
        controller.destroy();
    });
    document.body.innerHTML = '';
    vi.clearAllMocks();
    mocks.pending.mockReset();
});

it.each(['pause', 'destroy'] as const)('keeps late-loading Home inactive after %s', async action => {
    const apiClient = {
        serverId: () => 'server-a', getCurrentUserId: () => 'user-a',
        getCurrentUser: () => Promise.resolve({ Id: 'user-a' })
    };
    mocks.current.mockReturnValue(apiClient);
    let finishLoad!: () => void;
    mocks.load.mockImplementationOnce(() => new Promise<void>(resolve => {
        finishLoad = resolve;
    }));
    const view = document.createElement('div');
    view.innerHTML = '<div class="sections"></div>';
    document.body.append(view);
    const sections = view.querySelector('.sections');
    const controller = new HomeTab(view, null);
    controllers.push(controller);
    const loading = controller.onResume({});
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    if (action === 'pause') controller.onPause();
    else controller.destroy();
    mocks.pause.mockClear();
    mocks.destroy.mockClear();
    finishLoad();
    await loading;
    if (action === 'pause') expect(mocks.pause).toHaveBeenCalledWith(sections);
    else expect(mocks.destroy).toHaveBeenCalledWith(sections);
});

it('retries an initial Home load cancelled by a completed playback report', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const apiClient = {
        serverId: () => 'server-a', getCurrentUserId: () => 'user-a',
        getCurrentUser: () => Promise.resolve({ Id: 'user-a' })
    };
    mocks.current.mockReturnValue(apiClient);
    const view = document.createElement('div');
    view.innerHTML = '<div class="sections"></div>';
    document.body.append(view);
    const controller = new HomeTab(view, null);
    controllers.push(controller);
    let failOldLoad!: (error: Error) => void;
    mocks.load.mockImplementationOnce(() => new Promise((_resolve, reject) => {
        failOldLoad = reject;
    })).mockResolvedValueOnce(undefined);
    const firstLoad = controller.onResume({});
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    Events.trigger(mocks.manager, 'homeplaybackreportready', [{ serverId: 'server-a', userId: 'user-a' }]);
    failOldLoad(new Error('old query cancelled'));
    await firstLoad;
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    expect(controller.sectionsRendered).toBe(true);
});

it('refreshes visible Home only after a matching user/server playback report', async () => {
    const apiClient = { serverId: () => 'server-a', getCurrentUserId: () => 'user-a' };
    mocks.current.mockReturnValue(apiClient);
    mocks.refresh.mockResolvedValue(undefined);
    const view = document.createElement('div');
    view.innerHTML = '<div class="sections"></div>';
    document.body.append(view);
    const controller = new HomeTab(view, null);
    controllers.push(controller);
    controller.sectionsRendered = true;

    Events.trigger(mocks.manager, 'homeplaybackreportready', [{ serverId: 'server-a', userId: 'user-a' }]);
    await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalledWith(view.querySelector('.sections')));
    mocks.refresh.mockClear();

    Events.trigger(mocks.manager, 'homeplaybackreportready', [{ serverId: 'server-b', userId: 'user-a' }]);
    Events.trigger(mocks.manager, 'homeplaybackreportready', [{ serverId: 'server-a', userId: 'user-b' }]);
    mocks.current.mockReturnValue({ serverId: () => 'server-a', getCurrentUserId: () => 'user-b' });
    Events.trigger(mocks.manager, 'homeplaybackreportready', [{ serverId: 'server-a', userId: 'user-a' }]);
    expect(mocks.refresh).not.toHaveBeenCalled();

    controller.destroy();
    controllers.pop();
    mocks.current.mockReturnValue(apiClient);
    Events.trigger(mocks.manager, 'homeplaybackreportready', [{ serverId: 'server-a', userId: 'user-a' }]);
    expect(mocks.refresh).not.toHaveBeenCalled();
});

it('does not redraw after the initial Home load waited for the stop report', async () => {
    const apiClient = {
        serverId: () => 'server-a', getCurrentUserId: () => 'user-a',
        getCurrentUser: () => Promise.resolve({ Id: 'user-a' })
    };
    mocks.current.mockReturnValue(apiClient);
    mocks.pending.mockReturnValue({ ids: [7], done: Promise.resolve() });
    let finishLoad!: () => void;
    mocks.load.mockImplementation(() => new Promise<void>(resolve => {
        finishLoad = resolve;
    }));

    const view = document.createElement('div');
    view.innerHTML = '<div class="sections"></div>';
    document.body.append(view);
    const controller = new HomeTab(view, null);
    controllers.push(controller);
    const firstLoad = controller.onResume({});
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));

    Events.trigger(mocks.manager, 'homeplaybackreportready', [{ serverId: 'server-a', userId: 'user-a', id: 7 }]);
    finishLoad();
    await firstLoad;
    await Promise.resolve();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.load).toHaveBeenCalledTimes(1);
});

it('does not fetch the initial sections again when Home resumes during their first load', async () => {
    const apiClient = {
        serverId: () => 'server-a', getCurrentUserId: () => 'user-a',
        getCurrentUser: () => Promise.resolve({ Id: 'user-a' })
    };
    mocks.current.mockReturnValue(apiClient);
    let finishLoad!: () => void;
    mocks.load.mockImplementation(() => new Promise<void>(resolve => {
        finishLoad = resolve;
    }));
    const view = document.createElement('div');
    view.innerHTML = '<div class="sections"></div>';
    document.body.append(view);
    const controller = new HomeTab(view, null);
    controllers.push(controller);

    const firstLoad = controller.onResume({ refresh: true });
    const secondResume = controller.onResume({ refresh: true });
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    finishLoad();
    await Promise.all([firstLoad, secondResume]);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.resume).not.toHaveBeenCalled();
});
