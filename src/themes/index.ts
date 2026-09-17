import { createTheme } from '@mui/material/styles';

import { DEFAULT_THEME_OPTIONS } from './_base/theme';
import appletv from './appletv';
import blueradiance from './blueradiance';
import dark from './dark';
import light from './light';
import purplehaze from './purplehaze';
import wmc from './wmc';

/** The default theme containing all color scheme variants. */
const options = {
    cssVariables: {
        cssVarPrefix: 'jf',
        colorSchemeSelector: '[data-theme="%s"]',
        disableCssColorScheme: true
    },
    defaultColorScheme: 'dark' as const,
    ...DEFAULT_THEME_OPTIONS,
    colorSchemes: {
        appletv,
        blueradiance,
        dark,
        light,
        purplehaze,
        wmc
    }
};

const DEFAULT_THEME = createTheme(options);

/** The management UI keeps the upstream theme; only user pages use Finweb. */
export const finwebTheme = createTheme({
    ...options,
    shape: { borderRadius: 0 },
    colorSchemes: {
        ...options.colorSchemes,
        dark: {
            ...dark,
            palette: {
                ...dark.palette,
                primary: { main: '#4589ff', dark: '#2474ff', light: '#78a9ff', contrastText: '#fff' },
                secondary: { main: '#4589ff', dark: '#2474ff', light: '#78a9ff', contrastText: '#fff' },
                background: { default: '#161616', paper: '#262626' },
                AppBar: { defaultBg: '#262626' }
            }
        }
    }
});

export default DEFAULT_THEME;
