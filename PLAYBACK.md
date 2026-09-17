# Finweb Playback

Current version: Finweb **12.1.0**, based on Jellyfin Web **12.1**.

## Maintained Player

The Jellyfin playback manager negotiates sources and owns playback reports,
quality/audio changes, playlists and resume state. HtmlVideoPlayer uses browser
video and hls.js. Jellyfin's OSD, media-segment prompts, Up Next and hold-to-2x
controls remain. This is not a replacement Video.js, Shaka or ArtPlayer runtime.

## Subtitles

`FinwebPlaybackSession` owns subtitle selection, cancellation and resource reuse.
`TextSubtitlePipeline` uses the video clock. ASS/SSA renders through libass-wasm
with prepared text/fonts; SRT/SubRip converted to WebVTT uses native text tracks.
Bitmap, burned-in and other unmanaged paths retain the host fallback behavior.

The selected subtitle is prioritized. Alternative downloadable text tracks are
prepared in the background, one at a time. Completed resources are reused during
that video; this is not a permanent browser download library. A resource that
could not be prepared may still require a request when selected. Exiting playback
disposes the session, workers and pending requests.

Subtitle Font Bridge, authenticated font requests, media attachments and optional
server fallback-font discovery remain supported. Server plugins keep their own
responsibilities; Finweb consumes their supported Jellyfin/bridge responses.
This does not guarantee compatibility with every plugin version.

Existing preparation timeouts remain, including 5-second optional font API
lookups. Slow server, extraction or proxy responses can still delay first use.
Background preparation does not remove those network dependencies.

ASS can prepare before playback, but visibility waits for a presented video
frame. After that, pause, buffering, subtitle changes and speed changes do not
reset the first-frame gate; a new video source does.

## Seek Previews

The OSD uses Trickplay when valid metadata is available, otherwise the available
chapter preview. Without either image source it retains text-only time/chapter
information. Live-TV time-of-day and unknown-duration fallbacks remain.

- Images retain their aspect ratio at 85% of the official display size. Sprite
  sheet dimensions and frame offsets are scaled together; labels stay full size.
- The image area and text area share an opaque dark background. There is no
  separate cover rectangle over a visible, still-loading image.
- While an image loads, the image area is reserved and a spinner is shown.
  Reduced-motion preferences disable its rotation.
- On `load`, the image appears and the spinner is removed. On `error`, image
  space is removed and time/chapter labels remain. An empty chapter name has no row.
- No test delay, fake chapter name or arbitrary request timeout is used.
- Late responses cannot replace the currently selected sheet/chapter. Requests
  are reused within a sheet and a bounded, per-OSD cache; leaving the view clears it.

The image is an interval-sampled frame; the displayed time is the actual hovered
seek position. A failed image is remembered in the current cache to avoid retrying
on every mouse movement. Another URL loads independently; view exit clears that cache.

## Home After Playback

Home and its loaded cards stay mounted but hidden while visiting detail/video
routes. Returning reveals that same Home immediately, keeping existing rows while
updated playback data is pending. Once the stop report succeeds, `ResumeItems`
and `NextUp` are invalidated and the matching rows refresh.

This does not locally invent a new order or mark an episode watched. The server's
response determines the resulting order, progress and next episode. A failed stop
report cannot guarantee an updated server history.

Home/library navigation otherwise retains normal 12.1 query caching and library
page-position persistence. Retained Home is discarded on other routes, logout or
user/server changes. A cold Home still needs to load; refreshed data can replace
card markup. No Home-refresh test selector remains.

## Diagnostics

Recording and completion notifications are off by default. For the local preview,
open the following address **before reproducing the problem**:

```text
http://127.0.0.1:8097/?subtitleDiagnostics=1#/selectserver
```

Use the corresponding address of your deployment, with the query before `#`.
After reproduction, export from the browser console:

```js
window.finwebSubtitleDiagnostics.download();
```

An export with `enabled: false` and empty `entries` contains no recorded session;
exporting does not retroactively record an earlier problem. Timing data stays in
memory until exported, and nothing is uploaded automatically. The recorder permits
selected timing/status fields, not raw URLs, API keys or subtitle text. Still
review files before sharing; never publish unreviewed proxy logs or network captures.

`subtitlePrefetchNotice=1` independently enables the background-completion toast.
Background preparation remains active without either diagnostic flag. Removed
download-comparison and ASS-engine-selection flags have no effect.

For delays, distinguish request time from rendering time. Compare browser network
timings and, when appropriate, direct-server versus proxy access. A slow subtitle
request alone does not prove that the renderer or the whole player is faulty.

## Verification

[CONTRIBUTING.md](CONTRIBUTING.md) lists unit tests, browser fixtures, prerequisites
and build checks. Fixtures cover controlled success, failure and timing cases;
they do not certify every real server, proxy, decoder or browser compositor.
Authenticated real-server testing remains a separate check.
