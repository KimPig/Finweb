const HIDDEN_KEY = 'finweb.mobileAppNotice.hidden.v1';

export function isMobileAppNoticeEligible(platform: { android?: boolean; iOS?: boolean; tv?: boolean }, pathname: string) {
    return !platform.tv && !!(platform.android || platform.iOS)
        && ['/home', '/login', '/selectserver', '/addserver'].includes(pathname);
}

export function isMobileAppNoticeDismissed() {
    // Storage may be unavailable in private browsing or embedded webviews.
    try {
        return window.localStorage.getItem(HIDDEN_KEY) === '1';
    } catch {
        return false;
    }
}

export function dismissMobileAppNotice(permanently: boolean) {
    if (permanently) {
        try {
            window.localStorage.setItem(HIDDEN_KEY, '1');
        } catch { /* Do not block closing when persistence is unavailable. */ }
    }
}
