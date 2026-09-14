# Finweb

Finweb is a customized Jellyfin Web client based on official Jellyfin Web 12.0.
The current development version is **Finweb 12.0.0**.

This first source snapshot preserves the desktop sidebar, theme and preference
changes, playback controls, JASSUB integration, subtitle resource caching and
diagnostics before comparing replacement player frameworks.

## Development status

This is a test build, not a stable subtitle release. Intermittent subtitle
non-display that recovers after seeking remains unresolved. Initial resource
downloads and optional font discovery can still be slow. Successful automated
tests do not establish compatibility with every server or browser.

See [PLAYBACK.md](PLAYBACK.md) for the current playback implementation, tests,
diagnostic capture and visible local preview instructions. The local `dist`
build, dependencies and user diagnostic downloads are not committed.

The inherited upstream patch-release workflow is disabled for this repository.
Pushing this snapshot does not publish a Finweb release. [BRIDGE.md](BRIDGE.md)
and the `patches` directory describe the older enhancement fork, not the full
current Finweb source or its release process.

---

## Original Enhancement Fork Notes

This repository is a small compatibility fork of the official
[Jellyfin Web](https://github.com/jellyfin/jellyfin-web) project. It keeps the
upstream Web client as its base while adding a focused playback patch for a
Windows Jellyfin server.

## Added features

- **Subtitle Font Bridge compatibility:** resolves the ASS/SSA font families
  used by the selected subtitle through the Subtitle Font Bridge server plugin,
  then preloads only the matching server-installed fonts. Embedded MKV fonts remain a
  fallback when the plugin is unavailable or cannot resolve every family.
- **Reliable text-subtitle switching:** manages ASS/SSA and SRT renderer
  lifecycles explicitly, cancels obsolete requests, synchronizes seek and
  buffering transitions, and restores the previous selection if a replacement
  fails. Jellyfin's original fallback remains available for unsupported paths.
- **Hold for 2× playback:** temporarily plays at 2× while Space, the primary
  mouse button, or a touch press is held; playback speed and normal controls
  are restored on release.
- **Outro skip with Up Next:** keeps the outro skip button visible when Next
  Video information is enabled and animates it above the displayed Up Next
  card instead of hiding it.

The original enhancement fork used automated upstream patch releases. That
process is retained for reference only and is not enabled for Finweb.

---

<h1 align="center">Jellyfin Web</h1>
<h3 align="center">Part of the <a href="https://jellyfin.org">Jellyfin Project</a></h3>

---

<p align="center">
<img alt="Logo Banner" src="https://raw.githubusercontent.com/jellyfin/jellyfin-ux/master/branding/SVG/banner-logo-solid.svg?sanitize=true"/>
<br/>
<br/>
<a href="https://github.com/jellyfin/jellyfin-web">
<img alt="GPL 2.0 License" src="https://img.shields.io/github/license/jellyfin/jellyfin-web.svg"/>
</a>
<a href="https://github.com/jellyfin/jellyfin-web/releases">
<img alt="Current Release" src="https://img.shields.io/github/release/jellyfin/jellyfin-web.svg"/>
</a>
<a href="https://translate.jellyfin.org/projects/jellyfin/jellyfin-web/?utm_source=widget">
<img src="https://translate.jellyfin.org/widgets/jellyfin/-/jellyfin-web/svg-badge.svg" alt="Translation Status"/>
</a>
<br/>
<a href="https://opencollective.com/jellyfin">
<img alt="Donate" src="https://img.shields.io/opencollective/all/jellyfin.svg?label=backers"/>
</a>
<a href="https://features.jellyfin.org">
<img alt="Feature Requests" src="https://img.shields.io/badge/fider-vote%20on%20features-success.svg"/>
</a>
<a href="https://matrix.to/#/+jellyfin:matrix.org">
<img alt="Chat on Matrix" src="https://img.shields.io/matrix/jellyfin:matrix.org.svg?logo=matrix"/>
</a>
<a href="https://www.reddit.com/r/jellyfin">
<img alt="Join our Subreddit" src="https://img.shields.io/badge/reddit-r%2Fjellyfin-%23FF5700.svg"/>
</a>
</p>

Jellyfin Web is the frontend used for most of the clients available for end users, such as desktop browsers, Android, and iOS. We welcome all contributions and pull requests! If you have a larger feature in mind please open an issue so we can discuss the implementation before you start. Translations can be improved very easily from our <a href="https://translate.jellyfin.org/projects/jellyfin/jellyfin-web">Weblate</a> instance. Look through the following graphic to see if your native language could use some work!

<a href="https://translate.jellyfin.org/engage/jellyfin/?utm_source=widget">
<img src="https://translate.jellyfin.org/widgets/jellyfin/-/jellyfin-web/multi-auto.svg" alt="Detailed Translation Status"/>
</a>

## Build Process

### Dependencies

- [Node.js](https://nodejs.org/en/download)
- npm (included in Node.js)

### Getting Started

1. Clone or download this repository.

   ```sh
   git clone https://github.com/jellyfin/jellyfin-web.git
   cd jellyfin-web
   ```

2. Install build dependencies in the project directory.

   ```sh
   npm install
   ```

3. Run the web client with webpack for local development.

   ```sh
   npm start
   ```

4. Build the client with sourcemaps available.

   ```sh
   npm run build:development
   ```

Review the [Contributing Guide](./CONTRIBUTING.md) for more information on our process and tech stack.
