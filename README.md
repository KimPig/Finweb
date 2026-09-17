# Finweb

A customized Jellyfin web client with a redesigned interface and playback
improvements, built for browsing your library and watching with subtitles.

Finweb brings a fixed desktop sidebar, a built-in square-edged theme and practical
playback controls to your existing Jellyfin server. Your libraries, accounts and
watch history stay on Jellyfin; Finweb changes the web experience.

It is an independent project, not an official Jellyfin release or a media server.

## A Redesigned Interface

**Your library stays within reach.** A permanent desktop sidebar keeps Home,
Favorites, libraries and account actions together, while separate header groups
organize account tools, library counts and sorting controls. Bottom pagination
lets you move to the next page without scrolling back to the top.

**A complete theme, without extra imports.** Square-edged controls, dark surfaces
and blue accents are built in. Detail pages group metadata with the overview,
and compact episode rows keep a series easy to scan. Management pages retain
Jellyfin's familiar dashboard styling.

## Playback Improvements

- **Return to Home without starting over.** The pre-playback Home stays available.
  Continue Watching and Next Up refresh after a successful stop report, keeping
  the existing rows visible while new data arrives.
- **Subtitles prepared in the background.** The selected subtitle takes priority;
  other downloadable text tracks are prepared and reused during the video.
  ASS/SSA uses libass-wasm, while SRT/WebVTT uses native text tracks.
- **Compact seek previews.** Images display at 85% of the original size, with time
  and chapter names underneath. An opaque background and loading indicator keep
  the preview readable; a failed image falls back to text.
- **Convenient playback controls.** Hold for 2x speed, use intro/outro prompts
  coordinated with Up Next, and keep Jellyfin's resume, quality and audio controls.

## Make It Your Own

Keep using server branding and custom CSS, or add JavaScript directly in Branding
settings. Multiple external script URLs and inline code can work together, with
a safe mode for recovery. Settings are stored per server, so you do not have to
enter them again on each device using Finweb.

Mobile visitors get links to both Findroid and Swiftfin, including visitors in
supported Jellyfin mobile wrappers. They can close the notice for the current
visit or choose not to show it again on that browser/app.

See [Customizations](CHANGE_PLAN.md) for the maintained behavior and
[Playback](PLAYBACK.md) for the subtitle and preview implementation.

## Version Numbers

Finweb versions use **official Web version + Finweb revision**:

```text
12.1.0
---- -
 |   +-- Finweb revision: 0, 1, 2, ...
 +------ Official Jellyfin Web version: 12.1
```

For example, `12.1.0` and `12.1.1` use the same official Web version, with the
last number identifying Finweb-specific revisions. When a new official Web
version is adopted, the prefix changes and the Finweb revision starts at `.0`.
These are client version numbers, not the Jellyfin Server version.

Current development version: **Finweb 12.1.0**.

## Build and Try

Use Node.js from [.nvmrc](.nvmrc) (currently Node 24), npm and a terminal in the
repository directory:

```sh
npm ci
npm run build:production
```

The output is `dist/`. Serve it over HTTP rather than opening `index.html` as a
local file. With Python 3 installed:

```sh
python -m http.server 8097 --bind 127.0.0.1 --directory dist
```

Open [the local preview](http://127.0.0.1:8097/), choose a Jellyfin server and sign
in. On Windows, [Start-Preview.cmd](scripts/Start-Preview.cmd) runs the same server
in a visible console. It serves the existing build; it does not build or hot-reload
source changes. Stop it with Ctrl+C and use an unused port if necessary.

To test from another device on a trusted LAN, use `--bind 0.0.0.0` instead and
connect to this computer's LAN address. Firewall access may be required. This
development file server is not a production deployment service.

## Deployment and Settings

Deploy the **contents of `dist/`** as the web frontend, either through your
Jellyfin installation's configured web directory or a separate web host. The
correct directory or container mount depends on your deployment; do not replace
the server's database, configuration or media directories. Keep a backup of the
previous frontend and reload the browser after replacement.

Finweb changes the web frontend, not Jellyfin Server or separately installed
native clients. The Web baseline number is not a promise of compatibility with
every server, native wrapper, TV browser or transcoding setup.

See [Configuration](CONFIGURATION.md) for branding, CSS, custom JavaScript,
safe mode, server selection and mobile notices. Personal backgrounds and server
addresses are not required in the source; configure them on your server.

## Development and Releases

[Contributing](CONTRIBUTING.md) covers development checks and browser fixtures.
Regular push/PR workflows build, check and upload a `finweb-dist` Actions artifact.
Pushing a matching version tag, such as `v12.1.0`, triggers the separate release
workflow: validate versions, check types/tests, build, then publish ZIP and tar.gz
frontend packages with SHA-256 checksums. It runs only in `KimPig/Finweb`.

An ordinary source push does not publish a release, and a release does not install
itself on a Jellyfin server. See [the release procedure](CONTRIBUTING.md#distribution-checklist)
before creating a version tag.

Build output, dependencies, local backups, private handoff documents and exported
subtitle diagnostics are excluded from Git. Only maintained source, tests,
configuration and public documentation belong in commits.

## Project and Credits

- [KimPig/Finweb](https://github.com/KimPig/Finweb): Finweb source and issue reports.
- [Upstream provenance](UPSTREAM.md): official baseline commits and update procedure.
- [Jellyfin Web](https://github.com/jellyfin/jellyfin-web): the original project.
- [Contributors](CONTRIBUTORS.md): inherited contributor credits.

The integrated theme includes adaptations of Scyfin 1.4.8 and subsequent Finweb
styling. Upstream notices and third-party licenses must be retained.
The repository declares GPL-2.0-or-later; see [LICENSE](LICENSE).
