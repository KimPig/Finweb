export function supportsAssRendering() {
    return typeof WebAssembly !== 'undefined'
        && typeof Worker !== 'undefined'
        && typeof HTMLCanvasElement !== 'undefined';
}
