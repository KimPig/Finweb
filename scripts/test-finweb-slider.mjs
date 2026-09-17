/* eslint-disable compat/compat -- Chromium geometry and CSS checks, without screenshots. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { compile } from 'sass';
import postcss from 'postcss';

const root = fileURLToPath(new URL('../', import.meta.url));
const stubs = {
    '/scripts/browser': 'export default {};',
    '/utils/dom': 'export default {addEventListener:(el,type,fn,options)=>el.addEventListener(type,fn,options),parentWithClass:(el,name)=>el.parentElement.closest("."+name)};',
    '/components/layoutManager': 'export default {mobile:false,tv:false};',
    '/scripts/keyboardNavigation': 'export default {getKeyName:e=>e.key};',
    '/scripts/keyboardnavigation': 'export default {getKeyName:e=>e.key};',
    '/lib/globalize': 'export default {getIsRTL:()=>document.documentElement.dir==="rtl",getIsElementRTL:()=>document.documentElement.dir==="rtl"};',
    '/emby-input/emby-input': ''
};
const bundle = await build({
    absWorkingDir: root, bundle: true, write: false, format: 'iife',
    plugins: [{ name: 'slider-fixture', setup(builder) {
        builder.onResolve({ filter: /.*/ }, args => {
            if (args.path.endsWith('.scss') || args.path.startsWith('webcomponents.js/')) return { path: args.path, namespace: 'stub', pluginData: '' };
            const entry = Object.entries(stubs).find(([suffix]) => args.path.endsWith(suffix));
            if (entry) return { path: args.path, namespace: 'stub', pluginData: entry[1] };
        });
        builder.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: args.pluginData, loader: 'js' }));
    } }],
    stdin: { resolveDir: root, contents: `
import './src/elements/emby-slider/emby-slider';
import SeekPreview from './src/plugins/finwebPlayer/SeekPreview';
window.makePreview=()=>new SeekPreview();
for (const name of ['osdPositionSlider','osdVolumeSlider']) {
 const row=document.createElement('div');row.className='sliderContainer';row.style.cssText='width:100%;margin:60px 0';
 row.innerHTML='<div class="sliderMarkerContainer"></div>';
 const input=document.createElement('input');input.type='range';input.min='0';input.max='100';input.step='0.01';input.className=name;
 input.dataset.sliderKeepProgress=String(name==='osdPositionSlider');
 Object.setPrototypeOf(input,window.sliderPrototype);row.appendChild(input);document.body.appendChild(row);
 input.attachedCallback();input.enableKeyboardDragging();input.value='25';
}
window.ready=true;
` }
});
const baseCss = compile(`${root}/src/elements/emby-slider/emby-slider.scss`).css;
const previewCss = compile(`${root}/src/styles/videoosd.scss`).css;
const finwebCss = compile(`${root}/src/styles/finweb.scss`).css;
const rules = postcss.parse(finwebCss);
for (const pseudo of ['::-webkit-slider-thumb', '::-moz-range-thumb']) {
    const baseRules = [];
    rules.walkRules(rule => {
        if (rule.selector.includes('.mdl-slider:is(.osdPositionSlider, .osdVolumeSlider)') && rule.selector.endsWith(pseudo) && !rule.selector.includes(':hover') && rule.parent.type !== 'atrule') baseRules.push(rule);
    });
    assert.equal(baseRules.length, 1);
    const values = Object.fromEntries(baseRules[0].nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
    assert.equal(values.width, '8px');
    assert.equal(values.height, '20px');
    assert.equal(values.transform, 'scaleY(0.5)');
    assert.equal(values.transition, 'transform 200ms ease, background-color 200ms ease');
    const hoverRules = [];
    rules.walkRules(rule => {
        if (rule.selector.includes('.mdl-slider:is(.osdPositionSlider, .osdVolumeSlider)') && rule.selector.includes(':hover') && rule.selector.includes(pseudo)) hoverRules.push(rule);
    });
    assert.equal(hoverRules.length, 1);
    assert.ok(hoverRules[0].nodes.some(node => node.prop === 'transform' && node.value === 'scaleY(1)'));
}
const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/fixture.js' ? 'text/javascript' : 'text/html');
    response.end(request.url === '/fixture.js' ? bundle.outputFiles[0].text : `<!doctype html><html data-finweb-theme dir="ltr"><style>${baseCss}${previewCss}${finwebCss}body{margin:30px;font:16px sans-serif}.hide{display:none}</style><body><script>document.registerElement=(_,options)=>{window.sliderPrototype=options.prototype;};</script><script src="/fixture.js"></script></body></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.ready);
    for (const width of [360, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        for (const dir of ['ltr', 'rtl']) {
            await page.evaluate(value => {
                document.documentElement.dir = value;
            }, dir);
            for (const name of ['osdPositionSlider', 'osdVolumeSlider']) {
                const input = page.locator(`.${name}`);
                for (const value of [0, 25, 50, 75, 100]) {
                    await input.evaluate((el, next) => {
                        el.value = String(next);
                        el.dispatchEvent(new Event('valueset'));
                        return new Promise(requestAnimationFrame);
                    }, value);
                    const metrics = await input.evaluate(el => {
                        const rect = el.getBoundingClientRect();
                        const track = el.sliderBubbleTrack.getBoundingClientRect();
                        const marker = el.markerContainerElement.getBoundingClientRect();
                        const fill = el.backgroundLower.getBoundingClientRect();
                        const rtl = document.documentElement.dir === 'rtl';
                        const fraction = Number(el.value) / 100;
                        return { left: rect.left, right: rect.right, trackLeft: track.left, trackRight: track.right, markerLeft: marker.left, markerRight: marker.right, fillEnd: rtl ? fill.left : fill.right, thumbCenter: rect.left + 4 + (rect.width - 8) * (rtl ? 1 - fraction : fraction) };
                    });
                    assert.ok(Math.abs(metrics.trackLeft - metrics.left - 4) < 0.1);
                    assert.ok(Math.abs(metrics.right - metrics.trackRight - 4) < 0.1);
                    assert.equal(metrics.markerLeft, metrics.trackLeft);
                    assert.equal(metrics.markerRight, metrics.trackRight);
                    assert.ok(Math.abs(metrics.fillEnd - metrics.thumbCenter) < 0.2, `${name} fill/handle alignment at ${value}% (${dir}): ${JSON.stringify(metrics)}`);
                }
                if (dir === 'ltr') {
                    const bounds = await input.boundingBox();
                    for (const value of [0, 25, 75, 100]) {
                        await page.mouse.click(bounds.x + 4 + (bounds.width - 8) * value / 100, bounds.y + bounds.height / 2);
                        const actual = Number(await input.inputValue());
                        assert.ok(Math.abs(actual - value) < 0.6, `Native pointer position matches the time coordinate: ${actual} vs ${value}`);
                    }
                    await input.evaluate(el => {
                        el.value = '50';
                        el.classList.add('show-focus');
                    });
                    await input.focus();
                    await input.press('ArrowRight');
                    assert.ok(Number(await input.inputValue()) > 50);
                    await input.press('Enter');
                }
            }
        }
    }
    const tracking = await page.evaluate(async () => {
        document.documentElement.dir = 'ltr';
        const input = document.querySelector('.osdPositionSlider');
        const bubble = input.sliderBubbleTrack.querySelector('.sliderBubble');
        const track = input.sliderBubbleTrack.getBoundingClientRect();
        const nextFrame = () => new Promise(requestAnimationFrame);
        const move = fraction => input.dispatchEvent(new PointerEvent('pointermove', {
            pointerType: 'mouse', clientX: track.left + track.width * fraction
        }));
        input.getBubbleHtml = percent => {
            return `<h1 class="sliderBubbleText">${Math.round(percent)}</h1>`;
        };
        input.dispatchEvent(new Event('change'));
        move(0.5);
        await nextFrame();
        const result = { text: bubble.textContent };
        result.gap = track.top - bubble.getBoundingClientRect().bottom;
        move(1);
        await nextFrame();
        move(1);
        await nextFrame();
        result.right = bubble.getBoundingClientRect().right;
        result.trackRight = track.right;
        input.dispatchEvent(new PointerEvent('pointerleave'));
        await nextFrame();
        result.hiddenOnLeave = bubble.classList.contains('hide');
        const preview = window.makePreview();
        input.updateBubbleHtml = (box, value) => {
            preview.update(box, `${value.toFixed(2)}:00`, '');
            return true;
        };
        move(0.5);
        await nextFrame();
        result.previewGap = track.top - bubble.getBoundingClientRect().bottom;
        delete input.updateBubbleHtml;
        preview.reset();
        input.detachedCallback();
        return result;
    });
    assert.equal(tracking.text, '50');
    assert.ok(tracking.right <= tracking.trackRight + 0.1, 'original slider clamps the visible content width');
    assert.equal(tracking.gap, 16, 'plain time-only bubble keeps a fixed gap');
    assert.equal(tracking.previewGap, 16, 'preview without an image uses the same gap');
    assert.equal(tracking.hiddenOnLeave, true);
    assert.deepEqual(errors, []);
    console.log('PASS OSD seek/volume geometry, LTR/RTL pointer/keyboard input, original hover positioning and time-only spacing; no screenshots');
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
/* eslint-enable compat/compat */
