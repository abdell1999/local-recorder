import { describe, it, expect, vi } from 'vitest'
import { loadWithDeviceFallback } from '../../../app/utils/modelDevice'

describe('loadWithDeviceFallback', () => {
  it('uses webgpu when navigator.gpu is present and loadFn succeeds', async () => {
    vi.stubGlobal('navigator', { gpu: {} })
    const loadFn = vi.fn().mockResolvedValue('model-result')

    const { result, device } = await loadWithDeviceFallback(loadFn)

    expect(device).toBe('webgpu')
    expect(result).toBe('model-result')
    expect(loadFn).toHaveBeenCalledTimes(1)
    expect(loadFn).toHaveBeenCalledWith('webgpu')
  })

  it('falls back to wasm when navigator.gpu is present but the webgpu attempt fails', async () => {
    vi.stubGlobal('navigator', { gpu: {} })
    const loadFn = vi.fn().mockRejectedValueOnce(new Error('no adapter')).mockResolvedValueOnce('wasm-result')

    const { result, device } = await loadWithDeviceFallback(loadFn)

    expect(device).toBe('wasm')
    expect(result).toBe('wasm-result')
    expect(loadFn).toHaveBeenNthCalledWith(1, 'webgpu')
    expect(loadFn).toHaveBeenNthCalledWith(2, 'wasm')
  })

  it('uses wasm directly when navigator.gpu is absent', async () => {
    vi.stubGlobal('navigator', {})
    const loadFn = vi.fn().mockResolvedValue('wasm-result')

    const { result, device } = await loadWithDeviceFallback(loadFn)

    expect(device).toBe('wasm')
    expect(loadFn).toHaveBeenCalledTimes(1)
    expect(loadFn).toHaveBeenCalledWith('wasm')
  })

  it('propagates the error when both webgpu and wasm attempts fail', async () => {
    vi.stubGlobal('navigator', { gpu: {} })
    const loadFn = vi.fn().mockRejectedValue(new Error('boom'))

    await expect(loadWithDeviceFallback(loadFn)).rejects.toThrow('boom')
  })
})
