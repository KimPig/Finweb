import * as userSettings from 'scripts/settings/userSettings';
import focusManager from 'components/focusManager';
import homeSections from 'components/homesections/homesections';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { playbackManager } from 'components/playback/playbackmanager';
import Events from 'utils/events';
import { getPendingHomePlaybackReports } from 'utils/query/pendingHomePlaybackReports';

import 'elements/emby-itemscontainer/emby-itemscontainer';

class HomeTab {
    constructor(view, params) {
        this.view = view;
        this.params = params;
        this.apiClient = ServerConnections.currentApiClient();
        this.paused = true;
        this.sectionsContainer = view.querySelector('.sections');
        this.initialReportIds = new Set();
        view.querySelector('.sections').addEventListener('settingschange', onHomeScreenSettingsChanged.bind(this));
        this.onHomePlaybackReportReady = this.handleHomePlaybackReportReady.bind(this);
        Events.on(playbackManager, 'homeplaybackreportready', this.onHomePlaybackReportReady);
    }

    handleHomePlaybackReportReady(_event, playbackReport) {
        if (!this.matchesReport(playbackReport) || !this.sectionsContainer?.isConnected) return;
        void (this.sectionsLoading || Promise.resolve()).then(() => {
            if (!this.matchesReport(playbackReport) || !this.sectionsContainer?.isConnected) return;
            // The first Home load already waited for this report and fetched the latest lists.
            if (this.initialReportIds.has(playbackReport.id) && this.sectionsRendered) return;
            if (!this.sectionsRendered) {
                if (this.paused) return;
                return this.onResume({ refresh: true });
            }
            return homeSections.refreshPlaybackSections(this.sectionsContainer);
        }).catch(error => {
            console.warn('[Home] failed to refresh playback sections', error);
        });
    }

    matchesReport(playbackReport) {
        const current = ServerConnections.currentApiClient();
        return !!playbackReport?.userId && !!this.apiClient && !!current
            && this.apiClient.serverId() === playbackReport.serverId
            && this.apiClient.getCurrentUserId() === playbackReport.userId
            && current.serverId() === playbackReport.serverId
            && current.getCurrentUserId() === playbackReport.userId;
    }
    onResume(options) {
        if (!this.view) return Promise.resolve();
        this.paused = false;
        if (this.sectionsLoading) {
            return this.sectionsLoading.then(() => {
                if (!this.view || this.paused) return undefined;
                if (!this.sectionsRendered) return this.onResume(options);
                // loadSections already resumed and fetched these sections.
                return undefined;
            });
        }
        if (this.sectionsRendered) {
            const sectionsContainer = this.sectionsContainer;

            if (sectionsContainer) {
                return homeSections.resume(sectionsContainer, options);
            }

            return Promise.resolve();
        }

        const view = this.view;
        const sectionsContainer = this.sectionsContainer;
        const apiClient = this.apiClient;
        const pendingReports = getPendingHomePlaybackReports(apiClient.serverId(), apiClient.getCurrentUserId());
        pendingReports?.ids.forEach(id => {
            this.initialReportIds.add(id);
        });
        this.destroyHomeSections();
        this.sectionsRendered = true;
        const loading = apiClient.getCurrentUser()
            .then(user => {
                if (!this.view) return;
                const reports = getPendingHomePlaybackReports(apiClient.serverId(), apiClient.getCurrentUserId());
                reports?.ids.forEach(id => {
                    this.initialReportIds.add(id);
                });
                return homeSections.loadSections(view.querySelector('.sections'), apiClient, user, userSettings);
            })
            .then(() => {
                if (!this.view) {
                    homeSections.destroySections(sectionsContainer);
                    return;
                }
                if (this.paused) {
                    homeSections.pause(sectionsContainer);
                    return;
                }
                if (options.autoFocus) {
                    focusManager.autoFocus(view);
                }
            }).catch(err => {
                this.sectionsRendered = false;
                console.error(err);
            });
        const finished = loading.then(() => {
            if (this.sectionsLoading === finished) this.sectionsLoading = null;
        });
        this.sectionsLoading = finished;
        return finished;
    }
    onPause() {
        this.paused = true;
        const sectionsContainer = this.sectionsContainer;

        if (sectionsContainer) {
            homeSections.pause(sectionsContainer);
        }
    }
    destroy() {
        Events.off(playbackManager, 'homeplaybackreportready', this.onHomePlaybackReportReady);
        this.view = null;
        this.params = null;
        this.apiClient = null;
        this.destroyHomeSections();
        this.sectionsContainer = null;
    }
    destroyHomeSections() {
        const sectionsContainer = this.sectionsContainer;

        if (sectionsContainer) {
            homeSections.destroySections(sectionsContainer);
        }
    }
}

function onHomeScreenSettingsChanged() {
    this.sectionsRendered = false;

    if (!this.paused) {
        this.onResume({
            refresh: true
        });
    }
}

export default HomeTab;
