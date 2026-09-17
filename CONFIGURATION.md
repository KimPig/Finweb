# Finweb Configuration

These settings apply to the Finweb frontend. They do not install or change
Jellyfin Server plugins.

## Theme and Branding

Finweb's square-edged theme is bundled with the client. The default primary
accent is `#4589FF`, with `#2474FF` for the action accent. An additional theme
import is not needed to obtain the default design.

Dashboard, metadata management, plugin configuration and the setup wizard do
not receive the built-in Finweb theme. User-interface styling is scoped when
changing routes rather than forcing a dashboard page reload.

Use Jellyfin's **Dashboard > Branding** page for server custom CSS, the login
disclaimer and the official splashscreen image/enable setting. The server's
branding image is read at runtime; Finweb does not embed a personal image URL.
The normal backdrop dimming remains.

Existing Jellyfin CSS can still be supplied, but selector and layout compatibility
is not guaranteed. Modern MUI pages and Finweb-specific groups differ from older
Jellyfin themes. Remove an old full-theme import when testing the integrated theme
to avoid conflicting rules. Additional remote CSS still depends on its own load
time; bundling the default theme does not make remote imports load synchronously.

The login page is not the whole viewport: a background applied only to `#loginPage`
may not cover the header. Official branding uses a separate full-screen backdrop.
Finweb does not automatically convert arbitrary CSS or scripts into that backdrop.

## Custom JavaScript

On **Dashboard > Branding**, enable custom JavaScript to reveal both input fields:

1. **Direct code:** JavaScript only, without `<script>` tags.
2. **External URLs:** one absolute HTTP(S) script URL per line. Do not paste HTML
   script tags. Blank lines are ignored and duplicate normalized URLs load once.

Both fields can be used together. External scripts load in listed order, then
direct code runs. An invalid URL prevents execution; a script-load failure stops
the remaining URL list and direct code. A script that loads successfully can
still contain runtime errors or failing asynchronous requests.

Save, then reload to apply changes. Turning the switch off preserves the saved
fields but disables execution after reload. Saving is not a live-code runner.
Scripts run once per page load after the selected server's settings arrive, so
they must handle page elements that appear later or change during navigation.

### Scope and Storage

Settings are saved on the selected Jellyfin server, not separately on each device.
Each server can have different code. A server modification or injector plugin is
not required: Finweb encodes the settings as UTF-8 JSON/Base64 in a comment inside
the server's existing `Branding.CustomCss` field:

```css
/* finweb-custom-js:v3:... */
```

The official web client's CSS editor may show that comment, but the official
client does not execute it. Removing the comment removes the saved JS settings.
Finweb separates it from CSS when displaying its own settings form.

**Base64 is not encryption.** Branding settings can be read before login. Do not
put passwords, API keys or other secrets in either field. Only use scripts and
script hosts you trust; executed scripts can access the page and login state.

Finweb does not start custom scripts on dashboard, metadata, plugin configuration,
setup or server-selection pages. Scripts already started elsewhere can still
affect those pages; navigation is not a sandbox or a way to undo their changes.
If custom JS has run, switching servers or opening server selection causes a full
reload to avoid carrying its execution state into the next server.

### Safe Mode and Recovery

Put `finwebSafeMode=1` in the query string **before `#`** and load the page:

```text
http://127.0.0.1:8097/index.html?finwebSafeMode=1#/dashboard/branding
```

Use your deployment's actual web address/path; use `&` if another query parameter
already exists. Safe mode prevents Finweb custom JS execution in the current tab.
Where session storage is available, it remains active until explicitly exited,
even if the query flag is later removed.

Sign in if needed, disable or correct the script in Branding, and save. Use the
safe-mode exit button to reload normally, or explicitly load `finwebSafeMode=0`.
Safe mode does not disable custom CSS, browser extensions or scripts manually
inserted into `index.html` outside Finweb's loader.

### Loading Problems

Check browser-console messages prefixed with `[Finweb]`. Direct-code errors are
associated with `finweb-custom.js`; a successful synchronous message does not
prove that later image or network requests succeeded.

External files use classic script elements, not `fetch()` for the JS source.
Requests made *by* those scripts still follow browser CORS, HTTPS/mixed-content
and Content Security Policy restrictions. Moving from a local preview to a
server changes the page origin; it does not automatically fix a remote API's
access policy. Correct the remote endpoint or hosting policy rather than
disabling browser security.

## Server Selection

Open `#/selectserver` on your Finweb web address. For the default local preview:

```text
http://127.0.0.1:8097/#/selectserver
```

## Mobile App Notice

Mobile visitors see both Findroid and Swiftfin store links, rather than only the
link for their platform. Supported Jellyfin mobile wrappers also show the notice
and use their native bridge to open links. Desktop, TV, playback and management
screens do not trigger it.

**Close** dismisses it for current in-app navigation; reload can show it again.
**Don't show again** saves a local opt-out for that web origin/browser/app, not
the Jellyfin account. A different device or cleared browser storage can show it
again. Installing a suggested app is optional.
