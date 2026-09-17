export interface CustomScriptSettings {
    enabled: boolean;
    code: string;
    mode: 'code' | 'url' | 'both';
    url: string;
}

const MARKER = 'finweb-custom-js';
const EMPTY: CustomScriptSettings = { enabled: false, code: '', mode: 'code', url: '' };

export function isValidCustomScriptUrl(value: string): boolean {
    if (/\s/.test(value)) return false;
    try {
        const url = new URL(value);
        return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
    } catch {
        return false;
    }
}

/** Keep the saved text intact while validating and ordering one address per line. */
export function parseCustomScriptUrls(value: string): { urls: string[]; invalidLine?: number } {
    const urls = new Set<string>();
    const lines = value.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
        const url = lines[index].trim();
        if (!url) continue;
        if (!isValidCustomScriptUrl(url)) return { urls: [], invalidLine: index + 1 };
        urls.add(new URL(url).href);
    }
    return { urls: [...urls] };
}

/** Store UTF-8 JSON in a CSS comment, never raw JavaScript or CSS delimiters. */
export function writeCustomScript(css: string, settings: CustomScriptSettings): string {
    const cleanCss = readCustomScript(css).css;
    if (!settings.code && !settings.url && !settings.enabled && settings.mode === 'code') return cleanCss;
    const json = JSON.stringify({ version: 3, ...settings });
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `${cleanCss}\n/* ${MARKER}:v3:${btoa(binary)} */`;
}

export function readCustomScript(value = ''): {
    css: string;
    script: CustomScriptSettings;
    invalid: boolean;
} {
    const blocks = /\/\*\s*finweb-custom-js:([\s\S]*?)\*\//g;
    let script = { ...EMPTY };
    let invalid = false;
    let count = 0;
    const css = value.replace(blocks, (_block, payload: string) => {
        count++;
        try {
            const versioned = payload.trim();
            let version = 0;
            if (versioned.startsWith('v1:')) version = 1;
            else if (versioned.startsWith('v2:')) version = 2;
            else if (versioned.startsWith('v3:')) version = 3;
            if (!version) throw new Error('Unsupported settings version');
            const binary = atob(versioned.slice(3));
            const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
            // eslint-disable-next-line compat/compat -- fast-text-encoding is loaded by lib/legacy before application startup.
            const decoded: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
            if (!decoded || typeof decoded !== 'object') throw new Error('Invalid settings');
            const data = decoded as Record<string, unknown>;
            if (data.version !== version || typeof data.enabled !== 'boolean' || typeof data.code !== 'string') {
                throw new Error('Invalid settings');
            }
            if (version >= 2 && ((data.mode !== 'code' && data.mode !== 'url' && !(version === 3 && data.mode === 'both')) || typeof data.url !== 'string')) {
                throw new Error('Invalid script source');
            }
            script = {
                enabled: data.enabled,
                code: data.code,
                mode: version >= 2 ? data.mode as CustomScriptSettings['mode'] : 'code',
                url: version >= 2 ? data.url as string : ''
            };
        } catch {
            invalid = true;
        }
        return '';
    }).trimEnd();
    // Ambiguous or damaged settings must never execute.
    if (invalid || count > 1) return { css, script: { ...EMPTY }, invalid: true };
    return { css, script, invalid: false };
}
