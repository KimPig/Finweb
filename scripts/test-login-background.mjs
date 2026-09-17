// Local Chromium checks; no screenshots or real server requests.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const source = await readFile(process.argv[2], 'utf8');
assert.ok(source.includes("'YOUR_JSON_URL'"), 'Test a template, never a private server script');
const code = source.replace("'YOUR_JSON_URL'", "'https://fixture.test/list'")
    .replace('INTERVAL_MS = 10000', 'INTERVAL_MS = 80').replace('delay = 5000', 'delay = 100');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage();
    let lists = 0;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWuoAAAAASUVORK5CYII=', 'base64');
    await page.route('https://fixture.test/**', route => {
        if (route.request().url().endsWith('/list')) {
            lists++;
            return route.fulfill({ status: lists === 1 ? 503 : 200, contentType: 'application/json', body: JSON.stringify({ images: ['https://fixture.test/1.png', 'https://fixture.test/2.png'] }) });
        }
        if (route.request().url().endsWith('.png')) return route.fulfill({ contentType: 'image/png', body: png });
        return route.fulfill({ contentType: 'text/html', body: '<html><body><main>Home</main></body></html>' });
    });
    await page.goto('https://fixture.test/');
    await page.addScriptTag({ content: code });
    await page.waitForTimeout(3400);
    assert.equal(lists, 0, 'Home does not fetch a login image list');
    const showLogin = () => page.evaluate(() => {
        const login = document.createElement('div');
        login.id = 'loginPage';
        login.style.cssText = 'position:relative;height:500px';
        login.textContent = 'Login';
        document.body.append(login);
    });
    await showLogin();
    await page.waitForFunction(() => !!document.querySelector('#login-bg-host > .show'));
    assert.equal(lists, 2, 'Failed JSON fetch retries instead of permanently disabling the background');
    assert.deepEqual(await page.locator('#login-bg-host').evaluate(el => {
        const box = el.getBoundingClientRect();
        return [el.parentElement === document.body, getComputedStyle(el).position, box.x, box.y, box.width === window.innerWidth, box.height === window.innerHeight];
    }), [true, 'fixed', 0, 0, true, true], 'Background covers the header and is independent of the login content box');
    await page.locator('#loginPage').evaluate(el => {
        el.style.marginLeft = '250px';
        el.style.width = '400px';
    });
    assert.equal(await page.locator('#login-bg-host').evaluate(el => el.getBoundingClientRect().width === window.innerWidth), true);
    await page.addScriptTag({ content: code });
    assert.equal(await page.locator('#login-bg-host').count(), 1, 'Reinjection does not duplicate timers or layers');
    await page.locator('#loginPage').evaluate(el => {
        el.style.display = 'none';
    });
    await page.waitForFunction(() => !document.getElementById('login-bg-host'));
    await page.locator('#loginPage').evaluate(el => el.remove());
    await showLogin();
    await page.waitForFunction(() => !!document.querySelector('#login-bg-host > .show'));
    assert.equal(lists, 2, 'Returning to login reuses the successfully loaded list');
    const first = await page.locator('#login-bg-host > .show').evaluate(el => el.style.backgroundImage);
    await page.waitForFunction(previous => document.querySelector('#login-bg-host > .show')?.style.backgroundImage !== previous, first);
    assert.equal(await page.locator('#login-bg-host > .show').count(), 1);
    await page.evaluate(() => {
        document.body.classList.add('finweb-modern-layout');
        document.documentElement.setAttribute('data-finweb-login', '');
    });
    await page.waitForTimeout(50);
    const hiddenBeforeCleanup = await page.evaluate(() => {
        document.documentElement.removeAttribute('data-finweb-login');
        return getComputedStyle(document.getElementById('login-bg-host')).display;
    });
    assert.equal(hiddenBeforeCleanup, 'none', 'Route handoff hides the background before its observer runs');
    await page.waitForFunction(() => !document.getElementById('login-bg-host'));
    await page.evaluate(() => document.documentElement.setAttribute('data-finweb-login', ''));
    await page.waitForFunction(() => !!document.querySelector('#login-bg-host > .show'));
    assert.deepEqual(errors, []);
    console.log('PASS late login, JSON failure/retry, one-time initialization, hidden-page cleanup, new login node and image rotation');
} finally {
    await browser.close();
}
