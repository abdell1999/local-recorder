import { describe, it, expect, vi } from 'vitest'
import { useTranscription, type MinimalWorker } from '../../../app/composables/useTranscription'

function createFakeWorker() {
  const worker: MinimalWorker = {
    postMessage: vi.fn(),
    onmessage: null,
    onerror: null,
    terminate: vi.fn(),
  }
  return worker
}

describe('useTranscription', () => {
  it('moves to loading-model and posts a transcribe message', () => {
    const worker = createFakeWorker()
    const { state, transcribe } = useTranscription(() => worker)

    transcribe(new Float32Array([0.1]), 'small')

    expect(state.value).toBe('loading-model')
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'transcribe',
      audio: expect.any(Float32Array),
      modelSize: 'small',
    })
  })

  it('reflects progress and result messages from the worker', () => {
    const worker = createFakeWorker()
    const { state, text, chunks, transcribe } = useTranscription(() => worker)
    transcribe(new Float32Array([0.1]), 'small')

    worker.onmessage?.({ data: { type: 'progress', status: 'transcribing' } } as MessageEvent)
    expect(state.value).toBe('transcribing')

    worker.onmessage?.({
      data: { type: 'result', text: 'hola mundo', chunks: [{ text: 'hola mundo', timestamp: [0, 1] }] },
    } as MessageEvent)
    expect(state.value).toBe('done')
    expect(text.value).toBe('hola mundo')
    expect(chunks.value).toEqual([{ text: 'hola mundo', timestamp: [0, 1] }])
  })

  it('reflects the chosen device when the worker reports it', () => {
    const worker = createFakeWorker()
    const { device, transcribe } = useTranscription(() => worker)
    transcribe(new Float32Array([0.1]), 'small')

    worker.onmessage?.({ data: { type: 'device', device: 'wasm' } } as MessageEvent)

    expect(device.value).toBe('wasm')
  })

  it('reflects error messages from the worker', () => {
    const worker = createFakeWorker()
    const { state, errorMessage, transcribe } = useTranscription(() => worker)
    transcribe(new Float32Array([0.1]), 'small')

    worker.onmessage?.({ data: { type: 'error', message: 'boom' } } as MessageEvent)

    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('boom')
  })

  it('treats a worker crash as an error', () => {
    const worker = createFakeWorker()
    const { state, errorMessage, transcribe } = useTranscription(() => worker)
    transcribe(new Float32Array([0.1]), 'small')

    worker.onerror?.(new Event('error') as ErrorEvent)

    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('worker-crashed')
  })

  it('resets download progress when the worker crashes mid-download', () => {
    const worker = createFakeWorker()
    const { downloadProgress, transcribe } = useTranscription(() => worker)
    transcribe(new Float32Array([0.1]), 'small')
    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 55 } } as MessageEvent)
    expect(downloadProgress.value).toBe(55)

    worker.onerror?.(new Event('error') as ErrorEvent)

    expect(downloadProgress.value).toBeNull()
  })

  it('retry terminates the old worker and creates a new one', () => {
    const firstWorker = createFakeWorker()
    const secondWorker = createFakeWorker()
    const factory = vi.fn().mockReturnValueOnce(firstWorker).mockReturnValueOnce(secondWorker)
    const { transcribe, retry } = useTranscription(factory)
    transcribe(new Float32Array([0.1]), 'small')

    retry(new Float32Array([0.1]), 'small')

    expect(firstWorker.terminate).toHaveBeenCalled()
    expect(secondWorker.postMessage).toHaveBeenCalled()
  })

  it('reflects model download progress messages from the worker', () => {
    const worker = createFakeWorker()
    const { downloadProgress, transcribe } = useTranscription(() => worker)
    transcribe(new Float32Array([0.1]), 'small')

    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 42 } } as MessageEvent)

    expect(downloadProgress.value).toBe(42)
  })

  it('resets download progress once transcription starts', () => {
    const worker = createFakeWorker()
    const { downloadProgress, state, transcribe } = useTranscription(() => worker)
    transcribe(new Float32Array([0.1]), 'small')
    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 80 } } as MessageEvent)
    expect(downloadProgress.value).toBe(80)

    worker.onmessage?.({ data: { type: 'progress', status: 'transcribing' } } as MessageEvent)

    expect(state.value).toBe('transcribing')
    expect(downloadProgress.value).toBeNull()
  })

  it('resets download progress when the worker reports an error', () => {
    const worker = createFakeWorker()
    const { downloadProgress, transcribe } = useTranscription(() => worker)
    transcribe(new Float32Array([0.1]), 'small')
    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 30 } } as MessageEvent)

    worker.onmessage?.({ data: { type: 'error', message: 'boom' } } as MessageEvent)

    expect(downloadProgress.value).toBeNull()
  })
})
