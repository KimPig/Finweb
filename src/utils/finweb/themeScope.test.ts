import { describe, expect, it } from 'vitest';
import { usesFinwebTheme } from './themeScope';

describe('Finweb theme scope', () => {
    it.each(['/dashboard', '/dashboard/branding', '/metadata', '/configurationpage', '/wizard/start', '/!/dashboard'])('keeps %s native', path => {
        expect(usesFinwebTheme(path)).toBe(false);
    });
    it.each(['/home', '/login', '/selectserver', '/list', '/details', '/video', '/!/home'])('themes %s', path => {
        expect(usesFinwebTheme(path)).toBe(true);
    });
});
