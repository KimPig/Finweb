# Finweb Change Plan

Base: Jellyfin Web v12.0 with the existing custom playback changes.
Display identity and npm version: Finweb 12.0.0 / 12.0.0.
Official Jellyfin Web base: 12.0 (recorded separately from Finweb's revision).
Implemented and production-built on 2026-09-14. No commit or push performed.

## Desktop Sidebar

Status: implemented in the modern layout; desktop breakpoint is 900px.

- Replace desktop top-level library navigation with a permanent left sidebar.
- Reuse the existing ResponsiveDrawer and MainDrawerContent components.
- Start from the previous custom CSS's 250px width and visual treatment.
- Coordinate sidebar, header, React content, legacy page containers, and the
  now-playing bar so content does not overlap or receive duplicate offsets.
- Keep search, profile, remote playback, and page-level filters available.
- Keep the mobile drawer collapsible; omit sidebar offsets on login and video.
- Preserve dashboard navigation and highlight the current library correctly.
- Replace conflicting legacy positioning rules instead of importing them intact.

## User Preferences Visibility

Status: implemented for modern and legacy settings.
Hide the controls, not their underlying features or saved settings.

### Display

- Disable server-provided custom CSS (disableCustomCss).
- Personal custom CSS (customCss).
- Server dashboard theme (dashboardTheme).
- Screensaver selection (screensaver).
- Screensaver activation time (screensaverTime).
- Backdrop screensaver interval (backdropScreensaverInterval).
- Photo slideshow interval (slideshowInterval).
- Faster animations (enableFasterAnimation / enableFastFadein).
- Blurred image placeholders (enableBlurHash / enableBlurhash).

Keep unlisted display controls, including the ordinary theme setting.

### Playback

- Prefer fMP4-HLS container.
- Cinema mode.
- Entire media-segment actions section, including its heading and all types.
- Entire advanced video section.
- Entire advanced audio section.

Keep the remaining playback controls. Hiding media-segment preferences must not
disable intro/outro skipping or the existing Up Next integration.

### Subtitles

- Hide the entire user-preferences subtitle section and its navigation entry.
- Retain subtitle loading, rendering, saved preferences, and playback controls.
- Scope assumption: this request concerns user preferences, not the in-player
  subtitle selector, subtitle on/off control, or subtitle timing controls.
- Keep the settings implementation available for a future visibility change.
  Direct subtitle-preferences URLs redirect to the preferences menu.

### Implementation Constraints

- Preserve hidden values when another visible setting is saved.
- React display settings can omit controls while retaining loaded form state.
- Legacy playback settings read input elements directly during load/save.
  Preserve those elements in hidden groups or explicitly adapt both paths.
- Use app-owned visibility rules that cannot be disabled by the custom-CSS toggle.
- Handle both modern and legacy settings screens if both layouts remain available.
- Do not reset old CSS, screensavers, codec preferences, or subtitle defaults
  merely because their controls become hidden. Any reset needs a separate decision.

## Seek Defaults

Status: implemented; explicit saved intervals are preserved.

- Forward default: 30 seconds -> 10 seconds (10000 milliseconds).
- Backward default: retain 10 seconds (10000 milliseconds).
- Keep both interval selectors visible and adjustable.
- Change the shared defaults in src/scripts/settings/userSettings.js so settings
  and player commands use the same values.
- Preserve explicitly saved values. Forcing existing users to 10 seconds would
  require a separate migration decision; these preferences can be stored on the
  server and shared with other Web installations.

## Verification Before Implementation Is Complete

- Hidden controls and empty headings are absent from normal settings navigation.
- Saving visible settings leaves all hidden settings unchanged.
- Existing media-segment and subtitle playback behavior remains available.
- Unset seek preferences resolve to 10 seconds in both directions.
- Previously saved seek values remain unchanged unless a migration is requested.
- Desktop/mobile navigation, login, playback, and dashboard layouts are checked.

## Implementation And Verification Results

- Visibility policy: src/constants/finwebPreferences.ts. Hidden legacy inputs
  remain mounted inside disabled fieldsets; React controls are not rendered.
  Both save paths skip hidden values instead of rewriting loaded defaults.
- The modern sidebar reuses the existing drawer, with a 250px width and shared
  library-selection logic. Page filters and header actions remain available.
- Scoped offsets cover React/legacy pages and the now-playing bar. Old CSS
  margin offsets are neutralized within the modern layout, including mobile.
- Intro/Outro AskToSkip defaults, Up Next collision avoidance, subtitle pipeline,
  and hold-to-2x playback code are unchanged from the copied source.
- npm test: all 223 tests passed (18 files).
- npm run build:check: passed.
- ESLint on changed UI/settings code and new test scripts: passed. The unchanged
  FIXME in userSettings.js remains an existing warning.
- Stylelint on the two changed SCSS files: passed.
- node scripts/test-finweb-preferences.mjs: passed; checks hidden controls and
  headings, actual save functions, subtitle route visibility, and seek defaults.
- node scripts/test-finweb-layout.mjs: passed in headless Chromium, using actual
  layout/drawer components with fixture service data. Widths checked: desktop
  900/1280/1920 and mobile 360/390/899. Checks geometry, old CSS offsets, active
  links, mobile open/close, logo loading, login/video, hidden display controls,
  and cleanup when switching to the default 240px dashboard drawer.
- node scripts/test-ass-browser.mjs: passed (WASM and legacy workers, slow fonts,
  startup mouse hold/release, SRT/ASS switching, off/on, worker recovery, seek,
  dual subtitles, mobile resize, and animated ASS at 2x).
- Browser scripts require an external Playwright installation via
  PLAYWRIGHT_MODULE; the ASS script also requires ffmpeg. No screenshots taken.
- npm run build:production: passed. Output: dist (12.0.finweb display version).
  Existing bundle-size warnings remain. Git revision lookup reports no HEAD
  because this new repository has no commits yet; this does not fail the build.
- npm run escheck: all 989 checked JavaScript files passed ES5 validation.
- Built dist smoke test: server-selection screen rendered in Chromium without
  uncaught page errors. Local preview is served at http://127.0.0.1:8097/.
- No authenticated live-server playback test was performed. Fixture tests do
  not establish that every previously reported subtitle race is eliminated.
- Original jellyfin-web source and GitHub repositories were not modified.
  Inherited patch/release automation remains unchanged and has not been run.

## Sidebar Revision: 10.11 Structure

- Replaced the modern list content with the 10.11 Home / Media / Admin / User
  structure and its navMenuOption/sidebarHeader classes, rendered through React.
  The legacy header, page events and player lifecycle are not reintroduced.
- Restored the Jellyfin symbol-and-wordmark banner. Server name/version and the
  separate sidebar Favorites entry are gone; favorites remain available in Home.
- Media contains permitted libraries and the Live TV guide when available.
- Admin contains Dashboard and Metadata Manager, only for administrator users.
- User contains Settings and Sign Out; Select Server and Exit follow the same
  host feature checks and action handlers as the current profile menu.
- Desktop retains a 250px permanent drawer. Mobile retains a collapsible drawer
  with independently scrollable menu content, including short-screen testing.
- Fixed the old CSS's :not(#editItemMetadataPage) specificity so the content
  margin is not applied twice. Also strengthened footer offset handling and
  excluded old global MUI AppBar padding from the modern header.
- Layout regression checks now include the real navigation selectors extracted
  in memory from the user's CSS via FINWEB_LEGACY_CSS_URL, loaded after Finweb's
  stylesheet, as well as the base library stylesheet. No screenshots are used.
- Checks cover section order, wordmark loading, long labels, admin permissions,
  feature-gated actions, mobile scrolling/actions, active links, and zero-height
  video header. These are fixture checks, not an authenticated server session.
- Revision verification: 223 unit tests, preference-preservation checks, layout
  checks (including Live TV/Guide), TypeScript, changed-file ESLint, Stylelint,
  production build, and ES5 validation all passed. Final dist contains the
  12.0.Finweb label and header-padding fix. The local production startup screen
  rendered without uncaught errors. No commit, push, or release was performed.

## Client Identity and Navigation Fixes

- Browser API clients now report client name Finweb and version 12.0.0. Native
  host name/version overrides are preserved, as is the browser device name.
  Dashboard web information and startup logging display Finweb 12.0.0.
- Home and the wordmark no longer leave Home selected. Library and settings
  selection and keyboard focus indicators remain available.
- Scoped sidebar selection now pairs a subtle background with inherited text
  instead of combining the official solid blue background with blue text.
  The drawer background falls back to the active MUI theme without custom CSS.
- Dashboard now owns its icon/server-name/server-version header instead of
  sharing the modern drawer wordmark. The icon is bounded and long names wrap.
- Modern header content receives MUI scrollbar compensation in an inner wrapper.
  This keeps the legacy global AppBar padding override from cancelling the
  compensation, without disabling modal scroll locking or changing the player.
- Regression fixtures now use the actual dark/light MUI and legacy theme CSS,
  include the custom CSS variables, and render the real dashboard drawer.
  Selected text passes 4.5:1 contrast checks with and without the supplied CSS.
- Actual MUI menus are exercised on mobile/desktop with and without custom CSS
  and emulated classic Windows scrollbars. Header coordinates stay stable.
  A negative control disables compensation and reproduces the original shift.
- Verification: 223 unit tests, preference preservation, browser layout checks,
  client identity/native override checks, TypeScript, changed-file ESLint,
  Stylelint, production build, and all 989 ES5 checks passed.
- Output remains the existing dist directory, served by the existing preview at
  http://127.0.0.1:8097/. No new build folder or branch was created. No screenshots,
  authenticated browser inspection, commit, push, or release were performed.
- Existing bundle-size and unborn-repository git revision warnings remain;
  neither prevents the production build. Original jellyfin-web is unchanged.
- Built preview smoke checks passed at 1280px and 390px in an independent,
  unauthenticated Chromium session: server selection rendered, no horizontal
  overflow or uncaught errors, and startup reported Finweb 12.0.0.

## Navigation and Loading Follow-up

- Keep this test build at Finweb 12.0.0. Package/lockfile versions are now also
  12.0.0; jellyfinWebVersion records the 12.0 base independently. Dashboard server
  information displays the Finweb version and the official Web base separately.
- Restore solid primary-blue selection without custom CSS, paired with the
  theme's contrasting foreground. Preserve supplied custom CSS selection colors
  and leave Home unselected. Restore 200ms hover transitions with reduced-motion
  support.
- User, library view, sort, filter, and display popups preserve the page scrollbar
  using disableScrollLock. Full dialogs and mobile drawers retain scroll locking.
- Modern navigation headers stay transparent after scrolling. Dashboard header
  behavior is unchanged.
- Add bottom library paging with the existing Pagination component and shared
  settings state. Counts, boundaries, no-pagination mode and loading disabling
  follow the same data as the top controls.
- Home waits for its tab's data-loading promise. Library pages retain previous
  results only within the same user/library/view scope while a query changes;
  stale item interactions and play commands are disabled during that interval.
- A shared content boundary preserves page space, displays local loading state,
  and gives visible images up to 600ms to load before revealing content. Slow
  images never block indefinitely; obsolete waits cannot reveal a newer request.
  Query failures show an error message rather than an empty-library message.
- Observe the player's existing poster-on-top state to hide modern navigation
  before /video navigation. Reused players enter this state too. Stop/failure
  clears it; a stale failed play request cannot clear a newer presentation.
- Expanded browser checks include actual site.scss (including containment),
  the actual AlphabetPicker, SortButton and bottom Pagination components,
  supplied custom CSS, classic-scrollbar emulation, scroll transparency, delayed
  images, and poster presentation/removal. Previous fixture coverage had omitted
  the real alphabet list and site-level containment override.
- Passed: 223 unit tests, preference and identity checks, navigation lifecycle
  checks, expanded browser layout checks, and ASS browser regressions (WASM and
  legacy workers, slow fonts, startup hold/release, SRT/ASS switching, recovery,
  and animated ASS at 2x). These are isolated fixtures, not a live server session.
- No screenshots, logged-in browser access, new branch, separate build folder,
  GitHub push, or release. Original jellyfin-web remains unchanged.
- Final verification: TypeScript, changed-file ESLint and Stylelint passed;
  production build completed with the existing bundle-size warnings, and all
  989 ES5 checks passed. Existing 8097 preview serves the rebuilt dist. Independent
  1280px/390px startup checks reached server selection without uncaught errors
  or horizontal overflow and logged Finweb 12.0.0. Authenticated live-server
  navigation and subjective transition smoothness still require user testing.

## Favorites, Header Surfaces and Progressive Posters

- Restore Favorites immediately below Home, targeting the existing home tab 1.
  Favorites receives selection state on that tab; Home remains unselected.
  The modern Jellyfin wordmark is a non-interactive image container. Dashboard
  branding remains separate and unchanged.
- Keep the empty modern header transparent. Give only the right-hand controls
  a translucent, mildly blurred background and the library toolbar a solid
  background. Both use paired MUI theme foreground/background colors so a dark
  custom CSS background variable cannot make light-theme text unreadable.
- Supersede the earlier 600ms image gate: the content boundary now waits only
  for data. Same-library placeholder results remain visible and inert while
  replacement data loads. Existing query scope and stale-request guards remain.
- React cards/lists show available valid BlurHash placeholders immediately,
  respecting the existing saved BlurHash preference (enabled by default).
  Missing/invalid hashes and failed posters retain a same-size fallback surface.
  Posters crossfade individually over 180ms; reduced-motion disables the fade.
  Source replacement remounts image state, allowing recovery after load errors.
  Transparent/contained images do not leave a visible BlurHash underneath after
  the transition. No server setting or plugin is required for the fallback.
- Dashboard server information now shows only Finweb 12.0.0 for the web version;
  the separate Jellyfin Web base row is removed. Base metadata stays internal.
  Package and Finweb versions remain 12.0.0.
- Expanded isolated browser fixtures cover restored Favorites, non-clickable
  branding, header surfaces, delayed posters, valid/missing/invalid hashes,
  failed-image recovery, changed image sources, retained-data action blocking,
  reduced motion and the real server-info widget. Existing mobile/desktop,
  supplied CSS, popup scrollbar and playback-presentation checks remain.
- No screenshots, authenticated browser inspection, new branch, separate build
  folder, commit, push or release. Original jellyfin-web is unchanged.
- Verification passed: 223 unit tests, expanded browser fixtures with supplied
  custom CSS, navigation lifecycle, preference preservation, client identity,
  TypeScript, changed-file ESLint, Stylelint and all 989 ES5 bundle checks.
  Production build completed in 99 seconds with the existing two bundle-size
  warnings and the expected missing-HEAD warning in this unborn repository.
- The existing dist was rebuilt and the existing http://127.0.0.1:8097/ preview
  was verified against the new index.html. Independent 1280px/390px browser
  profiles reached server selection without uncaught errors or horizontal
  overflow and reported Finweb 12.0.0. Live authenticated navigation and the
  perceived smoothness of transitions still need the user's server-side test.

## First-Frame Layout and Navigation Cleanup

- Modern pages keep the fixed header to preserve the existing absolutely
  positioned page/player structure. Enable synchronous header spacing only for
  this layout: measure route changes in a layout effect and apply native resize
  notifications before paint, without the extra requestAnimationFrame delay.
  Measurements consistently include padding/borders, and queued legacy frames
  are cancelled on cleanup. Dashboard/player retain the default mode.
- Distinguish user initialization from signed-out state and reserve desktop
  sidebar space while the user loads. Sidebar routes never render the former
  horizontal library navigation as a fallback. Ignore stale initial-user
  responses after sign-in, sign-out or provider teardown.
- Split header backgrounds into three content groups: top-right controls,
  library summary/count, and library actions. The library row itself remains
  transparent. Reserve count width so loading-to-count changes do not wrap the
  toolbar after the first cards appear. Action groups support wrapping.
- Remove the added eager BlurHash rendering. Restore the existing setting and
  image-load-start condition, and release the canvas once the poster loads.
  Keep source/error recovery, stable card geometry and the short image-only
  fade. No page-level image wait is reintroduced.
- Home content is progressive: completed sections stay visible and usable while
  other sections load. Retained stale library query data remains non-interactive.
- Multi-select now starts mouse holds only for the primary button. Cancel timers
  and pending imports on release/cancellation, view changes, browser history,
  loss of focus and destruction. Scope selection to its own items container;
  reject hidden, inert or removed cards and clear selection when cards are
  replaced. Unrelated list destruction does not clear another list's selection.
  Deferred legacy items-container initialization checks that it is still enabled
  and connected before attaching listeners.
- Browser fixtures now render the actual LibraryToolbar, LibraryViewMenu, Sort
  and Pagination structure with isolated service/action fixtures. Track the
  first-row/header coordinates frame by frame at 390/900/1280/1920px, with and
  without supplied custom CSS, including delayed count updates and user loading.
  Separate selection tests execute the actual module with delayed-import and
  timer fixtures. No screenshots or authenticated browser access are used.
- Finweb stays at 12.0.0. No branch, separate build directory, commit, push or
  release is created; the original jellyfin-web checkout is unchanged.
- Verification passed: 223 unit tests, frame-by-frame browser layout checks,
  new multi-select regressions, navigation/user-initialization races, preferences,
  client identity, TypeScript, changed-file ESLint and Stylelint. The original
  no-image reproduction now starts with both header bottom and card top at 96px
  instead of the previous 96px/48px mismatch.
- Production build finished in 81 seconds with the existing two bundle-size
  warnings and missing-HEAD warning. All 989 ES5 checks passed. The existing
  8097 preview serves the rebuilt dist; independent 1280px/390px startup checks
  passed without uncaught errors or overflow and reported Finweb 12.0.0.
  Authenticated server behavior remains for the user's own verification.

## Cache-Safe Poster Fade

- Replace the poster's transition-only reveal with a 260ms opacity animation
  attached when that individual image finishes loading. Explicit keyframes run
  even when a cached image loads before its transparent state has been painted.
  No transform, stagger, extra BlurHash or all-image loading gate is introduced.
  Reduced-motion disables the animation. Source changes and errors retain the
  existing state isolation, and ordinary rerenders do not restart the animation.
- The browser regression remounts the same cacheable image, verifies there is
  only one HTTP image request, and checks both instances' animation keyframes,
  duration and intermediate opacity without changing the card coordinates.
- Provide a separate custom-CSS snippet for the three header groups. It uses
  the supplied theme's transparent background and blur variables, the old 50px
  corner radius and readable light text, without importing old height/margin
  rules. Test the snippet in the isolated fixture only; do not apply it to the
  user's server or bundle it into the app.
- Leave nested-folder legacy routing unchanged, pending a future official Web
  implementation to review and port. Version remains Finweb 12.0.0.
- Verification: expanded browser layout/image/cache/CSS-snippet fixtures,
  TypeScript, targeted ESLint and Stylelint passed. Production build completed
  in 84 seconds with the existing bundle-size and missing-HEAD warnings; all
  989 ES5 checks passed. Existing dist and the 8097 preview were refreshed and
  independently checked at 1280px/390px without errors or overflow. No screenshots,
  authenticated browser inspection, new branch, separate build folder or GitHub
  commit/push/release was performed.

## Continuous Poster Reveal And Header Spacing

- Supersede the cache-hit animation policy above: keep the backing/BlurHash
  opaque throughout the first poster reveal, then release it after completion.
  A bounded document-local URL set avoids replaying the fade on successful
  image remounts, including remounts during a reveal. Source changes and image
  failures remain isolated. No persistent storage or image data is retained.
- Preserve reduced-motion behavior and clean up when custom CSS disables the
  animation. Individual images still load independently without a batch gate.
- Add 12px desktop / 8px small-screen top padding inside the modern header.
  Empty video headers receive no padding; the sidebar remains at the top.
- Extend browser checks to sample backing opacity and BlurHash presence during
  every reveal frame, plus cached/interrupting remounts and custom CSS disabling.
  Verify header spacing and first-row alignment at desktop/mobile widths.
- Leave pagination persistence, MUI theme snippets, version 12.0.0 and nested
  folder routing unchanged. No branch or GitHub publication is requested.
- Verification passed: expanded independent browser fixtures, 223 unit tests,
  TypeScript, targeted ESLint/Stylelint and 989 ES5 checks. Production dist was
  rebuilt in 93 seconds with the existing bundle-size and missing-HEAD warnings.
  Remove the temporary custom header-padding snippet after deployment; the
  source now excludes empty video headers. Keep the separate MUI theme CSS.

## Finweb Playback Session And JASSUB

- Replace the production text-subtitle entry point with FinwebPlaybackSession.
  Keep Jellyfin playback reporting, OSD/hold controls, Up Next and segment
  integration, browser video decoding, hls.js and legacy bitmap/local adapters.
- Prepare the initial subtitles with the source rather than after OSD routing;
  guard stale source/transport/navigation completions and use stream Index values
  rather than treating them as array offsets.
- Use JASSUB 2.5.16's public canvas/manual APIs and one session subtitle clock.
  Remove production dependence on Octopus Worker interception and stop shipping
  its old Worker assets. Retain old source/tests only as a comparison reference.
- Use browser WebVTT tracks for server-converted text with per-renderer URL,
  cue and cleanup ownership. Keep primary/secondary choices and timeline offsets
  separate. Restore saved delivery metadata after leaving burn-in playback.
- Preserve Subtitle Font Bridge and Attachment Optimizer's HTTP contracts.
  Preload resolved/default fonts, fall back to standard attachments, disable
  remote font discovery and bound resource/render waits. Report load failures.
- Gate advertised client ASS support on modern browser capabilities. Keep the
  ES5 check for other bundles and add a dedicated ES2020 JASSUB syntax check.
- Added a synthetic HTTP/media integration fixture exercising the actual
  HtmlVideoPlayer entry, real MP4/HLS and emitted JASSUB Worker/WASM. Surrounding
  application services are stubbed; this is not an authenticated-server test.
  Covered slow 2x startup, paused switching, cancellation/off, HTTP failure and
  recovery, missing Bridge, source offsets, dual tracks, delayed OSD, mobile
  resize/fullscreen and zero remaining Workers after stop, without screenshots.
- Full unit suite: 232 tests. Existing identity/preferences/navigation/selection
  and frame-by-frame UI fixtures passed. TypeScript and targeted lint checked.
- See PLAYBACK.md for architecture, commands, dependency audit findings and
  explicit limits (real server/media, Safari/PiP/Cast and Worker startup failure).
- Version stays 12.0.0. Build only into existing dist; preview uses a visible
  CMD running scripts/Start-Preview.cmd on 127.0.0.1:8097. No branch, GitHub
  commit/push/release, screenshot or authenticated browser inspection requested.
- Final production build completed in 49 seconds (existing missing-HEAD and
  bundle-size warnings only); 995 ES5 bundles and the ES2020 JASSUB bundle passed
  syntax checks. Built preview startup passed at 1280px and 390px without
  horizontal overflow or page errors in fresh unauthenticated contexts.
- Preview started in a normal visible CMD (PID 52320), with Python child PID
  65728 serving only 127.0.0.1:8097; HTTP 200 confirmed. These PIDs describe this
  run only and must be rechecked before any future shutdown.
