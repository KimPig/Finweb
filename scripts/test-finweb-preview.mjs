/* eslint-disable compat/compat -- This browser test runs in Node and current Chromium. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true });
const previewUrl = process.env.FINWEB_PREVIEW_URL || 'http://127.0.0.1:8097';
try {
    for (const { width, diagnosticQuery } of [
        { width: 1280, diagnosticQuery: '' },
        { width: 390, diagnosticQuery: '?subtitleDiagnostics=1' }
    ]) {
        const context = await browser.newContext({ viewport: { width, height: 844 } });
        const page = await context.newPage();
        const errors = [];
        const consoleMessages = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => consoleMessages.push(message.text()));
        await page.goto(`${previewUrl}/${diagnosticQuery}`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.body.innerText.trim().length > 10);
        assert.deepEqual(errors, []);
        assert.ok(consoleMessages.some(message => message.includes(`version: Finweb ${metadata.finwebVersion}`)), 'Built preview reports the current Finweb version');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        assert.equal(overflow, false, `No horizontal overflow at ${width}px`);
        await page.waitForFunction(() => !!window.finwebSubtitleDiagnostics);
        assert.equal(await page.evaluate(() => window.finwebSubtitleDiagnostics.snapshot().schema), 2);
        assert.equal(await page.evaluate(() => window.finwebSubtitleDiagnostics.snapshot().enabled), !!diagnosticQuery);
        assert.equal(await page.getByRole('dialog').count(), 0, 'Desktop UA must not trigger a mobile notice at narrow widths');
        console.log(`PASS built preview startup at ${width}px ${diagnosticQuery}, no page errors or overflow; no login or screenshots`);
        await context.close();
    }
    for (const { name, width, userAgent } of [
        { name: 'Android', width: 320, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' },
        { name: 'iPhone', width: 390, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
        { name: 'iPad desktop UA', width: 768, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' }
    ]) {
        const context = await browser.newContext({ viewport: { width, height: width === 320 ? 568 : 844 }, userAgent, hasTouch: true, locale: 'ko-KR' });
        if (name === 'iPad desktop UA') {
            await context.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }));
        }
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${previewUrl}/#/selectserver`, { waitUntil: 'networkidle' });
        const dialog = page.getByRole('dialog');
        await dialog.waitFor({ state: 'visible' });
        assert.ok((await dialog.textContent()).includes('웹 브라우저나 Jellyfin 모바일 앱에서도 이용할 수 있습니다.'));
        assert.deepEqual(await dialog.locator('a').evaluateAll(links => links.map(link => link.href)), [
            'https://play.google.com/store/apps/details?id=dev.jdtech.jellyfin',
            'https://apps.apple.com/app/swiftfin/id1604098728'
        ]);
        assert.ok(await dialog.evaluate(element => {
            const elements = [element, ...element.querySelectorAll('a, button, .MuiFormControlLabel-root')];
            return elements.every(item => {
                const bounds = item.getBoundingClientRect();
                return bounds.left >= 0 && bounds.right <= window.innerWidth && bounds.top >= 0
                    && bounds.bottom <= window.innerHeight && item.scrollWidth <= item.clientWidth + 1;
            });
        }), `${name}: dialog and controls fit without clipping`);
        await dialog.locator('.MuiDialogActions-root button').click();
        await dialog.waitFor({ state: 'hidden' });
        await page.evaluate(() => {
            window.location.hash = '#/addserver';
        });
        await page.waitForURL('**/#/addserver');
        assert.equal(await page.getByRole('dialog').count(), 0, 'Close survives in-app navigation');
        await page.reload({ waitUntil: 'networkidle' });
        await page.getByRole('dialog').waitFor({ state: 'visible' });
        const nextSession = await context.newPage();
        await nextSession.goto(`${previewUrl}/#/selectserver`, { waitUntil: 'networkidle' });
        await nextSession.getByRole('dialog').waitFor({ state: 'visible' });
        await nextSession.getByRole('checkbox').check();
        await nextSession.getByRole('dialog').locator('.MuiDialogActions-root button').click();
        await nextSession.reload({ waitUntil: 'networkidle' });
        assert.equal(await nextSession.getByRole('dialog').count(), 0, 'Opt-out survives reload');
        const permanentSession = await context.newPage();
        await permanentSession.goto(`${previewUrl}/#/selectserver`, { waitUntil: 'networkidle' });
        assert.equal(await permanentSession.getByRole('dialog').count(), 0, 'Opt-out survives a new tab');
        assert.deepEqual(errors, []);
        console.log(`PASS ${name}: both stores, layout bounds, close until reload and permanent opt-out; no login or screenshots`);
        await context.close();
    }
} finally {
    await browser.close();
}
/* eslint-enable compat/compat */
