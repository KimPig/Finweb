/* eslint-disable compat/compat -- Browser geometry tests without screenshots. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { compile } from 'sass';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
    absWorkingDir: root, bundle: true, write: false, format: 'iife',
    stdin: { resolveDir: root, contents: `
import SeekPreview from './src/plugins/finwebPlayer/SeekPreview';
window.preview = new SeekPreview();
window.updatePreview = (url, options = {}) => {
 const bubble = document.querySelector('.sliderBubble');
 bubble.style.left = (options.left || 0) + 'px';
 const tile = options.chapterImage ? undefined : { width:320, height:180, x:options.x || 0, y:0 };
 window.preview.update(bubble, options.time || '13:29', options.chapter || '', url ? {url,tile} : undefined);
};` }
});
const css = ['elements/emby-slider/emby-slider.scss', 'styles/videoosd.scss', 'styles/finweb.scss']
    .map(path => compile(`${root}/src/${path}`).css).join('\n');
const sheet = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="green"/><rect width="320" height="180" fill="red"/></svg>';
const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/fixture.js' ? 'text/javascript' : 'text/html');
    response.end(request.url === '/fixture.js' ? bundle.outputFiles[0].text : `<!doctype html>
<html data-finweb-theme><style>${css}
body{margin:20px;font:16px sans-serif;background:magenta}
.mdl-slider-container{position:relative;margin-top:400px;width:100%}
</style><body><div class="mdl-slider-container"><input class="mdl-slider osdPositionSlider">
<div class="sliderBubbleTrack"><div class="sliderBubble"></div></div></div>
<script src="/fixture.js"></script></body></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage();
    const pending = new Map();
    const requests = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/images/**', route => {
        const path = new URL(route.request().url()).pathname;
        requests.push(path);
        pending.set(path, route);
    });
    const update = (url, options = {}) => page.evaluate(args => window.updatePreview(args.url, args.options), { url, options });
    async function finish(path, fail = false) {
        for (let attempt = 0; !pending.has(path) && attempt < 100; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.ok(pending.has(path), `request for ${path}`);
        const route = pending.get(path);
        pending.delete(path);
        if (fail) await route.fulfill({ status: 404, body: '' });
        else await route.fulfill({ contentType: 'image/svg+xml', body: sheet });
    }
    const metrics = () => page.evaluate(() => {
        const box = document.querySelector('.sliderBubble');
        const container = box.firstElementChild;
        const media = container.querySelector('.finweb-seek-image');
        const text = container.querySelector('.chapterThumbTextContainer');
        const chapter = container.querySelector('.chapterThumbText-dim');
        const rect = media.getBoundingClientRect();
        return {
            width:rect.width, height:rect.height, gap:text.getBoundingClientRect().top - rect.bottom,
            background:getComputedStyle(container).backgroundColor,
            image:getComputedStyle(media).backgroundImage,
            position:getComputedStyle(media).backgroundPosition,
            size:getComputedStyle(media).backgroundSize,
            spinner:getComputedStyle(media, '::after').animationName,
            chapterVisible:getComputedStyle(chapter).display !== 'none',
            visible:!media.hidden, left:box.getBoundingClientRect().left,
            right:box.getBoundingClientRect().right,
            time:container.querySelector('h2').textContent,
            timeSize:getComputedStyle(container.querySelector('h2')).fontSize
        };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.updatePreview);
    for (const width of [360, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        for (const dir of ['ltr', 'rtl']) {
            await page.evaluate(direction => {
                document.documentElement.dir = direction;
                window.preview.reset();
            }, dir);
            const url = `/images/${width}-${dir}.svg`;
            await update(url, { chapter: 'A very long chapter name '.repeat(12), left: 9999 });
            let result = await metrics();
            assert.equal(result.width, 272);
            assert.equal(result.height, 153);
            assert.equal(result.gap, 0, 'no transparent seam while loading');
            assert.equal(result.background, 'rgb(31, 31, 31)');
            assert.equal(result.image, 'none');
            assert.equal(result.spinner, 'finweb-seek-spin');
            assert.ok(result.left >= 0 && result.right <= width, `preview fits the viewport (${dir}): ${JSON.stringify(result)}`);
            await finish(url);
            await page.waitForFunction(() => !document.querySelector('.finweb-seek-loading'));
            result = await metrics();
            assert.equal(result.gap, 0);
            assert.equal(result.spinner, 'none');
            assert.equal(result.size, '544px 306px');
            await update(url, { x: -320, time: '14:00' });
            result = await metrics();
            assert.equal(result.position, '-272px 0px');
            assert.equal(result.time, '14:00');
            assert.equal(result.timeSize, '16px');
            assert.equal(result.chapterVisible, false);
            assert.equal(requests.filter(path => path === url).length, 1);
        }
    }
    await update('/images/slow.svg');
    await update('/images/latest.svg', { chapter: 'Latest' });
    await finish('/images/latest.svg');
    await page.waitForFunction(() => !document.querySelector('.finweb-seek-loading'));
    await finish('/images/slow.svg');
    await page.waitForTimeout(50);
    assert.ok((await metrics()).image.includes('/images/latest.svg'));
    await update('/images/failure.svg', { chapter: 'Still here' });
    await finish('/images/failure.svg', true);
    await page.waitForFunction(() => document.querySelector('.finweb-seek-image').hidden);
    assert.equal((await metrics()).spinner, 'none');
    assert.equal(await page.locator('.chapterThumbText-dim').textContent(), 'Still here');
    await update('/images/chapter.svg', { chapterImage: true });
    await finish('/images/chapter.svg');
    await page.waitForFunction(() => !document.querySelector('.finweb-seek-loading'));
    const chapter = await metrics();
    assert.ok(Math.abs(chapter.height - 204) < 0.1, 'landscape chapter image is 85% of the original 30vh');
    assert.ok(Math.abs(chapter.width / chapter.height - 640 / 360) < 0.001);
    assert.equal(chapter.gap, 0);
    await update(null);
    assert.equal((await metrics()).visible, false);
    assert.equal((await metrics()).chapterVisible, false);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await update('/images/reduced.svg');
    assert.equal((await metrics()).spinner, 'none');
    await finish('/images/reduced.svg');
    assert.deepEqual(errors, []);
    console.log('PASS seek preview: 85% sprite geometry, opaque/no-gap loading, success/error, stale responses, chapter images, time-only, RTL/mobile and reduced motion; no screenshots');
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
/* eslint-enable compat/compat */
