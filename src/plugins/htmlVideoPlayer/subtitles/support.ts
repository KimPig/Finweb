export function supportsJassub() {
    return typeof WebAssembly !== 'undefined'
        && typeof Worker !== 'undefined'
        && typeof OffscreenCanvas !== 'undefined'
        && typeof ResizeObserver !== 'undefined'
        && typeof HTMLCanvasElement !== 'undefined'
        && typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function';
}
