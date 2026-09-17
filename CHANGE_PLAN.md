# Finweb Customizations

Maintained behavior in Finweb **12.1.0**, based on Jellyfin Web **12.1**.
Despite this file's historical name, this is a feature reference, not a list of
unimplemented proposals. See [UPSTREAM.md](UPSTREAM.md) for provenance.

## Interface

- Built-in square-edged theme, with primary `#4589FF` and action `#2474FF` accents.
  Dashboard and other management/setup routes keep Jellyfin's native styling.
- Permanent desktop sidebar at the existing 900px breakpoint, with Home,
  Favorites, libraries and permitted administrator/user actions.
- Non-clickable sidebar Jellyfin wordmark; login and dashboard use their own
  logo sizing and layout.
- Independent surfaces for account tools, library counts and library controls.
  Header spacing, stable scrollbar layout and bottom pagination are retained.
- On initial loading, account tools wait for user information, like the drawer;
  header space is reserved to avoid moving the page when they appear.
- Poster images reveal individually. The page does not wait for all images or
  add an artificial blurred loading stage.
- Detail-page metadata is grouped with the overview; episode rows retain a
  compact horizontal layout with a limited number of overview lines.
- Playback presentation hides the page, drawer and footer, including their
  pointer/keyboard interactions, while retaining the expanding poster animation.

Nested-folder library pages may still use the upstream legacy layout rather
than the modern library toolbar. They have not been independently redesigned.

## Preferences

Some preference controls are hidden, not deleted: server-CSS opt-out, user CSS,
dashboard theme, screensavers and intervals, faster animations, blurred image
placeholders, fMP4 preference, cinema mode, media-segment actions, advanced
video/audio settings and the subtitle-preferences page.

Existing stored settings remain effective. Normal theme selection and the
in-player subtitle controls remain available. New forward/backward skip defaults
are 10 seconds; explicit saved values are preserved. Intro/outro prompts and
their coordination with Up Next remain.

## Playback and Home

- Jellyfin playback management, browser video and hls.js remain the maintained path.
- ASS/SSA uses libass-wasm; SRT/WebVTT uses native text tracks. Background text
  preparation, media attachments and subtitle font-bridge integration remain.
- ASS may prepare during startup, but its canvas is not revealed over the
  preparation poster before the video has presented a frame.
- Seek images display at 85% of the official size. A real image load/error event
  ends the loading indicator; failure removes image space but keeps time/chapter
  labels. There is no artificial delay or preview request timeout.
- The pre-playback Home is retained during detail/video routes. Returning shows
  it immediately; Continue Watching and Next Up refresh after a successful stop
  report without first removing the old rows.
- Ordinary Home/library navigation retains the 12.1 query-cache behavior.
  Library page-position persistence is unchanged.

See [PLAYBACK.md](PLAYBACK.md) for details and diagnostic instructions.

## Configuration and Identity

Branding provides server-saved CSS and optional direct/external JavaScript, with
a recovery mode. Both JS inputs can be used together. Mobile visitors get both
recommended app links, Close and a separate permanent opt-out.
See [CONFIGURATION.md](CONFIGURATION.md).

Browser identity is Finweb 12.1.0; native-wrapper identity overrides remain.
The trailing `.0` is the current Finweb revision and has not been increased.

## Retired Work

Home test modes/selectors, replacement-player experiments, the alternate ASS
renderer and download-comparison UI are not part of the maintained client.
Their old locally saved settings have no effect. Shared production helpers and
regression tests remain; a helper directory name is not a selectable player.

The older patch-fork updater, installer scripts and patch-release workflow were
removed. Ordinary CI produces a build artifact; a matching stable version tag
triggers the separate Finweb release workflow. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the release checklist.
