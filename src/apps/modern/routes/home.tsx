import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

import globalize from '../../../lib/globalize';
import { clearBackdrop } from '../../../components/backdrop/backdrop';
import layoutManager from '../../../components/layoutManager';
import Page from '../../../components/Page';
import { EventType } from 'constants/eventType';
import Events from 'utils/events';
import { useHomePlaybackVisibility } from './HomePlaybackVisibility';

import '../../../elements/emby-tabs/emby-tabs';
import '../../../elements/emby-button/emby-button';
import '../../../elements/emby-scroller/emby-scroller';

type OnResumeOptions = {
    autoFocus?: boolean;
    refresh?: boolean
};

type ControllerProps = {
    onResume: (
        options: OnResumeOptions
    ) => void | Promise<unknown>;
    refreshed: boolean;
    onPause: () => void;
    destroy: () => void;
};

const Home = () => {
    const isActive = useHomePlaybackVisibility();
    const active = useRef(isActive);
    active.current = isActive;
    const loadRequest = useRef(0);
    const [ searchParams ] = useSearchParams();
    const homeTabIndex = useRef(0);
    if (isActive) homeTabIndex.current = parseInt(searchParams.get('tab') ?? '0', 10);
    const initialTabIndex = homeTabIndex.current;

    const libraryMenu = useMemo(async () => ((await import('../../../scripts/libraryMenu')).default), []);
    const mainTabsManager = useMemo(() => import('../../../components/maintabsmanager'), []);
    const tabController = useRef<ControllerProps | null>();
    const tabControllers = useMemo<ControllerProps[]>(() => [], []);

    const documentRef = useRef<Document>(document);
    const element = useRef<HTMLDivElement>(null);

    const setTitle = useCallback(async () => {
        const menu = await libraryMenu;
        if (active.current) menu.setTitle(null);
    }, [libraryMenu]);

    const getTabs = () => {
        return [{
            name: globalize.translate('Home')
        }, {
            name: globalize.translate('Favorites')
        }];
    };

    const getTabContainers = () => {
        return element.current?.querySelectorAll('.tabContent');
    };

    const getTabController = useCallback((index: number) => {
        if (index == null) {
            throw new Error('index cannot be null');
        }

        let depends = '';

        switch (index) {
            case 0:
                depends = 'hometab';
                break;

            case 1:
                depends = 'favorites';
        }

        return import(/* webpackChunkName: "[request]" */ `../../../apps/legacy/controllers/${depends}`).then(({ default: ControllerFactory }) => {
            if (!active.current || !element.current) return null;
            let controller = tabControllers[index];

            if (!controller) {
                const tabContent = element.current?.querySelector(".tabContent[data-index='" + index + "']");
                controller = new ControllerFactory(tabContent, null);
                tabControllers[index] = controller;
            }

            return controller;
        });
    }, [ tabControllers ]);

    const loadTab = useCallback(async (index: number, previousIndex: number | null) => {
        const request = ++loadRequest.current;
        try {
            const controller = await getTabController(index);
            if (!controller || request !== loadRequest.current || !active.current) return;
            const refresh = !controller.refreshed;

            await controller.onResume({
                autoFocus: previousIndex == null && layoutManager.tv,
                refresh: refresh
            });

            if (request !== loadRequest.current) return;
            controller.refreshed = true;
            tabController.current = controller;
        } catch (err) {
            console.error('[Home] failed to get tab controller', err);
        }
    }, [ getTabController ]);

    const onTabChange = useCallback((e: { detail: { selectedTabIndex: string; previousIndex: number | null }; }) => {
        const newIndex = parseInt(e.detail.selectedTabIndex, 10);
        const previousIndex = e.detail.previousIndex;

        const previousTabController = previousIndex == null ? null : tabControllers[previousIndex];
        if (previousTabController?.onPause) {
            previousTabController.onPause();
        }

        void loadTab(newIndex, previousIndex);
    }, [ loadTab, tabControllers ]);

    const onSetTabs = useCallback(async () => {
        const tabs = await mainTabsManager;
        if (active.current) tabs.setTabs(element.current, initialTabIndex, getTabs, getTabContainers, null, onTabChange, false);
    }, [ initialTabIndex, mainTabsManager, onTabChange ]);

    const onResume = useCallback(async () => {
        if (!active.current) return;
        void setTitle();
        clearBackdrop();

        const currentTabController = tabController.current;

        if (!currentTabController) {
            const tabs = await mainTabsManager;
            if (active.current) tabs.selectedTabIndex(initialTabIndex);
        } else if (currentTabController?.onResume) {
            await currentTabController.onResume({});
        }
        if (active.current) documentRef.current.querySelector('.skinHeader')?.classList.add('noHomeButtonHeader');
    }, [ initialTabIndex, mainTabsManager, setTitle ]);

    const onPause = useCallback(() => {
        tabControllers.forEach(controller => {
            controller.onPause();
        });
        documentRef.current.querySelector('.skinHeader')?.classList.remove('noHomeButtonHeader');
    }, [tabControllers]);

    const renderHome = useCallback(() => {
        if (!active.current) return;
        void onSetTabs();
        void onResume();
    }, [ onResume, onSetTabs ]);

    useLayoutEffect(() => {
        const requests = loadRequest;
        if (isActive && documentRef.current?.querySelector('.headerTabs')) {
            renderHome();
        }

        return () => {
            requests.current++;
            onPause();
        };
    }, [isActive, onPause, renderHome]);

    useEffect(() => {
        return () => {
            tabControllers.forEach(controller => {
                controller.destroy();
            });
            tabControllers.length = 0;
            tabController.current = null;
        };
    }, [tabControllers]);

    useEffect(() => {
        const doc = documentRef.current;
        if (doc) Events.on(doc, EventType.HEADER_RENDERED, renderHome);

        return () => {
            if (doc) Events.off(doc, EventType.HEADER_RENDERED, renderHome);
        };
    }, [ renderHome ]);

    return (
        <div ref={element}>
            <Page
                isActive={isActive}
                id='indexPage'
                className='mainAnimatedPage homePage libraryPage allLibraryPage pageWithAbsoluteTabs withTabs'
                isBackButtonEnabled={false}
                backDropType={[
                    BaseItemKind.Movie,
                    BaseItemKind.Series,
                    BaseItemKind.Book
                ]}
            >
                <div className='tabContent pageTabContent' id='homeTab' data-index='0'>
                    <div className='sections'></div>
                </div>
                <div className='tabContent pageTabContent' id='favoritesTab' data-index='1'>
                    <div className='sections'></div>
                </div>
            </Page>
        </div>
    );
};

export default Home;
