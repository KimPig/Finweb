
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true });
try {
    for (const width of [1280, 390]) {
        const context = await browser.newContext({ viewport: { width, height: 844 } });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const diagnosticQuery = width === 390 ? '?subtitleDiagnostics=1' : '';
        await page.goto(`http://127.0.0.1:8097/${diagnosticQuery}`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.body.innerText.trim().length > 10);
        assert.deepEqual(errors, []);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        assert.equal(overflow, false, `No horizontal overflow at ${width}px`);
        await page.waitForFunction(() => !!window.finwebSubtitleDiagnostics);
        assert.equal(await page.evaluate(() => window.finwebSubtitleDiagnostics.snapshot().schema), 2);
        assert.equal(await page.evaluate(() => window.finwebSubtitleDiagnostics.snapshot().enabled), width === 390);
        console.log(`PASS built preview startup at ${width}px, no page errors or overflow; no login or screenshots`);
        await context.close();
    }
} finally {
    await browser.close();
}
