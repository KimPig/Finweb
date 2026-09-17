import { describe, expect, it } from 'vitest';

import { type CustomScriptSettings, isValidCustomScriptUrl, parseCustomScriptUrls, readCustomScript, writeCustomScript } from './customScriptSettings';
import { CustomScriptRuntime, isScriptExcludedPath, readSafeMode } from './customScriptRuntime';

const inline = (code: string, enabled = true): CustomScriptSettings => ({ enabled, code, mode: 'code', url: '' });

describe('server-backed custom JavaScript settings', () => {
    it('stores combined sources without enabling the inactive source in old v2 settings', () => {
        const script: CustomScriptSettings = { enabled: true, mode: 'both', code: 'initialize()', url: 'https://example.test/library.js' };
        expect(readCustomScript(writeCustomScript('', script))).toEqual({ css: '', script, invalid: false });
        const legacy = { ...script, version: 2, mode: 'url' };
        expect(readCustomScript(`/* finweb-custom-js:v2:${btoa(JSON.stringify(legacy))} */`).script.mode).toBe('url');
    });

    it('round-trips Unicode and CSS/HTML delimiters without exposing executable text', () => {
        const css = '@import url("theme.css");\n.test { color: red; }';
        const script = inline('window.test = "한글 */ </style> </script>";\n// test');
        const stored = writeCustomScript(css, script);
        expect(stored).not.toContain('</style>');
        expect(stored).not.toContain('window.test');
        expect(readCustomScript(stored)).toEqual({ css, script, invalid: false });
    });

    it('preserves unrelated comments, replaces the old block and keeps disabled code', () => {
        const css = '/* user comment */\na {color:red}';
        const first = writeCustomScript(css, inline('first()'));
        const next = writeCustomScript(first, inline('second()', false));
        expect(readCustomScript(next)).toEqual({ css, script: inline('second()', false), invalid: false });
        expect(next.match(/finweb-custom-js/g)).toHaveLength(1);
        expect(writeCustomScript(next, inline('', false))).toBe(css);
    });

    it('fails closed on malformed, unsupported and duplicate blocks', () => {
        for (const block of [
            '/* finweb-custom-js:v3:e30= */',
            '/* finweb-custom-js:v1:bad! */',
            '/* finweb-custom-js:v1:e30= */',
            writeCustomScript('', inline('run()')).repeat(2)
        ]) {
            expect(readCustomScript(block).invalid).toBe(true);
            expect(readCustomScript(block).script.enabled).toBe(false);
        }
    });

    it('migrates v1 settings and preserves both sources across mode changes', () => {
        const legacy = `/* finweb-custom-js:v1:${btoa(JSON.stringify({ version: 1, enabled: true, code: 'legacy()' }))} */`;
        expect(readCustomScript(legacy).script).toEqual(inline('legacy()'));
        const script: CustomScriptSettings = { ...readCustomScript(legacy).script, mode: 'url', url: 'https://example.test/bg.js' };
        expect(readCustomScript(writeCustomScript(legacy, script))).toEqual({ css: '', script, invalid: false });
        const disabled = { ...script, enabled: false };
        expect(readCustomScript(writeCustomScript('', disabled)).script).toEqual(disabled);
        expect(readCustomScript(writeCustomScript('', { ...script, mode: 'code' })).script.code).toBe('legacy()');
    });

    it('fails closed on corrupt v2 source selection', () => {
        for (const values of [{ mode: 'html', url: '' }, { mode: 'url', url: null }]) {
            const encoded = btoa(JSON.stringify({ version: 2, enabled: true, code: '', ...values }));
            expect(readCustomScript(`/* finweb-custom-js:v2:${encoded} */`).invalid).toBe(true);
        }
    });

    it('validates every line before loading, preserving order and ignoring blanks and duplicates', () => {
        expect(parseCustomScriptUrls(' https://example.test/a.js \r\n\nhttps://example.test/b.js\nhttps://example.test/a.js'))
            .toEqual({ urls: ['https://example.test/a.js', 'https://example.test/b.js'] });
        expect(parseCustomScriptUrls('https://example.test/a.js\n\n/b.js')).toEqual({ urls: [], invalidLine: 3 });
        expect(parseCustomScriptUrls('\n  \n')).toEqual({ urls: [] });
        expect(isValidCustomScriptUrl('https://example.test/a.js\nhttps://example.test/b.js')).toBe(false);
        const script: CustomScriptSettings = { enabled: true, mode: 'url', code: 'saved()', url: 'https://example.test/a.js\nhttps://example.test/b.js' };
        expect(readCustomScript(writeCustomScript('', script)).script).toEqual(script);
    });

    it.each(['https://example.test/bg.js', 'https://example.test/script?id=1', 'http://127.0.0.1:8097/bg.js'])('accepts an absolute script URL: %s', url => {
        expect(isValidCustomScriptUrl(url)).toBe(true);
    });

    // eslint-disable-next-line sonarjs/code-eval -- These malicious URL fixtures are rejected, never executed.
    it.each(['', '/bg.js', 'javascript:alert(1)', 'data:text/javascript,alert(1)', 'file:///bg.js', 'https://user:pass@example.test/bg.js', '<script src="https://example.test/bg.js"></script>'])('rejects unsafe or unsupported URLs: %s', url => {
        expect(isValidCustomScriptUrl(url)).toBe(false);
    });
});

describe('custom script recovery and isolation', () => {
    it('persists safe mode for this tab and supports an explicit exit', () => {
        const values = new Map<string, string>();
        const storage = {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => { values.set(key, value); },
            removeItem: (key: string) => { values.delete(key); }
        };
        expect(readSafeMode('?finwebSafeMode=1', storage)).toBe(true);
        expect(readSafeMode('', storage)).toBe(true);
        expect(readSafeMode('?finwebSafeMode=0', storage)).toBe(false);
        expect(readSafeMode('', storage)).toBe(false);
        expect(readSafeMode('?finwebSafeMode=1')).toBe(true);
    });

    it('runs at most once and preserves dashboard navigation without reloading', () => {
        const runtime = new CustomScriptRuntime(false);
        expect(runtime.claim('server-a', '/dashboard/branding')).toBe(false);
        expect(runtime.claim('server-a', '/home')).toBe(true);
        expect(runtime.claim('server-a', '/home')).toBe(false);
        runtime.markExecuted();
        expect(runtime.needsReload('server-a', '/details')).toBe(false);
        expect(runtime.needsReload('server-b', '/home')).toBe(true);
        expect(runtime.needsReload(undefined, '/selectserver')).toBe(true);
        expect(runtime.needsReload('server-a', '/dashboard/branding')).toBe(false);
        expect(runtime.needsReload(undefined, '/dashboard/branding')).toBe(false);
        expect(runtime.needsReload('server-a', '/metadata')).toBe(false);
        expect(runtime.needsReload('server-a', '/configurationpage')).toBe(false);
        expect(runtime.needsReload('server-a', '/addserver')).toBe(true);
        expect(runtime.claim('server-b', '/home')).toBe(false);
    });

    it('never claims in safe mode and excludes all admin routes', () => {
        expect(new CustomScriptRuntime(true).claim('a', '/home')).toBe(false);
        for (const path of ['/dashboard', '/dashboard/branding', '/DASHBOARD/branding', '/!/dashboard/branding', '/metadata', '/configurationpage', '/wizardstart', '/selectserver', '/addserver']) {
            expect(isScriptExcludedPath(path)).toBe(true);
        }
        expect(isScriptExcludedPath('/login')).toBe(false);
        expect(isScriptExcludedPath('/home')).toBe(false);
    });
});
