/* eslint-disable compat/compat -- Node and modern Chromium integration tests. */
/* eslint-disable @stylistic/max-statements-per-line, sonarjs/cognitive-complexity, sonarjs/void-use, no-void -- Sequential browser scenarios and an explicit HTTP fixture router. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import ts from 'typescript';
import { compile } from 'sass';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const temp = await mkdtemp(path.join(tmpdir(), 'finweb-playback-'));
const videoPath = path.join(temp, 'video.mp4');
// eslint-disable-next-line sonarjs/no-os-command-from-path
const encoded = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
    'color=c=black:s=640x360:r=24', '-t', '30', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', videoPath], { windowsHide: true });
assert.equal(encoded.status, 0, encoded.stderr?.toString());
const videoBytes = await readFile(videoPath);
// eslint-disable-next-line sonarjs/no-os-command-from-path
const hlsEncoded = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', videoPath,
    '-c', 'copy', '-hls_time', '2', '-hls_playlist_type', 'vod', '-hls_segment_filename', path.join(temp, 'segment%d.ts'), path.join(temp, 'master.m3u8')], { windowsHide: true });
assert.equal(hlsEncoded.status, 0, hlsEncoded.stderr?.toString());
const font = await readFile(path.join(root, 'node_modules/@jellyfin/libass-wasm/dist/js/default.woff2'));
const bundle = async options => (await build({ absWorkingDir: root, bundle: true, write: false,
    format: 'esm', platform: 'browser', logLevel: 'silent', ...options })).outputFiles[0].text;
const playerSource = ts.createSourceFile('plugin.js', await readFile(path.join(root, 'src/plugins/htmlVideoPlayer/plugin.js'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const hostImports = new Map();
for (const statement of playerSource.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier.text;
    if (specifier.includes('FinwebPlaybackSession') || specifier.includes('TextEventRenderer') || specifier.includes('subtitles/diagnostics') || specifier === 'lib/jellyfin-apiclient') continue;
    const defaults = {
        debounce: 'fn=>Object.assign(fn,{cancel:()=>{}})',
        browser: '{slow:true,supportsCssAnimation:()=>false}',
        appSettings: '{get:()=>false,alwaysBurnInSubtitleWhenTranscoding:()=>false,aspectRatio:()=>"auto"}',
        itemHelper: '{isLocalItem:()=>false}',
        subtitleAppearanceHelper: '{getStyles:()=>({text:[]}),applyStyles:()=>{}}',
        Screenfull: '{isEnabled:false}', loading: '{show:()=>{},hide:()=>{}}',
        toast: 'message=>{(window.hostToasts||=[]).push(message)}',
        Events: '{trigger:()=>{}}', globalize: '{translate:key=>key}'
    };
    const named = {
        currentSettings: '{getSubtitleAppearanceSettings:()=>({verticalPosition:"-1"})}',
        useCustomSubtitles: '()=>false', appHost: '{supports:()=>true}',
        appRouter: '{showVideoOsd:()=>new Promise(resolve=>window.finishNavigation=resolve)}',
        playbackManager: '{getSubtitleUrl:track=>location.origin+"/subtitles/"+track.Index+(track.Codec==="ass"?".ass":".vtt"),trackHasSecondarySubtitleSupport:()=>true,setSubtitleStreamIndex:(index,player)=>player.setSubtitleStreamIndex(index),setSecondarySubtitleStreamIndex:(index,player)=>player.setSecondarySubtitleStreamIndex(index)}',
        AppFeature: '{}', PluginType: '{}', TRANSPARENCY_LEVEL: '{}', MediaError: '{}',
        getCrossOriginValue: '()=>null', getIncludeCorsCredentials: 'async()=>false',
        applySrc: 'async(video,url)=>{video.src=url}', playWithPromise: '(video)=>video.play()',
        seekOnPlaybackStart: '(player,video,ticks,done)=>{if(ticks)video.currentTime=ticks/1e7;done()}',
        resetSrc: 'video=>{video.removeAttribute("src");video.load()}',
        getSavedVolume: '()=>0', enableHlsJsPlayerForCodecs: '()=>!!window.fixtureHls', isHls: '()=>!!window.fixtureHls',
        bindEventsToHlsPlayer: '(player,hls,video,onError,resolve,reject)=>{hls.on(hls.constructor.Events.MANIFEST_PARSED,()=>video.play().then(resolve,reject));hls.on(hls.constructor.Events.ERROR,(_,data)=>{if(data.fatal)reject(Error(data.details))})}',
        destroyHlsPlayer: 'player=>{player._hlsPlayer?.destroy();player._hlsPlayer=null}',
        onEndedInternal: 'player=>{player._hlsPlayer?.destroy();player._hlsPlayer=null}'
    };
    let content = '';
    if (statement.importClause.name) content += `export default ${defaults[statement.importClause.name.text] || '()=>{}'};`;
    for (const element of statement.importClause.namedBindings?.elements || []) {
        const name = element.propertyName?.text || element.name.text;
        content += `export const ${name}=${named[name] || '()=>{}'};`;
    }
    hostImports.set(specifier, content);
}
const toastCss = compile(path.join(root, 'src/components/toast/toast.scss')).css;
const backgroundReadyText = JSON.parse(await readFile(path.join(root, 'src/strings/ko.json'), 'utf8')).FinwebBackgroundSubtitlesReady;
const fixture = await bundle({
    plugins: [{ name: 'server-adapter', setup(builder) {
        builder.onResolve({ filter: /.*/ }, args => {
            if (args.importer.replaceAll('\\', '/').endsWith('htmlVideoPlayer/plugin.js') && hostImports.has(args.path)) return { path: args.path, namespace: 'host' };
            if (args.path.endsWith('.scss')) return { path: 'styles', namespace: 'host' };
        });
        builder.onLoad({ filter: /.*/, namespace: 'host' }, args => ({ contents: hostImports.get(args.path) || '' }));
        builder.onResolve({ filter: /^lib\/globalize$/ }, () => ({ path: 'globalize', namespace: 'fixture-globalize' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture-globalize' }, () => ({ contents: 'export default {translate:key=>key}' }));
        builder.onResolve({ filter: /^lib\/jellyfin-apiclient$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
            export const ServerConnections = {getApiClient: () => ({
                getUrl: (path, params={}) => location.origin+'/'+path.replace(/^\\//,'')+(Object.keys(params).length?'?'+new URLSearchParams(params):''),
                accessToken: () => 'fixture-token', deviceId: () => 'fixture-device',
                getJSON: url => fetch(url).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}),
                getNamedConfiguration: () => fetch('/encoding').then(r=>r.json()),
                getSessions: () => fetch('/Sessions').then(r=>r.json())
            })};` }));
        builder.onResolve({ filter: /default\.woff2$/ }, () => ({ path: 'font', namespace: 'font' }));
        builder.onLoad({ filter: /.*/, namespace: 'font' }, () => ({ contents: 'export default \'/font.woff2\'' }));
    } }],
    stdin: { resolveDir: root, contents: `
        import {FinwebPlaybackSession} from './src/plugins/htmlVideoPlayer/FinwebPlaybackSession';
        import {HtmlVideoPlayer} from './src/plugins/htmlVideoPlayer/plugin';
        import toast from './src/components/toast/toast';
        import {isSubtitlePrefetchNoticeEnabled} from './src/plugins/htmlVideoPlayer/subtitles/diagnostics';
        const video=document.querySelector('video');
        const changes=[];
        let session;
        let item='item', baseOffset=0, playMethod='DirectPlay';
        const tracks=[{Type:'Subtitle',Index:3,Codec:'srt',DeliveryMethod:'External'},
            {Type:'Subtitle',Index:7,Codec:'ass',DeliveryMethod:'External'},
            {Type:'Subtitle',Index:11,Codec:'srt',DeliveryMethod:'External'}];
        function reset() {
            session?.dispose();
            session=new FinwebPlaybackSession({videoElement:video,
                getPlaybackOptions:()=>({item:{Id:item,ServerId:'server'},playMethod,
                    transcodingOffsetTicks:baseOffset*1e7,mediaSource:{Id:'source',MediaStreams:tracks,
                    MediaAttachments:[{MimeType:'font/ttf',DeliveryUrl:'attachment.woff2'}]}}),
                getSubtitleUrl:track=>location.origin+'/subtitles/'+track.Index+(track.Codec==='ass'?'.ass':'.vtt'),
                onStateChange:change=>changes.push({...change,error:change.error?.message}),
                onBackgroundSubtitlesReady:()=>{window.backgroundReady=(window.backgroundReady||0)+1;if(isSubtitlePrefetchNoticeEnabled())toast(${JSON.stringify(backgroundReadyText)})},
                useManagedTrack:()=>true, renderLegacy:()=>{}, prepareManaged:()=>{},
                burnInWhenTranscoding:()=>playMethod!=='DirectPlay',getCueLine:slot=>slot?-4:-1});
        }
        reset();
        window.fixture={video,changes,select:(index,slot=0)=>session.selectStream(index,slot),
            language:value=>tracks.forEach(track=>track.Language=value),
            reset:(id='item',offset=0,method='DirectPlay')=>{item=id;baseOffset=offset;playMethod=method;reset()},
            clear:()=>session.clear(),dispose:()=>session.dispose(),
            active:slot=>session.pipeline.getActiveTrackIndex(slot||0),
            offset:value=>session.setOffset(0,value),
            state:()=>session.diagnostics,
            cues:()=>Array.from(video.textTracks).filter(t=>t.mode==='showing').flatMap(t=>Array.from(t.activeCues||[]).map(c=>c.text)),
            host:async(hls=false)=>{
                window.fixtureHls=hls;
                session.dispose();document.querySelector('#player')?.remove();
                const style=document.createElement('style');style.textContent='.videoPlayerContainer{position:relative;width:640px;height:360px}';document.head.append(style);
                const host=new HtmlVideoPlayer();window.hostPlayer=host;
                await host.play({url:location.origin+(hls?'/hls/master.m3u8':'/video.mp4'),item:{Id:'host',ServerId:'server'},
                    mediaSource:{Id:'source',Container:hls?'HLS':'MP4',DefaultSubtitleStreamIndex:7,MediaStreams:tracks},
                    playMethod:hls?'Transcode':'DirectPlay',transcodingOffsetTicks:hls?150000000:0,
                    fullscreen:true,playerStartPositionTicks:0});
            },
            pixels:()=>{const canvas=document.querySelector('.subtitle-pipeline-ass canvas');if(!canvas)return 0;
                const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
                const context=copy.getContext('2d');context.drawImage(canvas,0,0);
                const bytes=context.getImageData(0,0,copy.width,copy.height).data;
                let count=0;for(let i=3;i<bytes.length;i+=4)if(bytes[i])count++;return count;}
        };`
    }
});
const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 640
PlayResY: 360
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Liberation Sans,32,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,20,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:10.00,Default,,0,0,0,,ASS FIRST
Dialogue: 0,0:00:15.00,0:00:30.00,Default,,0,0,0,,ASS SECOND
`;
let delay = 0; let failAss = false; let bridgeEnabled = true; let sessionDelay = 0; let bodyDelay = 0;
let failFontConfig = false; let failFontList = false;
const requests = [];
const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost');
        requests.push(url.pathname);
        if (url.pathname.startsWith('/hls/')) {
            response.writeHead(200, { 'Content-Type': url.pathname.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' });
            response.end(await readFile(path.join(temp, path.basename(url.pathname))));
            return;
        }
        if (url.pathname.startsWith('/subtitles/') || url.pathname.startsWith('/SubtitleFontBridge/')) await new Promise(resolve => setTimeout(resolve, delay));
        const send = (type, content, status = 200) => { response.writeHead(status, { 'Content-Type': type }); response.end(content); };
        if (url.pathname === '/') return send('text/html', '<html dir="ltr"><link rel="stylesheet" href="/toast.css"><style>body{margin:0;background:black}#player{position:relative;width:640px;height:360px}video{width:100%;height:100%}</style><div id="player"><video muted playsinline src="/video.mp4"></video></div><script type="module" src="/fixture.js"></script>');
        if (url.pathname === '/toast.css') return send('text/css', toastCss);
        if (url.pathname === '/fixture.js') return send('text/javascript', fixture);
        if (/^\/libraries\/subtitles-octopus-worker(?:-legacy)?\.(?:js|wasm)$/u.test(url.pathname)) {
            const file = path.basename(url.pathname);
            const mime = file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript';
            return send(mime, await readFile(path.join(root, process.env.FINWEB_PRODUCTION_ENGINE ? 'dist/libraries' : 'node_modules/@jellyfin/libass-wasm/dist/js', file)));
        }
        if (url.pathname.endsWith('.woff2')) {
            if (url.pathname.startsWith('/SubtitleFontBridge/')) assert.equal(url.searchParams.get('ApiKey'), 'fixture-token');
            return send('font/woff2', font);
        }
        if (url.pathname.endsWith('.ass')) return send('text/plain', failAss ? 'failed' : ass, failAss ? 503 : 200);
        if (url.pathname.endsWith('.vtt')) {
            const content = 'WEBVTT\n\n00:00:00.000 --> 00:00:10.000\nSRT FIRST\n\n00:00:15.000 --> 00:00:30.000\nSRT SECOND\n';
            if (bodyDelay) {
                response.writeHead(200, { 'Content-Type': 'text/vtt', 'Content-Length': Buffer.byteLength(content) });
                response.flushHeaders();
                await new Promise(resolve => setTimeout(resolve, bodyDelay));
                response.write(content.slice(0, 40));
                await new Promise(resolve => setTimeout(resolve, bodyDelay));
                response.end(content.slice(40));
                return;
            }
            return send('text/vtt', content);
        }
        if (url.pathname.startsWith('/SubtitleFontBridge/Subtitles/')) return send('application/json', JSON.stringify({ Resolution:{ RequestedFamilies:['Liberation Sans'], MissingFamilies:[], Files:[{ Id:'font', Path:'SubtitleFontBridge/Files/font.woff2' }], Families:[{ RequestedFamily:'Liberation Sans', FontIds:['font'] }] } }), bridgeEnabled ? 200 : 404);
        if (url.pathname === '/encoding') return send('application/json', JSON.stringify({ EnableFallbackFont: failFontList }), failFontConfig ? 503 : 200);
        if (url.pathname === '/FallbackFont/Fonts') return send('application/json', '[]', failFontList ? 503 : 200);
        if (url.pathname === '/Sessions') {
            await new Promise(resolve => setTimeout(resolve, sessionDelay));
            return send('application/json', '[{"TranscodingInfo":{"IsVideoDirect":true}}]');
        }
        if (url.pathname === '/video.mp4') {
            const range = request.headers.range?.match(/bytes=(\d+)-(\d*)/);
            if (range) {
                const start = Number(range[1]); const end = range[2] ? Number(range[2]) : videoBytes.length - 1;
                response.writeHead(206, { 'Content-Type':'video/mp4', 'Accept-Ranges':'bytes', 'Content-Range':`bytes ${start}-${end}/${videoBytes.length}`, 'Content-Length':end - start + 1 });
                return response.end(videoBytes.subarray(start, end + 1));
            }
            return send('video/mp4', videoBytes);
        }
        return send('text/plain', 'not found', 404);
    } catch (error) { response.writeHead(500); response.end(String(error)); }
});
let browser;
try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless:true, args:['--autoplay-policy=no-user-gesture-required'], executablePath:process.env.CHROMIUM_EXECUTABLE });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (process.env.DEBUG_PLAYBACK) {
        page.on('pageerror', error => console.error('PAGE', error.message));
        page.on('console', message => console.log('BROWSER', message.type(), message.text()));
    }
    await page.goto(`http://127.0.0.1:${server.address().port}/?subtitleDiagnostics=1`);
    await page.waitForFunction(() => !!window.fixture);
    {
        delay = 800;
        await page.evaluate(() => { fixture.video.playbackRate = 2; void fixture.video.play(); void fixture.select(7); });
        await page.waitForFunction(() => fixture.active() === 7 && fixture.pixels() > 50, null, { timeout:30000 }).catch(async error => {
            console.error(await page.evaluate(() => ({ changes: fixture.changes, diagnostics: fixture.state(), canvases: document.querySelectorAll('canvas').length })));
            console.error(requests.filter(url => url.startsWith('/dist/')));
            throw error;
        });
        console.log('PASS delayed startup + 2x + real ASS pixels');
        const startupTiming = await page.evaluate(() => window.finwebSubtitleDiagnostics.snapshot().entries);
        assert.ok(startupTiming.some(entry => entry.stage === 'subtitle-response' && entry.phase === 'end' && entry.durationMs >= 750));
        assert.ok(startupTiming.some(entry => entry.stage === 'ass-initialize' && entry.phase === 'end'));
        await page.evaluate(() => { fixture.video.pause();fixture.video.currentTime = 3; });
        delay = 0;
        await page.evaluate(() => window.finwebSubtitleDiagnostics.start());
        await page.evaluate(() => fixture.select(3));
        await page.waitForFunction(() => fixture.cues().includes('SRT FIRST'));
        await page.evaluate(() => fixture.select(7));
        await page.waitForFunction(() => fixture.active() === 7 && fixture.pixels() > 50);
        assert.equal(await page.evaluate(() => fixture.cues().length), 0);
        console.log('PASS SRT to ASS while paused without seeking');
        const switchingTiming = await page.evaluate(() => window.finwebSubtitleDiagnostics.snapshot().entries);
        assert.ok(switchingTiming.some(entry => entry.stage === 'webvtt-first-active-cue'));
        const switchTimes = switchingTiming.filter(entry => entry.stage === 'active').map(entry => ({ trackIndex: entry.trackIndex, elapsedMs: entry.elapsedMs }));
        assert.equal(switchTimes.length, 2);
        console.log('TIMING local fixture ASS -> SRT, SRT -> ASS:', JSON.stringify(switchTimes));
        const downloadEvent = page.waitForEvent('download');
        await page.evaluate(() => window.finwebSubtitleDiagnostics.download());
        const download = await downloadEvent;
        assert.equal(download.suggestedFilename(), 'finweb-subtitle-diagnostics.json');
        const downloaded = JSON.parse(await readFile(await download.path(), 'utf8'));
        assert.deepEqual(downloaded.entries, JSON.parse(JSON.stringify(switchingTiming)));
        assert.ok(!JSON.stringify(downloaded).includes('fixture-token'));
        assert.ok(!JSON.stringify(downloaded).includes('SRT FIRST'));
        console.log('PASS opt-in timing and private-data-free JSON download');
        const resourceRequests = () => requests.filter(url => url.startsWith('/subtitles/') || url.startsWith('/SubtitleFontBridge/') || url.endsWith('.woff2') || url === '/encoding');
        await page.waitForFunction(() => window.finwebSubtitleDiagnostics.snapshot().entries.some(entry => entry.stage === 'prefetch-all-ready'));
        const warmedRequests = resourceRequests().length;
        failAss = true;
        bodyDelay = 2300;
        await page.evaluate(() => fixture.select(-1));
        await page.evaluate(() => fixture.select(3));
        await page.waitForFunction(() => fixture.cues().includes('SRT FIRST'));
        await page.evaluate(() => fixture.select(7));
        await page.waitForFunction(() => fixture.pixels() > 50);
        assert.equal(resourceRequests().length, warmedRequests, JSON.stringify(resourceRequests()));
        assert.ok((await page.evaluate(() => window.finwebSubtitleDiagnostics.snapshot().entries)).some(entry => entry.stage === 'prepared-subtitle-hit'));
        failAss = false;
        bodyDelay = 0;
        console.log('PASS warmed ASS/SRT/font data survives off and renderer replacement with zero new requests even when endpoints stall/fail');
        await page.evaluate(() => { fixture.reset('body-stall');return fixture.select(7); });
        bodyDelay = 2300;
        await page.evaluate(() => window.finwebSubtitleDiagnostics.start());
        await page.evaluate(() => fixture.select(3));
        const streamed = await page.evaluate(() => window.finwebSubtitleDiagnostics.snapshot());
        assert.equal(streamed.schema, 2);
        const resource = streamed.entries.filter(entry => entry.resourceKind === 'subtitle');
        assert.ok(resource.some(entry => entry.stage === 'resource-wait' && entry.bytes === 0));
        assert.ok(resource.some(entry => entry.stage === 'resource-first-byte' && entry.elapsedMs >= 2200));
        assert.ok(resource.some(entry => entry.stage === 'resource-wait' && entry.bytes === 40 && entry.idleMs >= 1000));
        assert.ok(resource.some(entry => entry.stage === 'resource-end' && entry.outcome === 'complete' && entry.elapsedMs >= 4400));
        assert.ok(resource.every(entry => Number.isFinite(entry.parentTrace)));
        bodyDelay = 0;
        await page.evaluate(() => fixture.select(7));
        console.log('PASS real HTTP headers-first response: late first body byte and mid-body stall are visible separately');
        await page.evaluate(() => { fixture.video.currentTime = 12; });
        await page.waitForFunction(() => fixture.pixels() === 0);
        await page.evaluate(() => { fixture.video.currentTime = 17; });
        await page.waitForFunction(() => fixture.pixels() > 50);
        console.log('PASS intentional silent interval and paused seek');
        delay = 500;
        await page.evaluate(() => { fixture.reset('cancelled-source');void fixture.select(7);setTimeout(()=>void fixture.select(3), 50); });
        await page.waitForFunction(() => fixture.active() === 3 && fixture.cues().includes('SRT SECOND'));
        await page.waitForTimeout(1500);
        assert.equal(await page.evaluate(() => document.querySelectorAll('.subtitle-pipeline-ass').length), 0);
        console.log('PASS slow ASS cancelled by newer SRT');
        await page.evaluate(() => { void fixture.select(7);fixture.select(-1); });
        await page.waitForTimeout(1500);
        assert.equal(await page.evaluate(() => fixture.active()), undefined);
        assert.equal(await page.evaluate(() => document.querySelectorAll('.subtitle-pipeline-ass,track').length), 0);
        console.log('PASS off cancels pending selection and releases surfaces');
        delay = 0;failAss = true;
        await page.evaluate(() => fixture.reset('failure-source'));
        await page.evaluate(() => fixture.select(3));
        await page.evaluate(() => fixture.select(7));
        assert.equal(await page.evaluate(() => fixture.active()), 3);
        failAss = false;
        await page.evaluate(() => fixture.select(7));
        await page.waitForFunction(() => fixture.pixels() > 50);
        console.log('PASS HTTP failure preserves previous track and retry recovers');
        bridgeEnabled = false;
        await page.evaluate(() => fixture.reset('another-item', 15));
        await page.evaluate(() => { fixture.video.currentTime = 2;return fixture.select(3); });
        await page.waitForFunction(() => fixture.cues().includes('SRT SECOND'));
        await page.evaluate(() => fixture.select(7));
        await page.waitForFunction(() => fixture.pixels() > 50);
        assert.ok(requests.includes('/attachment.woff2'));
        console.log('PASS new source timeline offset + missing Bridge attachment fallback');
        failFontList = true;
        await page.evaluate(() => { fixture.reset('optional-font-discovery-failure');fixture.video.currentTime = 2;return fixture.select(7); });
        await page.waitForFunction(() => fixture.pixels() > 50);
        await page.evaluate(() => fixture.select(3));
        const beforeOptionalRetry = requests.filter(url => url === '/encoding' || url === '/FallbackFont/Fonts' || url.startsWith('/SubtitleFontBridge/') || url.endsWith('.woff2')).length;
        failFontConfig = true;
        await page.evaluate(() => { window.finwebSubtitleDiagnostics.start();return fixture.select(7); });
        await page.waitForFunction(() => fixture.pixels() > 50);
        assert.equal(requests.filter(url => url === '/encoding' || url === '/FallbackFont/Fonts' || url.startsWith('/SubtitleFontBridge/') || url.endsWith('.woff2')).length, beforeOptionalRetry);
        const optionalRetry = await page.evaluate(() => window.finwebSubtitleDiagnostics.snapshot().entries);
        assert.ok(optionalRetry.some(entry => entry.stage === 'prepared-subtitle-hit'));
        assert.ok(!optionalRetry.some(entry => entry.stage === 'font-config'));
        failFontList = false; failFontConfig = false;
        console.log('PASS unresolved Bridge + denied fallback list: attachment plan is reused without any optional API lookup on SRT -> ASS');
        sessionDelay = 600;
        await page.evaluate(() => { fixture.reset('remux', 0, 'Transcode');void fixture.select(7);fixture.select(-1); });
        await page.waitForTimeout(1500);
        assert.equal(await page.evaluate(() => fixture.active()), undefined);
        console.log('PASS slow session lookup cannot override off');
        await page.evaluate(() => window.finwebSubtitleDiagnostics.start());
        await page.evaluate(() => fixture.select(7));
        await page.evaluate(() => fixture.select(3));
        const delayedSwitches = await page.evaluate(() => window.finwebSubtitleDiagnostics.snapshot().entries);
        assert.ok(delayedSwitches.some(entry => entry.trackIndex === 7 && entry.stage === 'delivery-check' && entry.phase === 'end' && entry.durationMs >= 550));
        for (const trackIndex of [7, 3]) {
            assert.ok(delayedSwitches.some(entry => entry.trackIndex === trackIndex && entry.stage === 'active'));
        }
        assert.ok(delayedSwitches.some(entry => entry.trackIndex === 3 && entry.stage === 'delivery-check' && entry.phase === 'end' && entry.durationMs < 550));
        console.log('PASS delivery mode is resolved once per source, with no repeated session lookup on switching');
        sessionDelay = 0;
        await page.evaluate(() => { fixture.reset();fixture.video.currentTime = 2;return fixture.select(3); });
        await page.evaluate(() => fixture.select(11, 1));
        await page.waitForFunction(() => fixture.cues().length === 2);
        await page.evaluate(() => fixture.select(-1));
        assert.equal(await page.evaluate(() => fixture.cues().length), 0);
        await page.evaluate(() => fixture.dispose());
        console.log('PASS dual tracks + complete cleanup');
        bridgeEnabled = true;
        const beforePrefetch = requests.filter(url => url === '/subtitles/3.vtt').length;
        await page.evaluate(() => { fixture.language('kor');fixture.reset('prefetch-source');window.finwebSubtitleDiagnostics.start();return fixture.select(7); });
        await page.waitForFunction(() => window.finwebSubtitleDiagnostics.snapshot().entries.some(entry => entry.stage === 'prefetch-all-ready'));
        assert.equal(requests.filter(url => url === '/subtitles/3.vtt').length, beforePrefetch + 1);
        assert.equal(await page.locator('.toastVisible:not(.toastHide)').count(), 0);
        const prefetchedRequests = resourceRequests().length;
        await page.evaluate(() => fixture.select(3));
        await page.waitForFunction(() => fixture.cues().includes('SRT FIRST'));
        await page.evaluate(() => fixture.select(11));
        await page.waitForFunction(() => fixture.active() === 11);
        await page.evaluate(() => fixture.select(7));
        await page.waitForFunction(() => fixture.pixels() > 50);
        assert.equal(resourceRequests().length, prefetchedRequests);
        await page.evaluate(() => { window.history.replaceState(null, '', '/?subtitlePrefetchNotice=1');fixture.reset('prefetch-ass-source');window.finwebSubtitleDiagnostics.start();return fixture.select(3); });
        const notifications = await page.evaluate(() => window.backgroundReady || 0);
        await page.waitForFunction(() => window.finwebSubtitleDiagnostics.snapshot().entries.some(entry => entry.stage === 'prefetch-all-ready'));
        assert.equal(await page.evaluate(() => window.backgroundReady), notifications + 1);
        await page.waitForFunction(text => [...document.querySelectorAll('.toastVisible:not(.toastHide)')].some(toast => {
            const bounds = toast.getBoundingClientRect();
            return toast.textContent === text && bounds.left >= 0 && bounds.left < 80
                && bounds.right <= window.innerWidth && bounds.bottom <= window.innerHeight && bounds.bottom > window.innerHeight - 80;
        }), backgroundReadyText);
        const prefetchedAssRequests = resourceRequests().length;
        failAss = true;
        await page.evaluate(() => fixture.select(7));
        await page.waitForFunction(() => fixture.pixels() > 50);
        assert.equal(resourceRequests().length, prefetchedAssRequests);
        failAss = false;
        await page.evaluate(() => fixture.language(undefined));
        console.log('PASS all three subtitle files prefetched, completion callback, ASS fonts and zero resource requests on activation');
        await page.evaluate(() => window.history.replaceState(null, '', '/?subtitleDiagnostics=1'));
        await page.evaluate(() => { window.finwebSubtitleDiagnostics.start();return fixture.host(); });
        await page.waitForFunction(() => fixture.pixels() > 50);
        await page.waitForFunction(() => window.finwebSubtitleDiagnostics.snapshot().entries.some(entry => entry.stage === 'prefetch-all-ready'));
        assert.ok(!(await page.evaluate(() => window.hostToasts || [])).includes('FinwebBackgroundSubtitlesReady'));
        await page.evaluate(() => window.hostPlayer.setSubtitleStreamIndex(3));
        await page.waitForFunction(() => Array.from(document.querySelector('video').textTracks).some(track => track.mode === 'showing' && track.activeCues?.length));
        await page.evaluate(() => window.finishNavigation());
        await page.waitForTimeout(600);
        assert.equal(await page.evaluate(() => document.querySelectorAll('.subtitle-pipeline-ass').length), 0);
        await page.evaluate(() => window.hostPlayer.setSubtitleStreamIndex(7));
        await page.waitForFunction(() => fixture.pixels() > 50);
        await page.evaluate(() => window.hostPlayer.stop(true));
        assert.equal(await page.evaluate(() => document.querySelectorAll('video,track,.subtitle-pipeline-ass').length), 0);
        await page.waitForTimeout(500);
        await page.evaluate(() => fixture.host(true));
        await page.waitForFunction(() => fixture.pixels() > 50);
        await page.evaluate(() => window.hostPlayer.setSubtitleStreamIndex(3));
        await page.waitForFunction(() => Array.from(document.querySelector('video').textTracks).some(track => Array.from(track.activeCues || []).some(cue => cue.text === 'SRT SECOND')));
        await page.evaluate(() => window.hostPlayer.setSubtitleStreamIndex(7));
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => {
            const host = document.querySelector('.videoPlayerContainer');
            host.style.width = '100vw';
            host.style.height = '219px';
        });
        await page.waitForFunction(() => fixture.pixels() > 50 && document.querySelector('.subtitle-pipeline-ass canvas').getBoundingClientRect().width <= 390);
        await page.evaluate(() => {
            const host = document.querySelector('.videoPlayerContainer');
            host.addEventListener('click', () => { window.fullscreenAttempt = host.requestFullscreen(); }, { once: true });
        });
        await page.locator('video').click();
        await page.evaluate(() => window.fullscreenAttempt);
        await page.waitForFunction(() => !!document.fullscreenElement && fixture.pixels() > 50);
        await page.evaluate(() => document.exitFullscreen());
        await page.evaluate(() => window.hostPlayer.stop(true));
        await page.waitForTimeout(500);
        assert.equal(page.workers().length, 0);
        assert.deepEqual(errors, []);
        console.log('PASS actual HtmlVideoPlayer entry: direct/HLS, sparse indices, delayed OSD, transcode offset, mobile resize/fullscreen, switching and stop; zero remaining workers or page errors; no screenshots');
    }
    {
        const defaultPage = await browser.newPage();
        const defaultErrors = [];
        defaultPage.on('pageerror', error => defaultErrors.push(error.message));
        await defaultPage.goto(`http://127.0.0.1:${server.address().port}/`);
        await defaultPage.waitForFunction(() => !!window.fixture);
        await defaultPage.evaluate(() => { fixture.video.playbackRate = 2; void fixture.video.play(); void fixture.select(7); });
        await defaultPage.waitForFunction(() => fixture.active() === 7 && fixture.pixels() > 50
            && document.querySelectorAll('.subtitle-pipeline-ass').length === 1, null, { timeout: 30_000 });
        await defaultPage.evaluate(() => { fixture.video.pause(); return fixture.select(3); });
        await defaultPage.waitForFunction(() => fixture.cues().includes('SRT FIRST'));
        await defaultPage.evaluate(() => fixture.select(7));
        await defaultPage.waitForFunction(() => fixture.active() === 7 && fixture.pixels() > 50);
        await defaultPage.evaluate(() => fixture.clear());
        assert.equal(await defaultPage.locator('.subtitle-pipeline-ass').count(), 0);
        assert.equal(defaultPage.workers().length, 0);
        assert.deepEqual(defaultErrors, []);
        await defaultPage.close();
        console.log('PASS default Original libass-wasm ASS at 2x, paused SRT/ASS switches and Worker cleanup');
    }
} finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(temp, { recursive:true, force:true });
}
/* eslint-enable compat/compat */
/* eslint-enable @stylistic/max-statements-per-line, sonarjs/cognitive-complexity, sonarjs/void-use, no-void */
