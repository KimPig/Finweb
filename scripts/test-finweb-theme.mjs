/* eslint-disable compat/compat -- Runs in Node and current Chromium, without screenshots. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { compile } from 'sass';
import postcss from 'postcss';

const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const themeSource = await read('src/styles/finweb.scss');
assert.doesNotMatch(themeSource, /https?:|url\s*\(|@import|data:image|waclan|kimpig/i);
assert.doesNotMatch(themeSource, /::cue|content:\s*["'](?:로그인|재생)/);
let css = '';
for (const name of ['src/styles/site.scss', 'src/styles/librarybrowser.scss', 'src/styles/finweb.scss']) {
    css += compile(fileURLToPath(new URL(name, root)), { loadPaths: [fileURLToPath(new URL('src/styles', root))], quietDeps: true, logger: { warn() { /* Fixture ignores dependency deprecation notices. */ } } }).css;
}
const cssRoot = postcss.parse(css);
cssRoot.walkAtRules('import', rule => rule.remove());
cssRoot.walkDecls(decl => {
    if (/url\(/.test(decl.value)) decl.remove();
});
css = cssRoot.toString();
const login = (await read('src/apps/legacy/controllers/session/login/index.html')).replace(/\$\{[^}]+\}/g, 'Sign in');
const detail = (await read('src/apps/legacy/controllers/itemDetails/index.html')).replace(/\$\{[^}]+\}/g, 'Section');
const stubs = {
    'hooks/useBrandingApi': 'import {useLocation} from \'react-router-dom\'; export function useBrandingApi(){const l=useLocation();return l.pathname===\'/selectserver\'?undefined:{basePath:new URLSearchParams(l.search).get(\'serverid\')||window.fixtureServer||\'a\'};}',
    'hooks/useApi': 'const api={basePath:\'a\',getUri:()=>\'/splash\'};export const useApi=()=>({api,user:{Id:\'user\',Name:\'User\',Policy:{IsAdministrator:true}}});',
    'lib/jellyfin-apiclient': 'export const ServerConnections={getApi:()=>({basePath:window.fixtureServer||\'a\'})};',
    'lib/globalize': 'import strings from \'./src/strings/en-us.json\';export default {translate:key=>strings[key]||key};',
    'utils/query/queryClient': 'import {QueryClient} from \'@tanstack/react-query\';export const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});',
    'components/Page': 'import React from \'react\';export default ({children,id})=><main id={id}>{children}</main>;',
    'components/Image': 'export default ()=>null;',
    'components/loading/LoadingComponent': 'export default ()=>null;',
    '@jellyfin/sdk/lib/utils/api/branding-api': 'export const getBrandingApi=api=>({getBrandingOptions:()=>fetch(\'/branding/\'+api.basePath).then(r=>r.json()).then(data=>({data}))});',
    '@jellyfin/sdk/lib/utils/api/system-api': 'export const getSystemApi=api=>({updateNamedConfiguration:({body})=>fetch(\'/branding/\'+api.basePath,{method:\'POST\',body}).then(r=>r.json())});',
    '@jellyfin/sdk/lib/utils/api/image-api': 'export const getImageApi=()=>({});'
};
const bundle = await build({
    absWorkingDir: fileURLToPath(root),
    bundle: true, write: false, format: 'iife', loader: { '.png': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'fixture', setup(builder) {
        builder.onResolve({ filter: /.*/ }, args => stubs[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: fileURLToPath(root) }));
    } }],
    stdin: { loader: 'tsx', resolveDir: fileURLToPath(root), contents: `
import React,{useLayoutEffect} from 'react';import {createRoot} from 'react-dom/client';
import {ThemeProvider} from '@mui/material/styles';import {QueryClientProvider} from '@tanstack/react-query';
import {createHashRouter,RouterProvider,Outlet,useNavigate,useLocation} from 'react-router-dom';
import theme,{finwebTheme} from './src/themes';import CustomJavaScript from './src/components/CustomJavaScript';
import {usesFinwebTheme} from './src/utils/finweb/themeScope';
import Button from '@mui/material/Button';
import UserAvatar from './src/components/UserAvatar';import BrandLogo from './src/components/toolbar/BrandLogo';
import {Component as Branding,action} from './src/apps/dashboard/routes/branding';
import {queryClient} from 'utils/query/queryClient';
function App(){window.navigate=useNavigate();const enabled=usesFinwebTheme(useLocation().pathname);useLayoutEffect(()=>{document.documentElement.toggleAttribute('data-finweb-theme',enabled);},[enabled]);return <ThemeProvider theme={enabled?finwebTheme:theme} defaultMode='dark'><CustomJavaScript/><BrandLogo/><UserAvatar user={{Id:'u',Name:'User'}} size={30}/><Button id='theme-probe'>Theme</Button><Outlet/></ThemeProvider>;}
const router=createHashRouter([{element:<App/>,children:[{path:'/dashboard/branding',element:<Branding/>,action},{path:'*',element:<div id='screen'>Fixture</div>}]}]);
createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><RouterProvider router={router}/></QueryClientProvider>);
` }
});
const encode = (code, enabled = true) => `body { --fixture: 1; }\n/* finweb-custom-js:v1:${Buffer.from(JSON.stringify({ version: 1, enabled, code })).toString('base64')} */`;
const encodeUrl = (url, enabled = true) => `/* finweb-custom-js:v2:${Buffer.from(JSON.stringify({ version: 2, enabled, code: 'window.inactiveCode = true;', mode: 'url', url })).toString('base64')} */`;
const encodeBoth = (url, code) => `/* finweb-custom-js:v3:${Buffer.from(JSON.stringify({ version: 3, enabled: true, code, mode: 'both', url })).toString('base64')} */`;
const options = new Map([
    ['a', { CustomCss: encode('window.scriptRuns = (window.scriptRuns || 0) + 1;'), LoginDisclaimer: 'Original notice', SplashscreenEnabled: false }],
    ['b', { CustomCss: encode('window.serverB = true;'), LoginDisclaimer: '', SplashscreenEnabled: false }]
]);
let delayBranding = 0;
const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname.startsWith('/branding/')) {
        const id = url.pathname.split('/').pop();
        if (request.method === 'POST') {
            let text = '';
            for await (const chunk of request) text += chunk;
            options.set(id, JSON.parse(text));
        } else if (delayBranding) {
            await new Promise(resolve => setTimeout(resolve, delayBranding));
        }
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(options.get(id)));
    } else if (url.pathname === '/app.js') {
        response.setHeader('Content-Type', 'text/javascript');
        response.end(bundle.outputFiles[0].text);
    } else {
        if (url.searchParams.has('blockExternal')) response.setHeader('Content-Security-Policy', "script-src 'self'");
        response.setHeader('Content-Type', 'text/html');
        response.end(`<!doctype html><html class='layout-desktop' data-theme='dark' dir='ltr'><meta name='viewport' content='width=device-width'><style>${css}</style><body><div id='root'></div><div id='fixture'></div><script src='/app.js'></script></body></html>`);
    }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let externalRequests = 0;
const externalServer = createServer((request, response) => {
    externalRequests++;
    response.setHeader('Content-Type', 'text/javascript');
    if (request.url === '/missing.js') {
        response.statusCode = 404;
        response.end();
    } else if (request.url === '/first.js') {
        setTimeout(() => response.end('window.scriptOrder = ["first"];'), 250);
    } else if (request.url === '/second.js') {
        response.end('window.scriptOrder.push("second");');
    } else {
        response.end('window.externalRuns = (window.externalRuns || 0) + 1;');
    }
});
await new Promise(resolve => externalServer.listen(0, '127.0.0.1', resolve));
const externalUrl = `http://127.0.0.1:${externalServer.address().port}/background.js`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(`${base}/#/home`);
    await page.waitForFunction(() => window.scriptRuns === 1);
    await page.evaluate(() => window.navigate('/details'));
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.scriptRuns), 1);
    assert.equal(await page.locator('.MuiAvatar-root').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(36, 116, 255)');
    assert.equal(await page.locator('#theme-probe').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(36, 116, 255)');
    assert.equal(await page.locator('#theme-probe').evaluate(el => getComputedStyle(el).borderRadius), '0px');
    assert.equal(await page.locator('script[data-finweb-custom-js]').getAttribute('data-finweb-custom-js-status'), 'completed');
    assert.ok(await page.locator('.finweb-brand-logo').evaluate(img => img.complete && img.naturalWidth > 0));

    const documentStart = await page.evaluate(() => performance.timeOrigin);
    await page.evaluate(() => window.navigate('/dashboard/branding'));
    await page.waitForURL('**/#/dashboard/branding');
    await page.locator('textarea[name="FinwebCustomJs"]').waitFor();
    assert.equal(await page.locator('#theme-probe').evaluate(el => getComputedStyle(el).borderRadius), '4px');
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-finweb-theme')), false);
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary-accent-color').trim()), '');
    assert.equal(await page.evaluate(() => window.scriptRuns), 1, 'Existing effects persist on management navigation');
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentStart, 'Dashboard navigation never reloads the document');
    await page.locator('textarea[name="FinwebCustomJs"]').fill('window.newScript = true;');
    const saved = page.waitForResponse(response => response.request().method() === 'POST');
    await page.locator('button[type="submit"]').click();
    await saved;
    await page.waitForTimeout(100);
    assert.equal(options.get('a').LoginDisclaimer, 'Original notice');
    assert.match(options.get('a').CustomCss, /finweb-custom-js:v3:/);
    await page.evaluate(() => window.navigate('/home'));
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.newScript), undefined, 'Saving does not hot-run new code');
    await page.reload();
    await page.waitForFunction(() => window.newScript === true);

    await page.evaluate(() => window.navigate('/login?serverid=b'));
    await page.waitForFunction(() => window.serverB === true);
    assert.equal(await page.evaluate(() => window.newScript), undefined, 'Switching servers removes old global state');

    options.get('a').CustomCss = encode('document.body.style.display = "none";');
    await page.goto(`${base}/?finwebSafeMode=1#/home`);
    await page.locator('.finweb-safe-mode').waitFor();
    assert.notEqual(await page.locator('body').evaluate(el => getComputedStyle(el).display), 'none');
    await page.goto(`${base}/#/dashboard/branding`);
    await page.locator('.finweb-safe-mode').waitFor();
    assert.equal(await page.locator('script[data-finweb-custom-js]').count(), 0);
    await page.locator('textarea[name="FinwebCustomJs"]').fill('window.recovered = true;');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(250);
    await page.locator('.finweb-safe-mode button').click();
    await page.waitForURL('**finwebSafeMode=0**');
    await page.locator('textarea[name="FinwebCustomJs"]').waitFor();
    await page.evaluate(() => window.navigate('/home'));
    await page.waitForFunction(() => window.recovered === true);
    console.log('PASS v1 migration, JS storage, same-document snapshot, execution once, dashboard without reload, server switch and safe-mode recovery');

    // A slow response must not execute after navigation to management.
    const pending = await browser.newPage();
    delayBranding = 500;
    await pending.goto(`${base}/#/home`);
    await pending.waitForFunction(() => !!window.navigate);
    await pending.evaluate(() => window.navigate('/dashboard/branding'));
    await pending.waitForTimeout(650);
    assert.equal(await pending.locator('script[data-finweb-custom-js]').count(), 0);
    delayBranding = 0;
    await pending.evaluate(() => window.navigate('/home'));
    await pending.waitForFunction(() => window.recovered === true);
    await pending.close();

    const invalidScript = await browser.newPage();
    const scriptErrors = [];
    invalidScript.on('pageerror', error => scriptErrors.push(error.message));
    options.set('invalid', { CustomCss: encode('const broken = ;') });
    await invalidScript.goto(`${base}/#/login?serverid=invalid`);
    await invalidScript.waitForFunction(() => document.querySelector('script[data-finweb-custom-js]')?.dataset.finwebCustomJsStatus === 'error');
    assert.ok(scriptErrors.length > 0, 'Syntax errors remain visible, never reported as successful execution');
    options.set('partial', { CustomCss: encode('window.partialEffect = true; throw new Error("fixture failure");') });
    await invalidScript.goto(`${base}/#/login?serverid=partial`);
    await invalidScript.waitForFunction(() => window.partialEffect === true);
    await invalidScript.evaluate(() => window.navigate('/dashboard/branding?serverid=partial'));
    await invalidScript.locator('textarea[name="FinwebCustomJs"]').waitFor();
    assert.equal(await invalidScript.evaluate(() => window.partialEffect), true, 'Dashboard no longer claims to undo partially executed code');
    await invalidScript.locator('a[href*="finwebSafeMode=1"]').click();
    await invalidScript.locator('.finweb-safe-mode').waitFor();
    assert.equal(await invalidScript.evaluate(() => window.partialEffect), undefined, 'Safe mode still reloads to remove old effects');
    await invalidScript.close();

    const linked = await browser.newPage();
    await linked.goto(`${base}/#/dashboard/branding`);
    await linked.locator('textarea[name="FinwebCustomJs"]').waitFor();
    assert.equal(await linked.getByRole('radio').count(), 0);
    const beforeInvalidUrl = options.get('a').CustomCss;
    await linked.locator('textarea[name="FinwebCustomJsUrl"]').fill('https://user:secret@example.test/background.js');
    await linked.locator('button[type="submit"]').click();
    await linked.getByRole('alert').filter({ hasText: 'Enter valid HTTP or HTTPS file URLs' }).waitFor();
    assert.equal(options.get('a').CustomCss, beforeInvalidUrl, 'Invalid URL cannot overwrite existing settings');
    await linked.locator('textarea[name="FinwebCustomJsUrl"]').fill(externalUrl);
    let submitted = linked.waitForResponse(response => response.request().method() === 'POST');
    await linked.locator('button[type="submit"]').click();
    await submitted;
    await linked.evaluate(() => window.navigate('/home'));
    await linked.waitForFunction(() => window.recovered === true);
    assert.equal(externalRequests, 0, 'Saving the URL cannot hot-run it');
    await linked.goto(`${base}/#/dashboard/branding`);
    await linked.reload();
    await linked.locator('textarea[name="FinwebCustomJsUrl"]').waitFor();
    assert.equal(externalRequests, 0, 'Starting on the dashboard never loads external scripts');
    assert.equal(await linked.locator('textarea[name="FinwebCustomJs"]').inputValue(), 'window.recovered = true;', 'Both fields remain available after saving');
    assert.equal(await linked.locator('textarea[name="FinwebCustomJsUrl"]').inputValue(), externalUrl);
    await linked.evaluate(() => window.navigate('/home'));
    await linked.waitForFunction(() => window.externalRuns === 1);
    await linked.waitForFunction(() => window.recovered === true);
    assert.equal(await linked.locator('script[data-finweb-custom-js][src]').getAttribute('data-finweb-custom-js-status'), 'loaded');
    const linkedStart = await linked.evaluate(() => performance.timeOrigin);
    await linked.evaluate(() => window.navigate('/dashboard/branding'));
    await linked.locator('textarea[name="FinwebCustomJsUrl"]').waitFor();
    assert.equal(await linked.evaluate(() => performance.timeOrigin), linkedStart);
    await linked.locator('input[name="FinwebCustomJsEnabled"]').uncheck();
    assert.equal(await linked.getByRole('radiogroup').count(), 0);
    assert.equal(await linked.locator('textarea[name="FinwebCustomJs"], textarea[name="FinwebCustomJsUrl"]').count(), 0);
    assert.equal(await linked.locator('a[href*="finwebSafeMode=1"]').count(), 0);
    assert.equal(await linked.getByRole('alert').filter({ hasText: 'Only use trusted JavaScript' }).count(), 0);
    submitted = linked.waitForResponse(response => response.request().method() === 'POST');
    await linked.locator('button[type="submit"]').click();
    await submitted;
    await linked.evaluate(() => window.navigate('/home'));
    const requestsBeforeReload = externalRequests;
    await linked.reload();
    await linked.waitForTimeout(300);
    assert.equal(externalRequests, requestsBeforeReload, 'Disabled URL settings are retained but never loaded');
    assert.equal(await linked.evaluate(() => window.externalRuns), undefined);
    await linked.close();

    const firstUrl = externalUrl.replace('background.js', 'first.js');
    const secondUrl = externalUrl.replace('background.js', 'second.js');
    options.set('ordered', { CustomCss: encodeUrl(` ${firstUrl} \n\n${secondUrl}\n${firstUrl}`) });
    const ordered = await browser.newPage();
    await ordered.goto(`${base}/#/login?serverid=ordered`);
    await ordered.waitForFunction(() => window.scriptOrder?.length === 2);
    assert.deepEqual(await ordered.evaluate(() => window.scriptOrder), ['first', 'second']);
    assert.equal(await ordered.locator('script[data-finweb-custom-js]').count(), 2, 'Blank lines and duplicates do not add scripts');
    assert.equal(await ordered.evaluate(() => window.inactiveCode), undefined, 'Old v2 settings retain their selected source until saved');
    options.set('both', { CustomCss: encodeBoth(`${firstUrl}\n${secondUrl}`, 'window.scriptOrder.push("inline");') });
    await ordered.goto(`${base}/#/login?serverid=both`);
    await ordered.waitForFunction(() => window.scriptOrder?.length === 3);
    assert.deepEqual(await ordered.evaluate(() => window.scriptOrder), ['first', 'second', 'inline']);
    options.set('stop', { CustomCss: encodeBoth(`${externalUrl.replace('background.js', 'missing.js')}\n${secondUrl}`, 'window.inlineAfterFailure = true;') });
    await ordered.goto(`${base}/#/login?serverid=stop`);
    await ordered.waitForFunction(() => document.querySelector('script[data-finweb-custom-js]')?.dataset.finwebCustomJsStatus === 'error');
    await ordered.waitForTimeout(100);
    assert.equal(await ordered.locator('script[data-finweb-custom-js]').count(), 1, 'A failed dependency stops the list');
    assert.equal(await ordered.evaluate(() => window.inlineAfterFailure), undefined);
    options.set('bad-list', { CustomCss: encodeUrl(`${firstUrl}\n/relative.js`) });
    await ordered.goto(`${base}/#/login?serverid=bad-list`);
    await ordered.waitForTimeout(350);
    assert.equal(await ordered.locator('script[data-finweb-custom-js]').count(), 0, 'The entire list is validated before any execution');
    options.set('leave-list', { CustomCss: encodeBoth(`${firstUrl}\n${secondUrl}`, 'window.inlineAfterNavigation = true;') });
    const firstRequest = ordered.waitForRequest(firstUrl);
    await ordered.goto(`${base}/#/login?serverid=leave-list`);
    await firstRequest;
    await ordered.evaluate(() => window.navigate('/dashboard/branding?serverid=leave-list'));
    await ordered.waitForTimeout(400);
    assert.equal(await ordered.locator('script[data-finweb-custom-js]').count(), 1, 'Navigation to management does not start the remaining files');
    assert.equal(await ordered.evaluate(() => window.inlineAfterNavigation), undefined);
    await ordered.close();

    options.set('missing', { CustomCss: encodeUrl(externalUrl.replace('background.js', 'missing.js')) });
    const missing = await browser.newPage();
    await missing.goto(`${base}/#/login?serverid=missing`);
    await missing.waitForFunction(() => document.querySelector('script[data-finweb-custom-js]')?.dataset.finwebCustomJsStatus === 'error');
    assert.equal(await missing.evaluate(() => window.inactiveCode), undefined);
    await missing.close();
    options.set('blocked', { CustomCss: encodeUrl(externalUrl) });
    const blocked = await browser.newPage();
    await blocked.goto(`${base}/?blockExternal=1#/login?serverid=blocked`);
    await blocked.waitForFunction(() => document.querySelector('script[data-finweb-custom-js]')?.dataset.finwebCustomJsStatus === 'error');
    assert.equal(await blocked.evaluate(() => window.externalRuns), undefined);
    await blocked.close();
    console.log('PASS external classic scripts across origins without CORS, source preservation, disabled URLs, network/CSP failures and reload-free dashboard');

    for (const width of [1440, 390]) {
        await page.goto(`${base}/?finwebSafeMode=1#/home`);
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(await page.locator('.finweb-brand-logo').evaluate(el => el.getBoundingClientRect().width), width < 600 ? 120 : 140);
        await page.evaluate(({ markup, viewportWidth }) => {
            document.documentElement.className = viewportWidth < 600 ? 'layout-mobile' : 'layout-desktop';
            document.getElementById('fixture').innerHTML = markup;
            document.querySelector('.manualLoginForm').classList.remove('hide');
            document.querySelector('.visualLoginForm').classList.add('hide');
        }, { markup: login, viewportWidth: width });
        assert.equal(await page.locator('#loginPage').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
        assert.ok(await page.locator('#loginPage > div').evaluate(el => {
            const rect = el.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= window.innerWidth && el.scrollWidth <= el.clientWidth + 1;
        }), `Login panel fits at ${width}`);
        await page.evaluate(markup => {
            document.getElementById('fixture').innerHTML = markup;
            document.querySelector('.nameContainer').innerHTML = '<h1 class="itemName">Title</h1><h3 class="itemName originalTitle">Subtitle</h3>';
            document.querySelector('.itemMiscInfo-primary').innerHTML = '<span>2026 - Rating 8.0</span>';
            document.querySelector('.itemMiscInfo-primary').classList.remove('hide');
            document.querySelector('.overview').textContent = 'Overview '.repeat(80);
            document.querySelector('.trackSelections').classList.remove('hide');
            document.querySelector('.nextUpSection').classList.remove('hide');
        }, detail);
        assert.equal(await page.locator('.detailSectionContent .itemMiscInfo-primary').count(), 1);
        assert.equal(await page.locator('.itemMiscInfo-primary').evaluate(el => getComputedStyle(el).position), 'static');
        const before = await page.locator('.detailSectionContent').evaluate(el => el.getBoundingClientRect().height);
        const titleBox = await page.locator('.nameContainer').boundingBox();
        const overviewBox = await page.locator('.detailSectionContent').boundingBox();
        assert.ok(titleBox.y + titleBox.height <= overviewBox.y + 1, `Title and overview do not overlap at ${width}px`);
        await page.locator('.overview').evaluate(el => {
            el.textContent = 'Short overview';
        });
        const after = await page.locator('.detailSectionContent').evaluate(el => el.getBoundingClientRect().height);
        assert.ok(after < before, 'Overview panel adapts to its content');
        const boxes = await page.locator('.detailSectionContent, .trackSelections, .nextUpSection').evaluateAll(elements => elements.map(el => ({ cls: el.className, top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom })));
        const overview = boxes.find(b => b.cls === 'detailSectionContent');
        const tracks = boxes.find(b => b.cls.includes('trackSelections'));
        const next = boxes.find(b => b.cls.includes('nextUpSection'));
        assert.ok(tracks.top >= overview.bottom && next.top >= tracks.bottom, 'Detail content order is stable');
        console.log(`PASS ${width}px login transparency, panel bounds and responsive overview metadata; no screenshots`);
    }
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => externalServer.close(resolve));
}
/* eslint-enable compat/compat */
