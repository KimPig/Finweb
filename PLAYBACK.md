# Finweb Playback

Version remains Finweb 12.0.0. The original Jellyfin playback manager and OSD
remain the server/API and UI adapters. Video decoding remains browser-native;
HLS remains hls.js. No server plugin replacement or server configuration
migration is required.

## New Runtime

- `FinwebPlaybackSession` owns a source's desired subtitle selections, server
  delivery checks, cancellable resource requests and subtitle presentation.
- Initial subtitle preparation starts with the source, not after OSD navigation.
  Late navigation cannot restore an initial track over a subsequent selection.
- ASS/SSA uses pinned JASSUB 2.5.16 and its public canvas/manual rendering API.
  `SubtitleClock` is the single frame clock; no Worker messages are intercepted.
- SRT and other server-converted text use WebVTT, Blob-backed track elements and
  browser cue scheduling. Each renderer owns its own track element and URL.
- Transcoding offsets and user offsets are applied once. Track changes commit
  after readiness; failure keeps the prior working track where possible.
- Delayed source creation, transport setup and OSD completion have generation
  checks. A new session is created for every source playback request.
- Existing primary/secondary tracks, seek, rate/hold controls, Up Next, segment
  skipping and playback reporting remain connected through existing adapters.
- PGS/VobSub and local-platform paths retain the previous implementations.
- Failures restore the selected track and show a localized notification.
  `finwebsubtitle` events on the video element expose bounded stage diagnostics
  without subtitle contents, resource URLs or authentication tokens.

## Server Plugins

Subtitle Font Bridge lookup and authenticated font URLs are preserved. Resolved
font bytes are supplied before ASS activation; attachments remain the fallback
for missing Bridge support or failed resolved font downloads. Optional Jellyfin
fallback fonts are also loaded. The built-in default font is preloaded locally;
JASSUB local-font queries and remote font discovery are disabled.

Attachment Optimizer continues serving the standard attachment API and its
existing cache. No internal cache paths are accessed by the web client. Its
subtitle/attachment pre-extraction features make a separate Subtitle Extract
installation unnecessary for the same tasks.

## Per-Video Resource Reuse

Completed subtitle text and font bytes now belong to `FinwebPlaybackSession`,
independently of renderer instances. ASS/SRT switching and subtitle-off retain
these resources; source replacement or playback disposal releases them. There
is no disk cache, cross-user cache or server/plugin change.

- Text uses a 16 MiB / 16-entry LRU; fonts use a separate 64 MiB / 64-entry LRU.
  Text accounting is UTF-16 length times two. These bounds cover retained data,
  not in-flight response bodies, parsed cues, renderer copies or WASM memory.
  Oversized resources still load for the selected track but are not retained;
  evicted resources must be downloaded again.
- Only successful complete bodies are retained. Invalid WebVTT headers, empty
  fonts, HTTP failures, body errors and abandoned requests are not cached.
  Consumers share in-flight downloads. Cancelling one consumer leaves the
  request alive for other consumers; cancelling the last aborts the request.
- Successfully downloaded, nonempty font URL plans are retained for up to 16
  tracks, including attachment fonts when optional Bridge/configuration/list
  discovery is unavailable. A failed optional lookup must not block reuse of
  fonts already loaded for this playback. Incomplete font downloads do not
  freeze a partial plan; they can be retried on another selection.
  Font metadata is a snapshot for this playback, not a live configuration feed.
- Each ASS renderer receives its own font byte copies, including the bundled
  default font, so renderer/Worker ownership cannot corrupt reusable data.
- After a managed track becomes active, wait 1.5 seconds before preparing at
  most one same-language, same-forced-status external track of the other format
  family (ASS/SSA versus text). Missing language tags are not guessed. Prefetch
  does not create a renderer or delay first playback. Its subtitle then fonts
  are requested sequentially, with a 30-second deadline. Foreground font loads
  use at most two concurrent requests per selection.
- Selecting the prefetched track joins its downloads. Selecting another track,
  turning subtitles off or disposing playback cancels background work. A failed
  prefetch is silent, never replaces the active subtitle, and does not prevent
  an explicit selection from retrying. There is no automatic prefetch loop.

The transactional renderer switch and existing timeouts remain in place. An
unavailable, never-downloaded track can still fail or wait on the server. The
change removes unnecessary repeated network dependencies, not network faults.

## Compatibility And Limits

- JASSUB requires modern WASM/OffscreenCanvas browsers. Unsupported browsers no
  longer advertise client ASS rendering; server-side conversion/burn-in remains
  subject to server capabilities and user permissions.
- Old Octopus integration code and tests remain as a comparison reference, but
  the production player no longer imports them or ships their Worker assets.
- Most bundles keep the existing ES5 syntax check. The JASSUB bundle needs
  ES2020 BigInt syntax and has a separate syntax check; this is not a promise of
  old-browser ASS compatibility.
- Chrome desktop/mobile-sized layouts and container fullscreen are automated.
  Safari/iOS native fullscreen, PiP, Cast, actual authenticated-server media,
  server-specific font collections and every legacy platform are NOT certified
  by these tests. A separate ASS canvas is not automatically part of video PiP.
- Startup/render timeouts are bounded at the adapter, but JASSUB's public
  `destroy()` awaits its own initialization; a blocked/crashed Worker during
  initialization may require further upstream lifecycle work. No private Worker
  protocol workaround is introduced.

## Verification

### Opt-in subtitle latency capture

Open `http://127.0.0.1:8097/?subtitleDiagnostics=1` and reproduce the switch.
Alternatively run `finwebSubtitleDiagnostics.start()` in the browser console
before playback. After reproduction, run `finwebSubtitleDiagnostics.download()`
to download `finweb-subtitle-diagnostics.json`, or inspect
`finwebSubtitleDiagnostics.snapshot()`. `stop()` disables capture. Reloading
without the query parameter disables it and discards the previous in-memory log.
Capture is memory-only, capped at 2,000 entries, and never uploaded automatically.
No URLs, server/item IDs, titles, tokens, font names, cue text or raw errors are
included. Only stage names, anonymous trace/source numbers, track indices,
allowlisted playback properties, HTTP status, counts and timing are recorded.

`atMs` is monotonic browser wall time, `elapsedMs` is relative to a trace's start,
and `durationMs` measures a completed stage. Nested/parallel durations must not
be added together. Source numbers distinguish a video restart from a track
switch; track slots distinguish primary and secondary subtitles. Look for:

- `manager-selection` / `video-stream-change`: a switch requested a new video.
- `delivery-check`: optional server session lookup before renderer selection.
- `subtitle-response` / `subtitle-body`: time to HTTP headers and body completion.
  The former includes network/server time, not a server-only measurement.
- `font-bridge`, `font-config`, `font-list`, `font-download`: ASS font waits.
- `cache-hit`, `cache-miss`, `cache-join`: completed-data reuse or shared download;
  `resourceKind` distinguishes subtitle text and font data without exposing keys.
- `font-plan-hit`: reuse of this video's resolved font URLs, without API lookup.
- `prefetch-start`, `prefetch-ready`, `prefetch-unavailable`: background work for
  one alternate track, using its own trace and no user-visible failure message.
- `ass-module`, `ass-worker-ready`, `ass-track-validation`: engine startup.
- `webvtt-parse`, `renderer-activate`, `active`: parsing and commit.
- `webvtt-first-active-cue`: distinguishes a silent gap from track activation.
- `ass-first-render-ack`: renderer completion, NOT proof of visible glyphs.
- `media-waiting`, `media-playing`, `source-created`: buffering/restart timing.

The Python static preview server sees only local asset requests. Jellyfin API
and subtitle requests go directly from the browser to the configured server;
the CMD HTTP access log cannot diagnose these stages by itself.

Schema 2 adds per-request streaming observations for subtitle files and remote
fonts. Each request has a separate `trace`, linked to its selection by
`parentTrace`. `resource-headers`, `resource-first-byte`, throttled
`resource-progress`, 2-second `resource-wait` samples and `resource-end` identify
late body start, stalled transfer, and delayed EOF. `bytes` counts bytes exposed
by Fetch after HTTP decompression, not raw wire bytes. `contentLength` is logged
only when readable and numeric, and may describe compressed bytes; do not
assume it must equal `bytes`. Missing encoding headers are `unknown`, not proof
of uncompressed delivery. No arbitrary headers or raw error messages are saved.

`outcome` distinguishes HTTP failure, fetch failure (which can include network
or CORS errors), body failure, selection cancellation and the unchanged 30-second
preparation timeout. A timeout identifies the client's cancellation, not the
upstream cause. `idleMs` is time since the last chunk (or headers/request start
before data arrives). `timerLagMs` and tab `visibility` provide clues about main
thread stalls/background throttling; neither proves a server-side cause.
`timeOriginMs + atMs` gives a client wall-clock timestamp to compare with server
logs, subject to clock skew. The JSON includes an export timestamp as well.

Observation wraps the consumed response stream only in diagnostic mode. Normal
fetch, request URLs/headers, text decoding, font bytes, timeouts, rendering and
the resource-reuse policy above are identical with capture enabled or disabled.
Diagnostics introduce no second stream copy, server upload or additional remote
request. Unsupported stream APIs fall back
to the original response with an `unobserved` outcome.
Individual observation stops after 60 seconds (`observation-limit`) without
cancelling the request, so a stalled request cannot keep a diagnostic timer
alive indefinitely. Capture still has the global 2,000-entry bound.

`npm test` includes session selection/cancellation/failure tests and the prior
regression suite. `npm run build:check`, targeted ESLint, `npm run build:production`
and `npm run escheck` cover the source and shipped assets.

`scripts/test-finweb-playback.mjs` uses a disposable synthetic HTTP server, real
MP4/HLS media, real JASSUB/WASM, Bridge/attachment API fixtures and the actual
HtmlVideoPlayer entry point with surrounding application services stubbed.
Set `PLAYWRIGHT_MODULE` to an external Playwright installation's `index.mjs`.
Set `FINWEB_PRODUCTION_ENGINE=1` to use the emitted dist engine/Worker/WASM.
It checks slow startup at 2x, paused switching, seeks, deliberate silent gaps,
latest-selection cancellation, HTTP recovery, source offsets, missing Bridge,
dual tracks, delayed OSD, mobile resizing/fullscreen and Worker cleanup.
It also verifies warmed ASS/SRT/font switches with zero new resource requests
under failing/stalling endpoints, cache reset between sources, and same-language
background prefetch. Unit tests cover cache limits, shared-request cancellation,
discarded partial bodies, retry, font copy isolation and silent prefetch failure.
No screenshots or existing authenticated browser sessions are used.

`scripts/Start-Preview.cmd` serves the existing dist at
http://127.0.0.1:8097/ using Python's standard HTTP server. Launch it in a visible
CMD window, not as a hidden background process. Ctrl+C stops the server.

The npm install reported 66 audit findings (2 low, 33 moderate, 29 high,
2 critical) across the dependency tree. No broad automatic dependency upgrade
was performed as part of the playback rewrite. Review separately before release.
