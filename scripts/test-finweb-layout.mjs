/* eslint-disable compat/compat -- Developer checks run in Node 24 and current Chromium. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { compile } from 'sass';
import postcss from 'postcss';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
for (const relative of ['src/components/toolbar/AppUserMenu.tsx',
    'src/apps/modern/features/libraries/components/SortButton.tsx',
    'src/apps/modern/features/libraries/components/ViewSettingsButton.tsx',
    'src/apps/modern/features/libraries/components/LibraryViewMenu.tsx',
    'src/apps/modern/features/libraries/components/filter/FilterButton.tsx']) {
    assert.match(await readFile(path.join(root, relative), 'utf8'), /<(Menu|Popover)\s+disableScrollLock/, relative);
}
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?
    pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright');
const stubs = {
    'hooks/useLocale': 'export const useLocale=()=>({dateFnsLocale:undefined});',
    'hooks/useApi': 'import {useLocation} from \'react-router-dom\'; export const useApi = () => ({isUserLoading:window.userLoading, user: useLocation().pathname === \'/login\' || window.userLoading || window.userUnavailable ? undefined : {Id:\'user\',Policy:{IsAdministrator:window.isAdmin !== false}}});',
    'hooks/api/useUserViews': 'export const useUserViews = () => ({data:{Items:[{Id:\'movies\',Name:\'Movies\',CollectionType:\'movies\'}, {Id:\'tv\',Name:\'VeryLongLibraryNameWithoutSpacesToCheckWrappingAndOverflow\',CollectionType:\'tvshows\'}, {Id:\'livetv\',Name:\'Live TV\',CollectionType:\'livetv\'}]}});',
    'hooks/useWebConfig': 'export const useWebConfig = () => ({menuLinks:[{name:\'External\',url:\'https://example.com\'}]});',
    'hooks/useSystemInfo': 'export const useSystemInfo = () => ({data:{ServerName:window.serverName || \'Finweb Test Server\',Version:\'12.0.0\'}});',
    'hooks/useThemes': 'export const useThemes = () => ({themes:[{id:\'dark\',name:\'Dark\'}]});',
    'lib/globalize': 'export default {translate: (key,...values) => key === "ListPaging" ? `${values[0]}-${values[1]} / ${values[2]}` : key};',
    'hooks/useUserSettings': 'export const useUserSettings = () => ({libraryPageSize:100});',
    'hooks/useItem': 'export const useItem = () => ({data:undefined});',
    'components/playback/playbackmanager': 'export const playbackManager = {canQueue:()=>false};',
    'components/apphost': 'export const appHost = {supports: feature => !(window.unsupportedFeatures || []).includes(feature), exit: () => { window.lastAction = \'exit\'; }};',
    'utils/dashboard': 'export default {selectServer: () => {window.lastAction = \'selectServer\';}, logout: () => {window.lastAction = \'logout\';}};',
    'components/router/appRouter': 'export const PUBLIC_PATHS = [\'/login\']; export const appRouter = {canGoBack:()=>false,getRouteUrl: item => item.CollectionType === \'livetv\' ? \'#/livetv?collectionType=livetv\' : \'#/movies?topParentId=\'+item.Id};',
    'scripts/settings/userSettings': 'export const get = () => undefined; export const enableBlurhash = () => true;'
};
const suffixStubs = {
    '/HelpButton': 'export default ()=>null;',
    '/components/AppTabs': 'import React from "react";export default ()=> <div data-testid="dashboard-tabs">Dashboard tabs</div>;',
    '/hooks/useLibrary': 'export {LibraryProvider,useLibrary} from "fixture-library";',
    '/hooks/useScreensavers': 'export const useScreensavers = () => ({screensavers:[{id:\'none\',name:\'None\'}]});',
    '/api/useAncestors': 'export const useAncestors = ({itemId}) => ({data:itemId ? [{Type:\'CollectionFolder\',Id:\'movies\'}] : []});',
    '/PlayAllButton': 'import React from \'react\'; import Button from \'@mui/material/Button\'; export default ({isTextVisible})=><Button aria-label=\'PlayAll\'>{isTextVisible?\'Play all\':\'P\'}</Button>;',
    '/ShuffleButton': 'export default () => null;',
    '/QueueButton': 'export default () => null;',
    '/NewCollectionButton': 'export default () => null;',
    '/NewPlaylistButton': 'export default () => null;',
    '/filter/FilterButton': 'import React from \'react\';import Popup from \'fixture-popup\';export default ()=><Popup label=\'ABC\'/>;',
    '/ViewSettingsButton': 'export default () => null;',
    '/ThemeCss': 'export default () => null;',
    '/CustomCss': 'export default () => null;',
    '/viewContainer': 'export default {reset:()=>{}};',
    '/browser': 'export default {iOS:false};',
    '/UserViewNav': 'import React from \'react\'; export default () => <div data-testid=\'top-navigation\'>Libraries</div>;',
    '/ServerButton': 'import React from \'react\'; export default () => <button>Server</button>;',
    '/UserMenuButton': 'import React from \'react\'; import Popup from \'fixture-popup\'; export default () => <Popup label="Profile"/>;',
    '/SearchButton': 'import React from \'react\'; import IconButton from \'@mui/material/IconButton\'; export default () => <IconButton size="large" aria-label=\'Search\'>S</IconButton>;',
    '/SyncPlayButton': 'import React from \'react\'; import IconButton from \'@mui/material/IconButton\'; export default () => <IconButton size="large" aria-label=\'SyncPlay\'>G</IconButton>;',
    '/RemotePlayButton': 'import React from \'react\'; import IconButton from \'@mui/material/IconButton\'; export default () => <IconButton size="large" aria-label=\'RemotePlay\'>R</IconButton>;',
    '/sections/ServerDrawerSection': 'export default () => null;',
    '/sections/DevicesDrawerSection': 'export default () => null;',
    '/sections/LiveTvDrawerSection': 'export default () => null;',
    '/sections/AdvancedDrawerSection': 'export default () => null;',
    '/sections/PluginDrawerSection': 'export default () => null;'
};
stubs['fixture-popup'] = `import React, {useState} from 'react';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
export default function Popup({label}) {
 const [anchor, setAnchor] = useState(null);
 return <><button aria-label={label} onClick={event=>setAnchor(event.currentTarget)}>{label}</button>
 <Menu disableScrollLock={!window.fixtureLockScroll} anchorEl={anchor} open={Boolean(anchor)} onClose={()=>setAnchor(null)}><MenuItem>Fixture option</MenuItem></Menu></>;
}`;
stubs['fixture-library'] = `import React,{createContext,useContext,useState} from 'react';import {useLocation} from 'react-router-dom';
const Context=createContext({});
export const useLibrary=()=>useContext(Context);
export function LibraryProvider({children}) {const [viewSettings,setViewSettings]=useState({StartIndex:0,SortBy:['SortName'],SortOrder:'Ascending'});
const [result,setResult]=useState({data:{TotalRecordCount:600},isPending:false});
window.setLibraryResult=setResult;window.librarySettings=viewSettings;
return <Context.Provider value={{isLibraryPath:useLocation().pathname==='/movies',content:{viewType:'movies',isPaginationEnabled:true,isBtnSortEnabled:true,isBtnFilterEnabled:true,isBtnPlayAllEnabled:true},itemsResult:result,viewSettings,setViewSettings}}>{children}</Context.Provider>; }`;
const bundle = await build({
    absWorkingDir: root, bundle: true, write: false, format: 'iife',
    loader: { '.png': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', __FINWEB_VERSION__:JSON.stringify(metadata.finwebVersion), __JF_BUILD_VERSION__:'"fixture"' },
    plugins: [{ name: 'fixture-services', setup(builder) {
        builder.onResolve({ filter: /.*/ }, args => {
            if (args.path === './routes/routes' && /dashboard[\\/]AppLayout\.tsx$/.test(args.importer)) {
                return { path: 'fixture-dashboard-paths', namespace: 'fixture', pluginData: 'export const DASHBOARD_APP_PATHS={Dashboard:"dashboard",MetadataManager:"metadata",PluginConfig:"configurationpage"};' };
            }
            const stub = stubs[args.path] ?? Object.entries(suffixStubs).find(([suffix]) => args.path.endsWith(suffix))?.[1];
            if (stub) return { path: args.path, namespace: 'fixture', pluginData: stub };
            if (args.path.endsWith('.scss')) return { path: args.path, namespace: 'fixture', pluginData: '' };
        });
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.pluginData, loader: 'tsx', resolveDir: root }));
    } }],
    stdin: { resolveDir: root, loader: 'tsx', contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeProvider,useColorScheme} from '@mui/material/styles';
import {finwebTheme as theme} from './src/themes';
import {createMemoryRouter,RouterProvider,useLocation} from 'react-router-dom';
import {Component as AppLayout} from './src/apps/modern/AppLayout';
import {Component as DashboardLayout} from './src/apps/dashboard/AppLayout';
import AlphabetPicker from './src/apps/modern/features/libraries/components/AlphabetPicker';
import LibraryPaginationFooter from './src/apps/modern/features/libraries/components/LibraryPaginationFooter';
import ContentLoadingBoundary from './src/components/loading/ContentLoadingBoundary';
import Image from './src/components/common/Image';
import ServerInfoWidget from './src/apps/dashboard/components/widgets/ServerInfoWidget';
import {DisplayPreferences} from './src/apps/modern/features/preferences/components/DisplayPreferences';
const values = {layout:'auto',theme:'dark',customCss:'saved',dashboardTheme:'dark',disableCustomCss:false,
 screensaver:'none',screensaverTime:300,backdropScreensaverInterval:30,slideshowInterval:5,enableBlurHash:false,enableFasterAnimation:false};
function Content(){const {pathname}=useLocation();const [state,setState]=React.useState({pending:true,key:'initial',delay:0});window.setLoadingFixture=setState;
return <div className='page mainAnimatedPage libraryPage' data-testid='page' data-path={pathname}>
 {pathname === '/mypreferencesdisplay' ? <DisplayPreferences values={values} onChange={()=>{}}/> : pathname}
 {pathname === '/movies' && <div className='padded-bottom-page'><AlphabetPicker onChange={()=>{}}/><div style={{height:1000}}/><LibraryPaginationFooter/></div>}
 {pathname === '/server-info' && <ServerInfoWidget/>}
 {pathname === '/loading' && <ContentLoadingBoundary loading={state.pending} retainContent={state.retain} progressive={state.progressive}>
 <div style={{height:state.offscreen?2000:0}}/>
 <div data-testid='poster-card' style={{position:'relative',width:150,height:150}}>
 <Image key={state.instance} imgUrl={'/poster?key='+state.key+'&delay='+state.delay+'&error='+Boolean(state.error)} blurhash={state.hash} containImage={false}/>
 </div><button onClick={()=>window.posterAction=true}>Poster action</button>
 </ContentLoadingBoundary>}
</div>;}
const router = createMemoryRouter([{path:'/dashboard',element:<DashboardLayout/>},
 {path:'/slow-home',loader:()=>new Promise(resolve=>setTimeout(()=>resolve(null),600)),element:<AppLayout/>,children:[{index:true,element:<Content/>}]},
 {path:'*',element:<AppLayout/>,children:[{path:'*',element:<Content/>}]}],{initialEntries:['/home']});
window.navigate = path => router.navigate(path);
window.actions = [];
function Fixture(){const {setColorScheme} = useColorScheme(); window.setFixtureTheme = setColorScheme;
 return <RouterProvider router={router}/>;}
createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><Fixture/></ThemeProvider>);
` }
});
let css = '';
for (const relative of ['src/styles/site.scss', 'src/styles/librarybrowser.scss', 'src/elements/emby-button/emby-button.scss', 'src/components/cardbuilder/card.scss', 'src/plugins/htmlVideoPlayer/style.scss', 'src/apps/modern/AppOverrides.scss', 'src/components/common/Image.scss', 'src/components/alphaPicker/style.scss', 'src/components/viewManager/viewContainer.scss', 'src/components/appFooter/appFooter.scss', 'src/styles/finweb.scss']) {
    css += compile(path.join(root, relative), { loadPaths:[path.join(root, 'src/styles')] }).css;
}
let legacyCss = `
.MuiAppBar-root.MuiAppBar-positionFixed{padding:10px!important}
.layout-desktop .libraryPage:not(#editItemMetadataPage){margin-left:250px!important}
.layout-desktop .appfooter{margin-left:250px!important}
.MuiList-root:not(.MuiList-subheader) .MuiListItemButton-root.MuiListItemButton-gutters{padding:20px 38px 10px 38px!important}
.navMenuOption,.navMenuOption:hover,.navMenuOption-selected{border-radius:100px!important;width:85%!important;margin:auto!important;height:45px!important;text-align:center!important}
.navMenuOptionIcon,.navMenuOptionText{position:inherit!important;left:-10%!important;margin-top:0!important}
`;
const themeCss = Object.fromEntries(['dark', 'light'].map(mode => [mode,
    compile(path.join(root, `src/themes/${mode}/theme.scss`)).css]));
if (process.env.FINWEB_LEGACY_CSS_URL) {
    const response = await fetch(process.env.FINWEB_LEGACY_CSS_URL);
    assert.equal(response.ok, true);
    const rules = [];
    postcss.parse(await response.text()).walkRules(rule => {
        if (rule.parent.type === 'root' && /:root|navMenu|sidebarHeader|libraryPage|mainDrawer|quickConnectSettingsContainer|MuiDrawer|MuiList|MuiAppBar|appfooter/.test(rule.selector)) rules.push(rule.toString());
    });
    assert.ok(rules.length > 10);
    legacyCss = rules.join('\n');
}
const html = `<!doctype html><html class="layout-desktop" data-finweb-theme dir="ltr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body,#root{height:100%;margin:0}body{font-family:Arial,sans-serif}.appfooter{height:40px}
${css}</style><style id="theme-css">${themeCss.dark}</style><style id="legacy-css">${legacyCss}</style></head><body><div id="root"></div><div class="appfooter">Now playing</div><script src="/fixture.js"></script></body></html>`;
const posterRequests = new Map();
const server = createServer((req, res) => {
    if (req.url.startsWith('/poster')) {
        posterRequests.set(req.url, (posterRequests.get(req.url) || 0) + 1);
        const params = new URL(req.url, 'http://localhost').searchParams;
        if (params.get('key') === 'cached') res.setHeader('Cache-Control', 'public, max-age=3600');
        setTimeout(async () => {
            if (params.get('error') === 'true') {
                res.writeHead(404);
                res.end();
                return;
            }
            res.setHeader('Content-Type', 'image/png');
            res.end(await readFile(path.join(root, 'node_modules/@jellyfin/ux-web/icon-transparent.png')));
        }, Number(params.get('delay')));
        return;
    }
    res.setHeader('Content-Type', req.url === '/fixture.js' ? 'text/javascript' : 'text/html');
    res.end(req.url === '/fixture.js' ? bundle.outputFiles[0].contents : html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const navigate = async destination => {
        await page.evaluate(target => window.navigate(target), destination);
        await page.waitForFunction(target => document.querySelector('[data-testid="page"]')?.getAttribute('data-path') === target.split('?')[0]
            || target === '/mypreferencesdisplay' || target === '/dashboard', destination);
    };
    // Inspect every rendered transition frame, not just the settled layout.
    for (const width of [390, 900, 1280, 1920]) {
        await page.setViewportSize({ width, height:900 });
        for (const custom of [false, true]) {
            await page.evaluate(enabled => {
                document.querySelector('#legacy-css').disabled = !enabled;
            }, custom);
            await navigate('/home');
            assert.equal(await page.locator('.finweb-appbar-content').evaluate(el => getComputedStyle(el).paddingTop), width < 600 ? '8px' : '12px');
            if (width >= 900) {
                assert.equal(await page.locator('.finweb-drawer .sidebarHeader').first().evaluate(el => getComputedStyle(el).paddingTop), '14px');
            }
            await page.evaluate(() => window.setLibraryResult({ data:{ TotalRecordCount:600 }, isPending:true }));
            const frames = await page.evaluate(async () => {
                const samples = [];
                const start = performance.now();
                let replaced = false;
                window.navigate('/movies?topParentId=movies');
                while (performance.now() - start < 650 || samples.length < 12) {
                    await new Promise(requestAnimationFrame);
                    const content = document.querySelector('[data-testid="page"]');
                    if (content?.getAttribute('data-path') !== '/movies') continue;
                    const header = document.querySelector('header').getBoundingClientRect();
                    const body = content.getBoundingClientRect();
                    samples.push({ top:body.top, header:header.bottom });
                    if (!replaced && performance.now() - start > 150) {
                        replaced = true;
                        window.setLibraryResult({ data:{ TotalRecordCount:1234567 }, isPending:false });
                    }
                }
                return samples;
            });
            assert.ok(frames.length > 1);
            for (const frame of frames) assert.ok(Math.abs(frame.top - frame.header) <= 1, `${width}/${custom}: first-row overlap ${JSON.stringify(frame)}`);
            assert.ok(Math.max(...frames.map(frame=>frame.top)) - Math.min(...frames.map(frame=>frame.top)) <= 1, `${width}/${custom}: data changes must not move the first row`);
        }
    }
    await page.setViewportSize({ width:1280, height:900 });
    await page.evaluate(() => {
        window.userLoading = true;
    });
    await navigate('/home');
    assert.equal(await page.locator('[data-testid="top-navigation"]').count(), 0, 'No legacy top navigation during user loading');
    assert.equal((await page.locator('[data-testid="page"]').boundingBox()).x, 250, 'Reserve sidebar space during user loading');
    await page.evaluate(() => {
        window.userLoading = false;
    });
    await navigate('/home?ready=1');
    for (const width of [390, 900, 1280]) {
        const startup = await browser.newPage({ viewport: { width, height: 900 } });
        startup.on('pageerror', error => errors.push(error.message));
        await startup.addInitScript(() => {
            window.userLoading = true;
        });
        await startup.goto(`http://127.0.0.1:${server.address().port}`);
        await startup.locator('[data-testid="page"]').waitFor();
        for (const route of ['/home', '/movies']) {
            await startup.evaluate(destination => {
                window.userLoading = true;
                window.userUnavailable = false;
                return window.navigate(destination);
            }, route);
            await startup.waitForTimeout(100);
            assert.equal(await startup.locator('.finweb-header-actions, .finweb-drawer').count(), 0, 'No group background or drawer while user information loads');
            assert.equal(await startup.getByRole('button', { name: /^(Search|SyncPlay|RemotePlay|Profile)$/ }).count(), 0, 'No early actions or focusable invisible buttons');
            const before = await startup.locator('[data-testid="page"]').boundingBox();
            assert.equal(before.x, width >= 900 ? 250 : 0, 'Sidebar space is reserved independently of readiness');
            const frames = await startup.evaluate(async destination => {
                const samples = [];
                window.userLoading = false;
                await window.navigate(destination + '?ready=1');
                for (let frame = 0; frame < 12; frame++) {
                    await new Promise(requestAnimationFrame);
                    samples.push({
                        top: document.querySelector('[data-testid="page"]').getBoundingClientRect().top,
                        actions: Boolean(document.querySelector('.finweb-header-actions')),
                        drawer: Boolean(document.querySelector('.finweb-drawer'))
                    });
                }
                return samples;
            }, route);
            for (const frame of frames) {
                assert.ok(Math.abs(frame.top - before.y) <= 1, `User readiness must not shift ${width}px ${route}: ${JSON.stringify(frame)}`);
                if (width >= 900) assert.equal(frame.actions, frame.drawer, 'Desktop drawer and actions appear in the same frame');
            }
            assert.equal(await startup.locator('.finweb-header-actions').isVisible(), true);
            for (const label of ['Search', 'RemotePlay', 'Profile']) assert.equal(await startup.getByLabel(label).isVisible(), true);
        }
        await startup.evaluate(() => {
            window.userUnavailable = true;
            return window.navigate('/home?unauthenticated=1');
        });
        assert.equal(await startup.locator('.finweb-header-actions').count(), 0, 'Failed user lookup cannot expose authenticated actions');
        await startup.evaluate(() => window.navigate('/login'));
        assert.equal(await startup.locator('.finweb-brand-logo').isVisible(), true, 'Public login logo remains visible');
        assert.equal(await startup.locator('.finweb-header-actions').count(), 0);
        await startup.close();
    }
    await page.evaluate(() => window.setLibraryResult({ data:{ TotalRecordCount:600 }, isPending:false }));
    for (const width of [900, 1280, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        await navigate('/home');
        await page.waitForFunction(() => document.body.classList.contains('finweb-sidebar-visible'));
        const geometry = await page.evaluate(() => {
            const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
            return { drawer:rect('.MuiDrawer-paper'), header:rect('header'), content:rect('[data-testid="page"]'), footer:rect('.appfooter'),
                overflow:document.querySelector('.MuiDrawer-paper').scrollWidth > 250 };
        });
        assert.equal(geometry.drawer.width, 250);
        assert.equal(geometry.drawer.top, 0, 'Header padding must not move the sidebar');
        for (const part of ['header', 'content', 'footer']) {
            assert.equal(geometry[part].x, 250, `${width}: ${part} left`);
            assert.equal(geometry[part].width, width - 250, `${width}: ${part} width`);
        }
        assert.ok(geometry.content.y >= geometry.header.bottom);
        assert.equal(geometry.overflow, false);
        assert.equal(await page.getByLabel('MenuOpen').count(), 0);
        assert.equal(await page.locator('[data-testid="top-navigation"]').count(), 0);
        for (const label of ['Search', 'Profile', 'RemotePlay']) assert.equal(await page.getByLabel(label).isVisible(), true);
        await page.waitForFunction(() => [...document.querySelectorAll('.MuiDrawer-paper img')].every(img => img.complete && img.naturalWidth > 0));
        assert.equal(await page.locator('a.navMenuOption-selected').count(), 0);
        assert.deepEqual(await page.locator('.finweb-navigation h3').allTextContents(), ['HeaderMedia', 'HeaderAdmin', 'HeaderUser']);
        assert.equal(await page.locator('.finweb-navigation hr').count(), 0);
        assert.equal(await page.locator('.finweb-navigation').getByText('Favorites', { exact:true }).count(), 1);
        assert.deepEqual((await page.locator('.finweb-navigation > .navMenuOption').allTextContents()).slice(0, 2), ['Home', 'Favorites']);
        assert.equal(await page.locator('.finweb-drawer-brand').innerText(), '');
        assert.equal(await page.locator('.finweb-drawer-brand img').getAttribute('alt'), 'Jellyfin');
        const rows = await page.locator('.navMenuOption').evaluateAll(elements => elements.map(el => ({
            box:el.getBoundingClientRect().toJSON(), scrollWidth:el.scrollWidth, clientWidth:el.clientWidth
        })));
        for (let index = 0; index < rows.length; index++) {
            assert.ok(rows[index].scrollWidth <= rows[index].clientWidth, 'Menu text fits its row');
            if (index) assert.ok(rows[index].box.top >= rows[index - 1].box.bottom, 'Menu rows do not overlap');
        }
    }
    await navigate('/home?tab=1');
    await page.waitForFunction(() => document.querySelector('a.navMenuOption-selected')?.textContent === 'Favorites');
    assert.equal(await page.locator('.finweb-drawer-brand').evaluate(el => el.tagName === 'DIV' && el.tabIndex === -1 && !el.closest('a')), true);
    await page.locator('.finweb-drawer-brand').click();
    assert.equal(await page.locator('a.navMenuOption-selected').innerText(), 'Favorites', 'Brand click must not navigate');
    await page.getByRole('link', { name:'Home', exact:true }).last().click();
    assert.equal(await page.locator('a.navMenuOption-selected').count(), 0);
    await navigate('/movies?topParentId=movies');
    await page.waitForFunction(() => document.querySelector('a.navMenuOption-selected')?.textContent === 'Movies');
    assert.equal(await page.locator('.finweb-library-toolbar').isVisible(), true);
    await navigate('/details?id=episode');
    await page.waitForFunction(() => document.querySelector('a.navMenuOption-selected')?.textContent === 'Movies');
    await navigate('/livetv?collectionType=livetv');
    await page.waitForFunction(() => document.querySelector('a.navMenuOption-selected')?.textContent === 'Live TV');
    await page.getByRole('link', { name:'Guide', exact:true }).click();
    await page.waitForFunction(() => document.querySelector('a.navMenuOption-selected')?.textContent === 'Guide');
    for (const [label, action] of [['SelectServer', 'selectServer'], ['ButtonSignOut', 'logout'], ['ButtonExitApp', 'exit']]) {
        await page.getByRole('button', { name:label, exact:true }).click();
        assert.equal(await page.evaluate(() => window.lastAction), action);
    }
    assert.equal(await page.getByRole('link', { name:'MetadataManager', exact:true }).getAttribute('href'), '/metadata');
    await page.evaluate(() => {
        window.isAdmin = false;
        window.unsupportedFeatures = ['multiserver', 'exitmenu'];
    });
    await navigate('/home');
    assert.equal(await page.locator('#finweb-admin-heading').count(), 0);
    assert.equal(await page.getByRole('link', { name:'TabDashboard', exact:true }).count(), 0);
    assert.equal(await page.getByRole('button', { name:'SelectServer', exact:true }).count(), 0);
    assert.equal(await page.getByRole('button', { name:'ButtonExitApp', exact:true }).count(), 0);
    await page.evaluate(() => {
        window.isAdmin = true;
        window.unsupportedFeatures = [];
    });
    for (const destination of ['/video', '/login']) {
        await navigate(destination);
        assert.equal(await page.locator('.finweb-drawer').count(), 0);
        assert.equal((await page.locator('[data-testid="page"]').boundingBox()).x, 0);
        if (destination === '/video') await page.waitForFunction(() => document.querySelector('header').getBoundingClientRect().height === 0);
        assert.equal(await page.evaluate(() => document.body.classList.contains('finweb-sidebar-visible')), false);
    }
    for (const width of [360, 390, 899]) {
        await page.setViewportSize({ width, height: width === 360 ? 480 : 844 });
        await navigate('/home');
        await page.getByLabel('MenuOpen').click();
        await page.locator('.MuiDrawer-paper').waitFor({ state: 'visible' });
        await page.locator('.MuiDrawer-paper a').filter({ hasText:'Settings' }).click();
        await page.getByLabel('MenuOpen').waitFor();
        assert.equal((await page.locator('[data-testid="page"]').boundingBox()).x, 0);
        assert.equal((await page.locator('.appfooter').boundingBox()).x, 0);
        await page.getByLabel('MenuOpen').click();
        await page.getByRole('button', { name:'ButtonSignOut', exact:true }).scrollIntoViewIfNeeded();
        await page.getByRole('button', { name:'ButtonSignOut', exact:true }).click();
        await page.getByLabel('MenuOpen').waitFor();
        assert.equal(await page.evaluate(() => window.lastAction), 'logout');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    }
    await navigate('/mypreferencesdisplay');
    await page.locator('[name="theme"]').waitFor({ state:'attached' });
    assert.equal(await page.locator('[name="theme"]').count(), 1);
    for (const name of ['customCss', 'disableCustomCss', 'dashboardTheme', 'screensaver', 'screensaverTime',
        'backdropScreensaverInterval', 'slideshowInterval', 'enableFasterAnimation', 'enableBlurHash']) {
        assert.equal(await page.locator(`[name="${name}"]`).count(), 0, name);
    }
    await page.setViewportSize({ width:1280, height:900 });
    await navigate('/movies?topParentId=movies');
    for (const mode of ['dark', 'light']) {
        for (const customCss of [false, true]) {
            await page.evaluate(({ theme, styles, custom }) => {
                document.querySelector('#theme-css').textContent = styles;
                document.querySelector('#legacy-css').disabled = !custom;
                window.setFixtureTheme(theme);
            }, { theme:mode, styles:themeCss[mode], custom:customCss });
            await page.waitForTimeout(300);
            const contrast = await page.locator('.navMenuOption-selected').evaluate(el => {
                const rgb = value => value.match(/[\d.]+/g).map(Number);
                const background = rgb(getComputedStyle(el).backgroundColor);
                const paper = rgb(getComputedStyle(el.closest('.MuiDrawer-paper')).backgroundColor);
                const alpha = background[3] ?? 1;
                const blended = background.slice(0, 3).map((v, i) => v * alpha + paper[i] * (1 - alpha));
                const luminance = color => color.slice(0, 3).map(v => {
                    const s = v / 255;
                    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
                }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
                const text = luminance(rgb(getComputedStyle(el).color));
                const bg = luminance(blended);
                return { ratio:(Math.max(text, bg) + 0.05) / (Math.min(text, bg) + 0.05),
                    text:getComputedStyle(el).color, background, paper };
            });
            assert.ok(contrast.ratio >= 4.5, `${mode}, custom CSS ${customCss}: ${JSON.stringify(contrast)}`);
            const surfaces = await page.evaluate(() => {
                const actions = document.querySelector('.finweb-header-actions');
                const toolbar = document.querySelector('.finweb-library-actions');
                const summary = document.querySelector('.finweb-library-summary');
                const style = element => ({ background:getComputedStyle(element).backgroundColor, color:getComputedStyle(element).color });
                return { actions:style(actions), toolbar:style(toolbar), summary:style(summary), row:style(document.querySelector('.finweb-library-toolbar')), width:actions.getBoundingClientRect().width,
                    headerWidth:document.querySelector('header').getBoundingClientRect().width };
            });
            for (const surface of [surfaces.actions, surfaces.toolbar, surfaces.summary]) {
                assert.notEqual(surface.background, 'rgba(0, 0, 0, 0)', 'Controls have their own background');
                assert.notEqual(surface.background, surface.color);
            }
            assert.ok(surfaces.width < surfaces.headerWidth / 2, 'Background stays around the right-hand controls');
            assert.equal(surfaces.row.background, 'rgba(0, 0, 0, 0)', 'The space between the two library groups stays transparent');
        }
    }
    for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height:900 });
        await page.waitForTimeout(300);
        for (const customCss of [false, true]) {
            await page.evaluate(enabled => {
                document.querySelector('#legacy-css').disabled = !enabled;
            }, customCss);
            for (const scrollbar of [false, true]) {
                // Emulate classic Windows scrollbars even with Chromium's overlay-scrollbar defaults.
                const scrollStyle = await page.addStyleTag({ content: scrollbar ?
                    'html{overflow-y:scroll!important;scrollbar-width:auto!important;scrollbar-gutter:stable}html::-webkit-scrollbar{display:block!important;width:15px!important}html[style*="overflow: hidden"]{overflow-y:hidden!important;scrollbar-gutter:auto}body{height:2000px!important}' :
                    'html{overflow-y:hidden!important}body{height:100%!important}' });
                if (scrollbar) {
                    await page.evaluate(() => {
                    // Headless overlay scrollbars reserve the gutter but exclude it from clientWidth.
                    // Expose classic-scrollbar metrics to the unmodified MUI ModalManager.
                        Object.defineProperty(document.documentElement, 'clientWidth', {
                            configurable:true,
                            get() { return Math.round(this.getBoundingClientRect().width); }
                        });
                    });
                }
                const gutter = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);
                assert.equal(gutter > 0, scrollbar, JSON.stringify(await page.evaluate(() => ({
                    html:document.documentElement.getAttribute('style'), body:document.body.getAttribute('style'),
                    overflow:getComputedStyle(document.documentElement).overflowY,
                    gutter:getComputedStyle(document.documentElement).scrollbarGutter,
                    scrollbar:getComputedStyle(document.documentElement).scrollbarWidth, width:window.innerWidth,
                    client:document.documentElement.clientWidth
                }))));
                for (const label of ['Profile', 'Sort', 'ABC']) {
                    const before = await page.getByLabel('Profile', { exact:true }).boundingBox();
                    const alphabetBefore = await page.locator('.alphaPicker-fixed-right').boundingBox();
                    await (label === 'Sort' ? page.getByTitle('Sort', { exact:true }) : page.getByLabel(label, { exact:true })).click();
                    await page.getByRole('menu').waitFor();
                    const alphabetDuring = await page.locator('.alphaPicker-fixed-right').boundingBox();
                    assert.ok(Math.abs(alphabetDuring.x - alphabetBefore.x) <= 1, `${label}: alphabet shifted`);
                    assert.equal(await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth), gutter, 'Popup keeps scrollbar visible');
                    const during = await page.getByLabel('Profile', { exact:true }).boundingBox();
                    assert.ok(Math.abs(during.x - before.x) <= 1, `${width}/${customCss}/${scrollbar}/${label}: open shifted ${during.x - before.x}`);
                    await page.keyboard.press('Escape');
                    await page.getByRole('menu').waitFor({ state:'hidden' });
                    const after = await page.getByLabel('Profile', { exact:true }).boundingBox();
                    assert.ok(Math.abs(after.x - before.x) <= 1, `${label}: close shifted`);
                }
                if (width === 1280 && customCss && scrollbar) {
                    await page.evaluate(() => {
                        window.fixtureLockScroll = true;
                    });
                    await page.getByLabel('Profile', { exact:true }).click();
                    await page.getByRole('menu').waitFor();
                    assert.equal(await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth), 0, 'Negative control: default MUI menu removes the scrollbar');
                    await page.keyboard.press('Escape');
                    await page.getByRole('menu').waitFor({ state:'hidden' });
                    await page.evaluate(() => {
                        window.fixtureLockScroll = false;
                    });
                }
                await scrollStyle.evaluate(el => el.remove());
                if (scrollbar) {
                    await page.evaluate(() => {
                        delete document.documentElement.clientWidth;
                    });
                }
            }
        }
    }
    const headerSnippet = await page.addStyleTag({ content: `
:root { --primary-background-transparent: rgba(35, 35, 35, 0.5); --blur: 10px; }
.finweb-layout .finweb-header-actions,
.finweb-layout .finweb-library-summary,
.finweb-layout .finweb-library-actions {
    background: var(--primary-background-transparent, rgba(35, 35, 35, 0.5)) !important;
    color: #fff !important;
    border-radius: 50px !important;
    -webkit-backdrop-filter: blur(var(--blur, 10px)) !important;
    backdrop-filter: blur(var(--blur, 10px)) !important;
}
.finweb-layout .finweb-library-summary .MuiChip-root {
    color: inherit !important;
}` });
    const beforeSnippet = await page.locator('[data-testid="page"]').boundingBox();
    for (const selector of ['.finweb-header-actions', '.finweb-library-summary', '.finweb-library-actions']) {
        const style = await page.locator(selector).evaluate(element => {
            const computed = getComputedStyle(element);
            return { background:computed.backgroundColor, color:computed.color, radius:computed.borderRadius, blur:computed.backdropFilter };
        });
        assert.equal(style.background, 'rgba(35, 35, 35, 0.5)');
        assert.equal(style.color, 'rgb(255, 255, 255)');
        assert.equal(style.radius, '50px');
        assert.equal(style.blur, 'blur(10px)');
    }
    assert.equal(await page.locator('.finweb-library-summary .MuiChip-root').evaluate(element => getComputedStyle(element).color), 'rgb(255, 255, 255)');
    await headerSnippet.evaluate(element => element.remove());
    assert.deepEqual(await page.locator('[data-testid="page"]').boundingBox(), beforeSnippet, 'The supplied header CSS does not change page geometry');
    await page.setViewportSize({ width:1280, height:900 });
    await navigate('/movies?topParentId=movies');
    const footer = page.locator('.finweb-pagination-footer');
    await footer.evaluate(element => element.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(400);
    await footer.getByTitle('Next', { exact:true }).click();
    assert.equal(await page.evaluate(() => window.librarySettings.StartIndex), 100);
    assert.ok((await footer.innerText()).includes('101-200 / 600'));
    await page.evaluate(() => window.setLibraryResult({ data:{ TotalRecordCount:150 }, isPending:false }));
    await page.waitForFunction(() => document.querySelector('.finweb-pagination-footer')?.textContent.includes('101-150 / 150'));
    assert.equal(await footer.getByTitle('Next', { exact:true }).isDisabled(), true);
    await footer.getByTitle('Previous', { exact:true }).click();
    assert.equal(await page.evaluate(() => window.librarySettings.StartIndex), 0);
    await page.evaluate(() => window.setLibraryResult({ data:{ TotalRecordCount:0 }, isPending:false }));
    await footer.waitFor({ state:'detached' });
    await page.evaluate(() => window.setLibraryResult({ data:{ TotalRecordCount:600 }, isPending:true }));
    assert.equal(await footer.getByTitle('Next', { exact:true }).isDisabled(), true);

    await page.evaluate(() => {
        window.scrollTo(0, 200);
        document.querySelector('#legacy-css').disabled = true;
    });
    await page.waitForTimeout(300);
    assert.deepEqual(await page.locator('header').evaluate(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).boxShadow]), ['rgba(0, 0, 0, 0)', 'none']);
    const selectedStyle = await page.locator('.navMenuOption-selected').evaluate(el => ({
        background:getComputedStyle(el).backgroundColor,
        foreground:getComputedStyle(el).color,
        transition:getComputedStyle(el).transitionProperty,
        duration:getComputedStyle(el).transitionDuration
    }));
    assert.equal(selectedStyle.background, 'rgb(38, 38, 38)', 'Built-in square theme uses a neutral selected row with a blue marker');
    assert.notEqual(selectedStyle.foreground, selectedStyle.background);
    assert.ok(selectedStyle.transition.includes('background-color') && selectedStyle.duration.includes('0.12s'));
    await page.evaluate(() => {
        const player = document.createElement('div');
        player.className = 'videoPlayerContainer videoPlayerContainer-onTop';
        document.body.prepend(player);
    });
    await page.waitForFunction(() => document.body.classList.contains('finweb-video-presentation'));
    for (const selector of ['.finweb-header-actions', '.alphaPicker-fixed-right', '.finweb-drawer-brand']) {
        assert.equal(await page.locator(selector).evaluate(el => el.checkVisibility({ checkOpacity: true })), false);
    }
    assert.equal(await page.locator('.finweb-layout').evaluate(el => el.hasAttribute('inert')), true);
    await page.evaluate(() => document.querySelector('.videoPlayerContainer').classList.remove('videoPlayerContainer-onTop'));
    await page.waitForFunction(() => !document.querySelector('.finweb-layout').hasAttribute('inert'));
    await page.evaluate(() => document.querySelector('.videoPlayerContainer').classList.add('videoPlayerContainer-onTop'));
    await page.waitForFunction(() => document.querySelector('.finweb-layout').hasAttribute('inert'));
    await page.evaluate(() => document.querySelector('.videoPlayerContainer').remove());
    await page.waitForFunction(() => !document.querySelector('.finweb-layout').hasAttribute('inert'));

    for (const route of ['/home', '/details', '/movies']) {
        await navigate(route);
        await page.evaluate(() => {
            const probes = document.createElement('div');
            probes.id = 'presentation-probes';
            probes.innerHTML = '<button class="emby-button">Play</button><button class="paper-icon-button-light cardOverlayButton-hover">Favorite</button><button class="paper-icon-button-light emby-scrollbuttons-button">Next</button>';
            document.querySelector('.finweb-layout main').append(probes);
        });
        await page.waitForTimeout(250);
        const frames = await page.evaluate(async () => {
            const layout = document.querySelector('.finweb-layout');
            const originalWidth = layout.getBoundingClientRect().width;
            const probes = [...document.querySelectorAll('#presentation-probes button')];
            const player = document.createElement('div');
            player.className = 'videoPlayerContainer videoPlayerContainer-onTop';
            player.style.animation = 'htmlvideoplayer-zoomin 240ms ease-in normal';
            document.body.prepend(player);
            const result = [];
            await new Promise(resolve => {
                const start = performance.now();
                const sample = () => {
                    result.push({
                        visible: probes.some(el => el.checkVisibility({ checkOpacity: true })),
                        inert: layout.hasAttribute('inert'),
                        widthStable: layout.getBoundingClientRect().width === originalWidth,
                        transitionPreserved: probes.every(el => getComputedStyle(el).transitionProperty === 'all'),
                        playerWidth: player.getBoundingClientRect().width
                    });
                    if (performance.now() - start < 300) window.requestAnimationFrame(sample);
                    else resolve();
                };
                window.requestAnimationFrame(sample);
            });
            probes[0].focus();
            const focusBlocked = document.activeElement !== probes[0];
            return { result, focusBlocked };
        });
        assert.ok(frames.result.every(frame => !frame.visible && frame.inert && frame.widthStable && frame.transitionPreserved), `${route}: hide the surface immediately without changing button transitions`);
        assert.ok(frames.result[0].playerWidth < frames.result.at(-1).playerWidth, 'The original player zoom remains active');
        assert.equal(frames.focusBlocked, true);
        await page.evaluate(() => document.querySelector('.videoPlayerContainer').remove());
        await page.waitForFunction(() => !document.querySelector('.finweb-layout').hasAttribute('inert'));
        assert.equal(await page.locator('#presentation-probes button').first().evaluate(el => {
            el.focus();
            return document.activeElement === el && el.checkVisibility({ checkOpacity: true });
        }), true, 'Failed or cancelled presentation restores visibility and focus');
        await page.locator('#presentation-probes').evaluate(el => el.remove());
    }

    await navigate('/login');
    await page.evaluate(() => {
        const login = document.createElement('div');
        login.id = 'loginPage';
        login.textContent = 'Old login view';
        document.querySelector('.mainAnimatedPages').append(login);
    });
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-finweb-login')), true);
    await navigate('/home');
    assert.equal(await page.locator('#loginPage').evaluate(el => el.classList.contains('hide')), true);
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-finweb-login')), false);

    await navigate('/loading');
    await page.evaluate(() => window.scrollTo(0, 0));
    const boundary = page.locator('.finweb-content-boundary');
    assert.equal(await boundary.getAttribute('aria-busy'), 'true');
    const hash = 'LEHV6nWB2yk8pyo0adR*.7kCMdnj';
    await page.evaluate(() => {
        window.revealFrames = [];
        window.revealStarts = 0;
        document.addEventListener('animationstart', event => {
            if (event.animationName === 'finweb-poster-reveal') window.revealStarts++;
        });
        window.sampleReveal = true;
        const sample = () => {
            const img = document.querySelector('img.finweb-image-poster');
            if (img?.getAttribute('src')?.includes('key=slow')) {
                window.revealFrames.push({
                    opacity: Number(getComputedStyle(img).opacity),
                    canvas: Boolean(document.querySelector('.finweb-image-placeholder canvas')),
                    backing: Number(getComputedStyle(document.querySelector('.finweb-image-placeholder')).opacity)
                });
            }
            if (window.sampleReveal) {
                requestAnimationFrame(sample);
            }
        };
        requestAnimationFrame(sample);
    });
    await page.evaluate(value => window.setLoadingFixture({ pending:false, key:'slow', delay:1500, hash:value }), hash);
    await page.waitForFunction(() => document.querySelector('.finweb-content-boundary')?.getAttribute('aria-busy') === 'false');
    await boundary.locator('img').waitFor({ state:'attached' });
    assert.equal(await boundary.locator('img').evaluate(img => img.complete), false, 'Data renders before posters arrive');
    assert.equal(await boundary.locator('canvas').isVisible(), true, 'BlurHash appears without waiting for the image');
    assert.equal(await boundary.getByTestId('poster-card').isVisible(), true);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.finweb-image-poster')).opacity === '1');
    await page.waitForFunction(() => !document.querySelector('.finweb-image-poster-revealing'));
    const reveal = await page.evaluate(() => {
        window.sampleReveal = false;
        return { frames:window.revealFrames, starts:window.revealStarts };
    });
    assert.equal(reveal.starts, 1, 'One reveal for a newly loaded image');
    assert.ok(reveal.frames.some(frame => frame.opacity > 0 && frame.opacity < 1));
    for (const frame of reveal.frames.filter(sample => sample.opacity < 1)) {
        assert.equal(frame.backing, 1, 'The backing cannot fade out before the poster is visible');
        assert.equal(frame.canvas, true, 'Keep BlurHash throughout the reveal');
    }
    assert.equal(await boundary.locator('canvas').count(), 0, 'Release BlurHash after the reveal');
    assert.equal(await boundary.locator('.finweb-image-placeholder').evaluate(el => getComputedStyle(el).opacity), '0');
    await page.evaluate(() => window.setLoadingFixture({ pending:false, key:'missing-hash', delay:1200 }));
    await page.waitForFunction(() => document.querySelector('.finweb-image-poster')?.getAttribute('src')?.includes('missing-hash'));
    assert.equal(await boundary.locator('img').evaluate(img => getComputedStyle(img).opacity), '0', 'Changing source resets loaded state');
    assert.equal(await boundary.locator('canvas').count(), 0);
    assert.notEqual(await boundary.locator('.finweb-image-placeholder').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    await page.evaluate(() => window.setLoadingFixture({ pending:false, key:'broken', delay:20, hash:'invalid', error:true }));
    await page.waitForFunction(() => {
        const img = document.querySelector('.finweb-image-poster');
        return img?.getAttribute('src')?.includes('broken') && img.complete;
    });
    assert.equal(await boundary.getAttribute('aria-busy'), 'false');
    assert.equal(await boundary.locator('canvas').count(), 0, 'Invalid hashes do not reach the decoder');
    assert.equal(await boundary.locator('img').evaluate(img => getComputedStyle(img).opacity), '0');
    assert.equal(await boundary.locator('.finweb-image-placeholder').evaluate(el => getComputedStyle(el).opacity), '1');
    await page.evaluate(value => window.setLoadingFixture({ pending:false, key:'recovery', delay:0, hash:value }), hash);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.finweb-image-poster')).opacity === '1');
    await page.evaluate(value => window.setLoadingFixture({ pending:true, retain:true, key:'recovery', delay:0, hash:value }), hash);
    await page.waitForFunction(() => document.querySelector('.finweb-content-boundary [inert]'));
    assert.equal(await boundary.getByTestId('poster-card').isVisible(), true, 'Retained query data remains visible');
    await boundary.locator('button').evaluate(button => button.click());
    assert.notEqual(await page.evaluate(() => window.posterAction), true, 'Stale data cannot trigger actions');
    await page.emulateMedia({ reducedMotion:'reduce' });
    assert.equal(await boundary.locator('img').evaluate(img => getComputedStyle(img).transitionDuration), '0s');
    assert.equal(await boundary.locator('img').evaluate(img => getComputedStyle(img).animationName), 'none');
    await page.emulateMedia({ reducedMotion:'no-preference' });
    for (const instance of [0, 1]) {
        await page.evaluate(value => {
            window.previousPoster = document.querySelector('img.finweb-image-poster');
            window.setLoadingFixture({ pending:false, key:'cached', delay:0, instance:value });
        }, instance);
        await page.waitForFunction(() => {
            const poster = document.querySelector('img.finweb-image-poster');
            return poster !== window.previousPoster && poster?.getAttribute('src')?.includes('cached') && poster.complete;
        });
        if (instance === 1) {
            assert.equal(await boundary.locator('img').evaluate(img => getComputedStyle(img).opacity), '1', 'Cached remount is visible immediately');
            assert.equal(await boundary.locator('img').evaluate(img => getComputedStyle(img).animationName), 'none', 'Do not replay a completed reveal');
            continue;
        }
        const fade = await boundary.locator('img').evaluate(img => {
            const animation = img.getAnimations().find(entry => entry.animationName === 'finweb-poster-reveal');
            if (!animation) return null;
            animation.pause();
            animation.currentTime = 130;
            return {
                duration:animation.effect.getTiming().duration,
                keyframes:animation.effect.getKeyframes().map(frame => frame.opacity),
                opacity:Number(getComputedStyle(img).opacity),
                top:img.getBoundingClientRect().top,
                cardTop:img.closest('[data-testid="poster-card"]').getBoundingClientRect().top
            };
        });
        assert.ok(fade, `Image instance ${instance} has its own reveal animation`);
        assert.equal(fade.duration, 260);
        assert.deepEqual(fade.keyframes, ['0', '1']);
        assert.ok(fade.opacity > 0 && fade.opacity < 1, 'The poster actually renders partially transparent during its fade');
        assert.equal(fade.top, fade.cardTop, 'The animation cannot move the card');
        await boundary.locator('img').evaluate(img => img.getAnimations().forEach(animation => {
            animation.finish();
        }));
        await page.waitForFunction(() => !document.querySelector('.finweb-image-poster-revealing'));
    }
    assert.equal(posterRequests.get('/poster?key=cached&delay=0&error=false'), 1, 'Remount uses the browser image cache without replaying the fade');
    await page.evaluate(() => {
        window.previousPoster = document.querySelector('img.finweb-image-poster');
        window.setLoadingFixture(state => ({ ...state }));
    });
    await page.waitForTimeout(100);
    assert.equal(await boundary.locator('img').evaluate(img => img === window.previousPoster && getComputedStyle(img).opacity === '1' && img.getAnimations().length === 0), true, 'Unchanged data keeps the same visible image');
    await page.evaluate(value => window.setLoadingFixture({ pending:false, key:'interrupted-reveal', delay:100, hash:value }), hash);
    await page.waitForFunction(() => document.querySelector('img.finweb-image-poster-revealing'));
    await page.evaluate(() => window.setLoadingFixture(state => ({ ...state, instance:2 })));
    await page.waitForFunction(() => document.querySelector('img.finweb-image-poster')?.complete && !document.querySelector('.finweb-image-poster-revealing'));
    assert.equal(await boundary.locator('img').evaluate(img => getComputedStyle(img).opacity), '1', 'Remount during a reveal cannot restart it');
    assert.equal(posterRequests.get('/poster?key=interrupted-reveal&delay=100&error=false'), 1);
    await page.emulateMedia({ reducedMotion:'reduce' });
    await page.evaluate(value => window.setLoadingFixture({ pending:false, key:'new-reduced-motion', delay:100, hash:value }), hash);
    await page.waitForFunction(() => document.querySelector('img')?.getAttribute('src')?.includes('new-reduced-motion') && document.querySelector('img').complete);
    assert.equal(await boundary.locator('img').evaluate(img => getComputedStyle(img).animationName), 'none');
    await page.waitForFunction(() => !document.querySelector('.finweb-image-placeholder canvas'));
    await page.emulateMedia({ reducedMotion:'no-preference' });
    const disabledFade = await page.addStyleTag({ content:'.finweb-image-poster-revealing { animation:none !important; }' });
    await page.evaluate(value => window.setLoadingFixture({ pending:false, key:'custom-no-animation', delay:100, hash:value }), hash);
    await page.waitForFunction(() => document.querySelector('img')?.getAttribute('src')?.includes('custom-no-animation') && document.querySelector('img').complete);
    await page.waitForFunction(() => !document.querySelector('.finweb-image-placeholder canvas') && !document.querySelector('.finweb-image-poster-revealing'));
    assert.equal(await boundary.locator('img').evaluate(img => getComputedStyle(img).opacity), '1');
    await disabledFade.evaluate(el => el.remove());
    await page.evaluate(() => {
        window.posterAction = false;
        window.setLoadingFixture({ pending:true, progressive:true, key:'section', delay:0 });
    });
    await page.waitForFunction(() => !document.querySelector('.finweb-content-boundary [inert]'));
    assert.equal(await boundary.getByTestId('poster-card').isVisible(), true, 'Ready home sections render while others are loading');
    await boundary.getByRole('button', { name:'Poster action' }).click();
    assert.equal(await page.evaluate(() => window.posterAction), true, 'Ready sections remain interactive');
    await page.evaluate(value => window.setLoadingFixture({ pending:false, key:'offscreen', delay:1000, offscreen:true, hash:value }), hash);
    await page.waitForFunction(() => document.querySelector('[data-testid="poster-card"]').getBoundingClientRect().top > window.innerHeight);
    assert.equal(await boundary.locator('canvas').count(), 0, 'No eager BlurHash for offscreen posters');
    await boundary.getByTestId('poster-card').scrollIntoViewIfNeeded();
    await boundary.locator('canvas').waitFor();
    await page.waitForFunction(() => document.querySelector('img.finweb-image-poster')?.complete);
    await boundary.locator('canvas').waitFor({ state:'detached' });
    assert.equal(await boundary.locator('canvas').count(), 0, 'Loaded poster releases the BlurHash canvas');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => window.setLoadingFixture({ pending:false, key:'stale', delay:1000 }));
    await page.waitForTimeout(50);
    await page.evaluate(() => window.setLoadingFixture({ pending:true, key:'new-request', delay:0 }));
    await page.waitForTimeout(700);
    assert.equal(await boundary.getAttribute('aria-busy'), 'true', 'Old image completion cannot reveal a newer pending page');
    await navigate('/server-info');
    assert.equal(await page.getByText(`Finweb ${metadata.finwebVersion}`, { exact:true }).isVisible(), true);
    assert.equal(await page.getByText('Jellyfin Web', { exact:true }).count(), 0);
    await navigate('/home');
    assert.equal((await page.locator('[data-testid="page"]').boundingBox()).x, 250);
    await page.locator('.finweb-navigation').getByRole('link', { name:'TabDashboard', exact:true }).click();
    assert.equal(await page.evaluate(() => document.body.classList.contains('finweb-sidebar-visible')), false);
    assert.equal((await page.locator('.MuiDrawer-paper').boundingBox()).width, 240);
    for (const customCss of [false, true]) {
        await page.evaluate(enabled => {
            document.querySelector('#legacy-css').disabled = !enabled;
            window.serverName = 'VeryLongServerNameWithoutSpacesToCheckDashboardWrapping';
        }, customCss);
        await navigate('/home');
        await navigate('/dashboard');
        await page.getByText('VeryLongServerNameWithoutSpacesToCheckDashboardWrapping', { exact:true }).waitFor();
        assert.equal(await page.getByText('12.0', { exact:true }).isVisible(), true);
        const logo = page.locator('.MuiDrawer-paper img');
        await logo.evaluate(img => img.decode());
        const box = await logo.boundingBox();
        assert.ok(box.width <= 40 && box.height <= 40, 'Dashboard icon is bounded');
        assert.equal(await page.locator('.MuiDrawer-paper').evaluate(el => el.scrollWidth > el.clientWidth), false);
        assert.equal(await page.locator('.finweb-drawer-brand').count(), 0);
    }
    await page.evaluate(() => {
        window.navigate('/slow-home');
    });
    await page.waitForFunction(() => {
        const tabs = document.querySelector('[data-testid="dashboard-tabs"]');
        return tabs && getComputedStyle(tabs).visibility === 'hidden';
    });
    await page.waitForFunction(() => document.querySelector('[data-testid="page"]')?.getAttribute('data-path') === '/slow-home');
    assert.equal(await page.locator('[data-testid="top-navigation"]').count(), 0, 'Old horizontal navigation is never mounted in the modern layout');
    assert.equal(await page.evaluate(() => document.body.classList.contains('dashboardDocument')), false);
    assert.deepEqual(errors, []);
    console.log('PASS: frame-by-frame layout and header spacing, startup, header groups/CSS, scrollbars, paging, video cleanup, uninterrupted BlurHash backing, single poster reveal, cached/interrupted remounts, reduced motion/custom animation disabling, retained content and identity. No screenshots taken.');
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
/* eslint-enable compat/compat */
