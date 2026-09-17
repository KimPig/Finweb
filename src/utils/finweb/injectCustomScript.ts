import { isValidCustomScriptUrl, parseCustomScriptUrls } from './customScriptSettings';

/** Wait for each dependency before inserting the next; stop on load failure or navigation. */
export async function loadCustomScripts(value: string, canContinue: () => boolean): Promise<boolean> {
    const { urls, invalidLine } = parseCustomScriptUrls(value);
    if (invalidLine || !urls.length) {
        console.warn('[Finweb] External JS list is invalid; no scripts were loaded.', invalidLine);
        return false;
    }
    for (let index = 0; index < urls.length; index++) {
        if (!canContinue()) return false;
        const loaded = await new Promise<boolean>(resolve => {
            const element = loadCustomScript(urls[index]);
            if (!element) {
                resolve(false);
                return;
            }
            element.dataset.finwebCustomJsIndex = String(index + 1);
            element.addEventListener('load', () => resolve(true), { once: true });
            element.addEventListener('error', () => resolve(false), { once: true });
        });
        if (!loaded) {
            console.warn(`[Finweb] External JS entry ${index + 1} failed; remaining scripts were not loaded.`);
            return false;
        }
    }
    return true;
}

/** Classic scripts support cross-origin hosting without requiring CORS on the JS file. */
export function loadCustomScript(url: string): HTMLScriptElement | undefined {
    if (!isValidCustomScriptUrl(url)) {
        console.warn('[Finweb] External JS URL is invalid. Use an absolute HTTP(S) address without credentials.');
        return undefined;
    }
    const element = document.createElement('script');
    element.dataset.finwebCustomJs = 'true';
    element.dataset.finwebCustomJsStatus = 'loading';
    element.async = true;
    element.src = url;
    element.onload = () => {
        element.dataset.finwebCustomJsStatus = 'loaded';
        console.info('[Finweb] External JS loaded. Check the console for script runtime errors and asynchronous request failures.');
    };
    element.onerror = () => {
        element.dataset.finwebCustomJsStatus = 'error';
        console.warn('[Finweb] External JS could not be loaded. Check the URL, network, HTTPS and Content Security Policy.');
    };
    document.body.appendChild(element);
    return element;
}

/** Keep the original global scope and directives; never evaluate code with eval/Function. */
export function injectCustomScript(code: string): HTMLScriptElement {
    const element = document.createElement('script');
    element.dataset.finwebCustomJs = 'true';
    element.dataset.finwebCustomJsStatus = 'injected';
    element.textContent = code
        + '\n;document.currentScript && (document.currentScript.dataset.finwebCustomJsStatus = "completed");'
        + '\n//# sourceURL=finweb-custom.js';

    const onError = () => {
        element.dataset.finwebCustomJsStatus = 'error';
    };
    window.addEventListener('error', onError);
    try {
        document.body.appendChild(element);
    } finally {
        window.removeEventListener('error', onError);
    }

    if (element.dataset.finwebCustomJsStatus === 'completed') {
        console.info('[Finweb] Custom JS: synchronous execution completed. This does not confirm asynchronous image or network requests.');
    } else {
        console.warn('[Finweb] Custom JS did not complete. Check finweb-custom.js errors and Content Security Policy messages in the console.');
    }
    return element;
}
