/** Management and setup always retain Jellyfin's native styling. */
export function usesFinwebTheme(pathname: string): boolean {
    const path = pathname.replace(/^\/!\/?/, '/').toLowerCase();
    return !/^\/(dashboard|metadata|configurationpage|wizard)(\/|$)/.test(path);
}
