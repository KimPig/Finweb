import { afterEach, expect, it, vi } from 'vitest';
import { supportsAssRendering } from './support';

afterEach(() => vi.unstubAllGlobals());

it('supports libass canvas rendering without the retired offscreen-canvas requirement', () => {
    vi.stubGlobal('Worker', class {});
    vi.stubGlobal('WebAssembly', {});
    vi.stubGlobal('OffscreenCanvas', undefined);
    expect(supportsAssRendering()).toBe(true);
});

it.each(['Worker', 'WebAssembly', 'HTMLCanvasElement'])('does not advertise ASS without %s', feature => {
    vi.stubGlobal('Worker', class {});
    vi.stubGlobal('WebAssembly', {});
    vi.stubGlobal(feature, undefined);
    expect(supportsAssRendering()).toBe(false);
});
