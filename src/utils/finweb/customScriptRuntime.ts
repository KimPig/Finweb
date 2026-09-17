const SAFE_MODE_KEY = 'finweb.customJs.safeMode';

export function readSafeMode(search: string, storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): boolean {
    const requested = new URLSearchParams(search).get('finwebSafeMode');
    try {
        if (requested === '1') storage?.setItem(SAFE_MODE_KEY, '1');
        if (requested === '0') storage?.removeItem(SAFE_MODE_KEY);
        return requested === '1' || (requested !== '0' && storage?.getItem(SAFE_MODE_KEY) === '1');
    } catch {
        return requested === '1';
    }
}

export function isScriptExcludedPath(pathname: string): boolean {
    const normalized = pathname.replace(/^\/!\/?/, '/');
    return /^\/(dashboard(?:\/|$)|metadata(?:\/|$)|configurationpage(?:\/|$)|wizard|selectserver(?:\/|$)|addserver(?:\/|$))/.test(normalized.toLowerCase());
}

/** Runtime state lives outside React so rerenders and StrictMode cannot execute twice. */
export class CustomScriptRuntime {
    private server?: string;
    private attempted = false;
    private executed = false;

    constructor(private readonly safeMode: boolean) {}

    needsReload(server: string | undefined, pathname: string): boolean {
        const selectingServer = /^\/(selectserver|addserver)(\/|$)/i.test(pathname.replace(/^\/!\/?/, '/'));
        return this.executed && (Boolean(server && server !== this.server) || selectingServer);
    }

    claim(server: string, pathname: string): boolean {
        if (this.safeMode || isScriptExcludedPath(pathname)) return false;
        if (this.server !== server && !this.executed) {
            this.server = server;
            this.attempted = false;
        }
        if (this.attempted || this.executed) return false;
        this.attempted = true;
        return true;
    }

    markExecuted() {
        this.executed = true;
    }
}
