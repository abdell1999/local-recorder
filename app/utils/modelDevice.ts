export type ModelDevice = 'webgpu' | 'wasm'

export async function loadWithDeviceFallback<T>(
  loadFn: (device: ModelDevice) => Promise<T>,
): Promise<{ result: T; device: ModelDevice }> {
  const canTryWebgpu = typeof navigator !== 'undefined' && 'gpu' in navigator
  if (canTryWebgpu) {
    try {
      return { result: await loadFn('webgpu'), device: 'webgpu' }
    } catch {
      // WebGPU existe pero falló al inicializar — se ignora y se
      // reintenta con WASM en vez de propagar el error.
    }
  }
  return { result: await loadFn('wasm'), device: 'wasm' }
}
