/* eslint-disable compat/compat -- Developer checks run in Node 24. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = relative => readFile(new URL(relative, root), 'utf8');

// Run the actual save functions with isolated storage, without booting a server.
async function loadDeclaration(relative, name, bindings = {}) {
    const source = ts.createSourceFile(relative, await read(relative), ts.ScriptTarget.Latest, true);
    const declaration = source.statements.find(node => node.name?.text === name);
    assert.ok(declaration, `${relative}: ${name}`);
    const compiled = ts.transpileModule(declaration.getText(source).replace(/^export /, ''), {
        compilerOptions: { target: ts.ScriptTarget.ES2022 }
    }).outputText;
    // eslint-disable-next-line sonarjs/code-eval -- Only compile declarations from this trusted checkout.
    return new Function(...Object.keys(bindings), `${compiled}; return ${name};`)(...Object.values(bindings));
}

const policyModule = await read('src/constants/finwebPreferences.ts');
// eslint-disable-next-line sonarjs/code-eval -- The policy source is from this trusted checkout.
const policy = new Function(ts.transpileModule(policyModule.replaceAll('export ', ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText + '; return { finwebPreferences, isVisiblePreferenceRoute };')();
assert.deepEqual(policy.finwebPreferences, { displayCustomization: false, playbackAdvanced: false, subtitles: false });
assert.equal(policy.isVisiblePreferenceRoute({ path: 'mypreferencessubtitles' }), false);
assert.equal(policy.isVisiblePreferenceRoute({ path: 'mypreferencesplayback' }), true);

const displayHidden = ['#chkDisableCustomCss', '#txtLocalCustomCss', '#selectDashboardTheme', '.selectScreensaver',
    '#txtScreensaverTime', '#txtBackdropScreensaverInterval', '#txtSlideshowInterval', '#chkFadein', '#chkBlurhash'];
const playbackHidden = ['.chkPreferFmp4HlsContainer', '.chkEnableCinemaMode', '.mediaSegmentActionContainer',
    '.chkEnableDts', '.chkEnableTrueHd', '.chkEnableHi10p', '.chkLimitSegmentLength',
    '#selectPreferredTranscodeVideoCodec', '#selectPreferredTranscodeVideoAudioCodec',
    '#selectAudioNormalization', '.chkAlwaysRemuxFlac', '.chkAlwaysRemuxMp3'];

const displayDocument = new JSDOM(await read('src/components/displaySettings/displaySettings.template.html')).window.document;
const playbackDocument = new JSDOM(await read('src/components/playbackSettings/playbackSettings.template.html')).window.document;
for (const [document, selectors] of [[displayDocument, displayHidden], [playbackDocument, playbackHidden]]) {
    for (const selector of selectors) {
        const field = document.querySelector(selector);
        assert.ok(field?.closest('fieldset[hidden][disabled]'), `${selector} stays mounted, hidden and disabled`);
    }
    for (const input of document.querySelectorAll('input, select, textarea')) {
        if (input.tagName === 'SELECT') input.innerHTML += '<option value="saved" selected>saved</option>';
        else input.value = 'saved';
        input.checked = true;
    }
}
for (const selector of ['#selectTheme', '#chkBackdrops', '#txtLibraryPageSize']) {
    assert.equal(displayDocument.querySelector(selector).closest('[hidden]'), null, selector);
}
for (const selector of ['.selectSkipForwardLength', '.selectSkipBackLength', '.chkEpisodeAutoPlay', '.chkEnableNextVideoOverlay']) {
    assert.equal(playbackDocument.querySelector(selector).closest('[hidden]'), null, selector);
}
for (const heading of playbackDocument.querySelectorAll('h2, h3')) {
    if (/Header(VideoAdvanced|AudioAdvanced|MediaSegmentActions)/.test(heading.textContent)) {
        assert.ok(heading.closest('[hidden]'));
    }
}
const hiddenDisplayKeys = ['customCss', 'disableCustomCss', 'dashboardTheme', 'screensaver', 'screensaverTime',
    'backdropScreensaverInterval', 'slideshowInterval', 'enableBlurhash', 'enableFastFadein'];
const hiddenPlaybackKeys = ['preferredTranscodeVideoCodec', 'preferredTranscodeVideoAudioCodec', 'enableDts',
    'enableTrueHd', 'enableHi10p', 'alwaysRemuxFlac', 'alwaysRemuxMp3', 'preferFmp4HlsContainer',
    'limitSegmentLength', 'enableCinemaMode', 'selectAudioNormalization', 'set'];
const writes = [];
const settings = new Proxy({}, { get: (_, key) => (...args) => {
    if (args.length) writes.push(key);
    return 'saved';
} });
const api = { getCurrentUserId: () => 'user', updateUserConfiguration: async () => undefined,
    getUser: async () => ({ Id: 'user', Configuration: { SubtitleMode: 'Default' } }) };
const common = {
    finwebPreferences: policy.finwebPreferences,
    appHost: { supports: () => true }, AppFeature: {},
    layoutManager: { setLayout: () => undefined },
    skinManager: { setTheme: () => undefined }, themeManager: { setTheme: async () => undefined }
};
const saveDisplay = await loadDeclaration('src/components/displaySettings/displaySettings.js', 'saveUser', common);
await saveDisplay(displayDocument, await api.getUser(), settings, api);
assert.ok(writes.includes('theme'));
assert.ok(writes.includes('enableBackdrops'));
assert.ok(hiddenDisplayKeys.every(key => !writes.includes(key)), `Hidden display writes: ${writes}`);

writes.length = 0;
const saveModern = await loadDeclaration('src/apps/modern/features/preferences/hooks/useDisplaySettings.ts', 'saveDisplaySettings', {
    ...common, normalizeValue: value => /^(auto|none)$/.test(value) ? '' : value
});
await saveModern({ api, newDisplaySettings: new Proxy({}, { get: () => 'changed' }), userSettings: settings, userId: 'user' });
assert.ok(writes.includes('theme'));
assert.ok(hiddenDisplayKeys.every(key => !writes.includes(key)), `Hidden modern display writes: ${writes}`);

writes.length = 0;
const savePlayback = await loadDeclaration('src/components/playbackSettings/playbackSettings.js', 'saveUser', {
    ...common, appSettings: settings, setMaxBitrateFromField: () => undefined
});
await savePlayback(playbackDocument, await api.getUser(), settings, api);
assert.ok(writes.includes('skipForwardLength'));
assert.ok(writes.includes('skipBackLength'));
assert.ok(writes.includes('enableNextVideoInfoOverlay'));
assert.ok(hiddenPlaybackKeys.every(key => !writes.includes(key)), `Hidden playback writes: ${writes}`);

const UserSettings = await loadDeclaration('src/scripts/settings/userSettings.js', 'UserSettings');
const userSettings = new UserSettings();
const stored = new Map();
userSettings.get = key => stored.get(key);
userSettings.set = (key, value) => stored.set(key, value);
assert.equal(userSettings.skipForwardLength(), 10000);
assert.equal(userSettings.skipBackLength(), 10000);
userSettings.skipForwardLength(30000);
userSettings.skipBackLength(5000);
assert.equal(userSettings.skipForwardLength(), 30000);
assert.equal(userSettings.skipBackLength(), 5000);

console.log(`Finweb preference checks passed (${fileURLToPath(root)}): hidden controls, save preservation, subtitle route, seek defaults and saved intervals.`);
/* eslint-enable compat/compat */
