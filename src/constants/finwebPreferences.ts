// UI policy only: playback/rendering features and stored preferences remain intact.
export const finwebPreferences = {
    displayCustomization: false,
    playbackAdvanced: false,
    subtitles: false
};

export const isVisiblePreferenceRoute = (route: { path: string }) => (
    finwebPreferences.subtitles || route.path !== 'mypreferencessubtitles'
);
