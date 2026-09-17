# Upstream Provenance

Finweb is an independent snapshot repository derived from a customized
Jellyfin Web working copy. It does not preserve upstream Git ancestry.

| Reference | Value |
| --- | --- |
| Official repository | [jellyfin/jellyfin-web](https://github.com/jellyfin/jellyfin-web) |
| Initial official baseline tag | `v12.0` |
| Initial official baseline commit | `0e83c6a724b31f3e9b5a499244331a288c060a4a` |
| Current official baseline tag | `v12.1` |
| Current official baseline commit | `fae41f33eb7cd636a9ef68984adb82bb247a6e1b` |
| Finweb initial snapshot | `249523b4dbfa62d707c27528f39892eda96ad4cc` |
| Current Finweb version | `12.1.0` |

The official baseline identifies the source beneath the custom changes, not the
exact contents of Finweb's initial snapshot. The copied working tree also
contained custom changes. Its exact source checkout commit and dirty state have
not been independently established here and must not be inferred from another
repository's current HEAD.

The official Web baseline and Finweb revision are separate metadata. The current
trailing `.0` has been deliberately retained during development; changing it or
publishing a tag requires a separate release decision.

## Recorded Integration: Web v12.1

The recorded 2026-09-15 integration applied the v12.0..v12.1 source delta while
retaining Finweb branding and custom dependencies. It updated `@jellyfin/sdk` to
1.0.0 and regenerated the lockfile.

Notable upstream commits in that integration:

- `288b5ea3d8`: propagate the user's language to the SDK.
- `43d362a4a7`: use the stable SDK 1.0.0 release.
- `f77e8a8b91`, `bf440ade9e`: administrator Quick Connect user selection,
  including escaped user names.
- `5692208f57`: correct Safari indicator SVG fill colors.
- `fae41f33eb`: release metadata, adapted to Finweb's identity.

Finweb commit containing this integration: **not assigned in this uncommitted
working state**. Replace this note with the actual integration commit once it is
committed. The upstream commit is not a Finweb commit or a published release tag.

The integration record includes unit/SDK checks, identity and browser-layout
fixtures, production build, JavaScript compatibility checks and preview startup.
Historical tests also included player experiments that have since been removed;
they are not current supported modes. Current verification instructions are in
[CONTRIBUTING.md](CONTRIBUTING.md). Live Quick Connect and Safari-specific visual
behavior require device/server verification beyond those fixtures.

The later retained-Home refresh, built-in theme, custom-JS and seek-preview changes
are Finweb customizations, not claims about changes made by the v12.1 release.
See [CHANGE_PLAN.md](CHANGE_PLAN.md) and [PLAYBACK.md](PLAYBACK.md).

## Future Updates

1. Choose and record the target official tag and full commit hash.
2. Compare that target with the recorded official baseline, not only with Finweb's
   current files or an assumed common Git ancestor.
3. Review and adapt the delta against Finweb's UI, playback and configuration.
4. Run the affected tests and record any changes intentionally omitted or altered.
5. Update this baseline record and identify the Finweb commit carrying the update.

Adding an upstream remote alone does not connect the histories or guarantee a
safe merge. Keep `origin` pointed at `KimPig/Finweb`; do not push to the official
project. Repository contents, local builds, Actions artifacts and GitHub Releases
are distinct states and must not be described interchangeably.
