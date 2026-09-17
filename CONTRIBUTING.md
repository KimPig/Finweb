# Contributing to Finweb

Finweb is maintained separately from Jellyfin Web. File Finweb-specific issues
and changes in [KimPig/Finweb](https://github.com/KimPig/Finweb), not the official
Jellyfin repository. Contributions intended for upstream must follow that
project's own contribution rules.

## Development

Use Node from [.nvmrc](.nvmrc), npm and the repository lockfile:

```sh
npm ci
npm test
npm run build:check
npm run lint
npm run stylelint
npm run build:production
npm run escheck
```

The production build writes `dist/`; the final command checks the generated
JavaScript. Building the app is not the same as testing authenticated playback.
See [README.md](README.md) for a visible, static preview server.

Keep changes focused and preserve unrelated local work. Use TypeScript for new
application modules and React for new app pages. Prefer the Jellyfin SDK for new
API integrations and preserve legacy/native-wrapper contracts when changing
existing paths. Add regression tests for behavior changes, including cancellation,
slow responses and failures when relevant.

Finweb-specific translation keys belong in `src/strings/`; keep the English
source and affected local translations consistent. Do not send Finweb-only strings
to upstream's translation service. Preserve inherited contributor and license notices.

## Source Map

| Area | Location |
| --- | --- |
| Modern routes, desktop layout, retained Home | `src/apps/modern/` |
| Legacy OSD and playback view | `src/apps/legacy/controllers/playback/video/` |
| Admin settings and branding | `src/apps/dashboard/` |
| Playback reports and host integration | `src/components/playback/` |
| Video player, sessions and subtitle pipeline | `src/plugins/htmlVideoPlayer/` |
| Shared subtitle/Trickplay/preview helpers | `src/plugins/finwebPlayer/` |
| Built-in theme | `src/styles/finweb.scss`, `src/themes/` |
| JS settings, loader and theme scope | `src/utils/finweb/` |
| Browser integration fixtures | `scripts/test-*.mjs` |
| Home regression tests | `src/tests/home/` |

Client `src/plugins/` modules are not Jellyfin Server plugins. The
`finwebPlayer` directory contains shared helpers, not an alternative player UI.

## Browser Checks

Browser scripts need Playwright and an installed Chromium binary. If Playwright
is supplied outside this repository, set `PLAYWRIGHT_MODULE` to the absolute path
of its importable entry point, such as `playwright/index.mjs`. Do not commit
machine-specific runtime paths. Playback/video fixtures also require `ffmpeg`
on PATH.

Run the checks relevant to the change:

```sh
node scripts/test-finweb-identity.mjs
node scripts/test-finweb-layout.mjs
node scripts/test-finweb-theme.mjs
node scripts/test-login-background.mjs
node scripts/test-finweb-slider.mjs
node scripts/test-finweb-seek-preview.mjs
node scripts/test-ass-browser.mjs
npm run test:playback
node scripts/test-finweb-preview.mjs
```

The built-preview test expects a running server at `http://127.0.0.1:8097`, or
the address in `FINWEB_PREVIEW_URL`. Build first and keep its serving terminal open.
Set `FINWEB_PRODUCTION_ENGINE=1` for the playback fixture to use the built libass
Worker/WASM files in `dist/libraries/`.

Tests use isolated fixtures, DOM measurements and canvas-pixel checks. Do not
take screenshots or inspect a user's authenticated browser without an appropriate
request. Real-server and device checks are separate from fixture results.

## Upstream Changes

Consult [UPSTREAM.md](UPSTREAM.md) before updating the baseline. This snapshot
repository does not share upstream Git ancestry; an upstream remote does not
make a blind merge appropriate. Adapt the chosen upstream delta and recheck the
Finweb-specific UI, subtitle, server-reporting and native-host paths.

Keep `origin` pointed at the Finweb repository. Never publish Finweb's custom
work to the official Jellyfin repository as part of a Finweb release.

## Distribution Checklist

Regular workflows build and check code and upload a `finweb-dist` Actions artifact.
Markdown-only pushes are excluded by the branch push workflow.
The separate [release workflow](.github/workflows/release.yml) runs when a stable
version tag such as `v12.1.0` is pushed, and only in `KimPig/Finweb`.

Before installing dependencies, it checks the tag against `package.json`'s
`version`, `finwebVersion`, `jellyfinWebVersion` prefix and root lockfile metadata.
It then runs type checks, unit tests, a production build and ES compatibility checks.
The publication job runs only after these steps succeed; the build job itself has
no release write permission.

Release files are `finweb-VERSION.zip`, `finweb-VERSION.tar.gz` and `SHA256SUMS.txt`.
Both archives contain the frontend files at their root, plus `LICENSE`; neither
contains the repository, dependencies, local notes or Jellyfin Server. Release
notes link to the exact source commit. The artifact is kept for 14 days for job
retries. Files are uploaded to a draft before it becomes public. A retry may
replace draft assets but refuses to overwrite an already published version.

No personal access token is required: publication uses the workflow's GitHub token
with `contents: write` and artifact-read access. Repository or organization Actions
policies must allow those permissions. GitHub-hosted runners provide the archive
tools and GitHub CLI used by the workflow.

Before publishing a build:

1. Review the intended diff and confirm the remote and target branch. Do not
   include local handoffs, backups, credentials, personal CSS/JS or diagnostic logs.
2. Run relevant checks and build the exact source revision to be distributed.
   Review results rather than relying on a previous test count.
3. Keep Finweb's version and official Web baseline distinct. The current
   development version remains `12.1.0`; do not bump it implicitly.
4. Record the tested source revision, upstream baseline and known limitations.
5. Commit the intended source and workflow to the existing working branch, and
   push that branch to `origin`. Only then create/push the matching version tag.
   Never reuse a published tag for different files or silently force-move it.

For the current version, after the intended commit is pushed:

```sh
node --test scripts/test-release-version.mjs
node scripts/validate-release.mjs v12.1.0
git tag -a v12.1.0 -m "Finweb 12.1.0"
git push origin v12.1.0
```

These tag commands publish a release through Actions; do not run them just to
test the workflow. For a later revision, update the product/lockfile versions and
use its matching tag. The validator currently accepts stable `vX.Y.Z` tags only,
not prerelease suffixes. Watch **Finweb Release** in Actions and confirm the assets
in Releases before announcing completion. Configuration or local validation alone
does not verify a successful GitHub-hosted run.

The publication sequence uses the official [GitHub CLI release commands](https://cli.github.com/manual/gh_release_create).

Public documentation is README, CONFIGURATION, CHANGE_PLAN, PLAYBACK,
CONTRIBUTING and UPSTREAM. `LICENSE` and `CONTRIBUTORS.md` preserve upstream
notices. Root `*.local.md` files, `.local-backup/`, exported subtitle diagnostics,
`dist/` and `node_modules/` stay out of Git.
