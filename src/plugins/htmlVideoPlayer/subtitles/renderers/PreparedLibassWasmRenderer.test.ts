import { afterEach, expect, it, vi } from 'vitest';
import type { SubtitleLoadRequest } from '../types';

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('./AssRendererAdapter', () => ({ createAssRendererAdapter: mocks.create }));

import { createPreparedLibassWasmRenderer } from './PreparedLibassWasmRenderer';

const createUrl = vi.fn();
const revokeUrl = vi.fn();
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.resetAllMocks();
});

function prepare() {
    URL.createObjectURL = createUrl.mockReturnValueOnce('blob:default').mockReturnValueOnce('blob:attachment');
    URL.revokeObjectURL = revokeUrl;
    return createPreparedLibassWasmRenderer({
        video: document.createElement('video'), content: 'ASS',
        fonts: [new Uint8Array([1, 2])], defaultFont: new Uint8Array([3, 4]),
        baseOffset: 0, targetFps: 24, request: {} as SubtitleLoadRequest
    });
}

it('supplies the prepared fallback font without a separate worker font download and releases it once', async () => {
    const dispose = vi.fn();
    mocks.create.mockResolvedValue({ dispose });
    const renderer = await prepare();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
        fonts: ['blob:default', 'blob:attachment'], fallbackFont: 'blob:default'
    }));
    expect(revokeUrl).not.toHaveBeenCalled();
    renderer.dispose();
    renderer.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(revokeUrl.mock.calls.flat()).toEqual(['blob:default', 'blob:attachment']);
});

it('releases both prepared fonts when renderer creation fails', async () => {
    mocks.create.mockRejectedValue(new Error('worker failed'));
    await expect(prepare()).rejects.toThrow('worker failed');
    expect(revokeUrl.mock.calls.flat()).toEqual(['blob:default', 'blob:attachment']);
});
