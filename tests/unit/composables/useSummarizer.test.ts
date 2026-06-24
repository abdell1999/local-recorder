import { describe, it, expect, vi } from 'vitest'
import { useSummarizer, type MinimalSummarizerWorker } from '../../../app/composables/useSummarizer'

function createFakeWorker() {
  const worker: MinimalSummarizerWorker = {
    postMessage: vi.fn(),
    onmessage: null,
    onerror: null,
    terminate: vi.fn(),
  }
  return worker
}

describe('useSummarizer', () => {
  it('moves to loading-model and posts a summarize message', () => {
    const worker = createFakeWorker()
    const { state, summarize } = useSummarizer(() => worker)

    summarize('hola mundo', '0.5b')

    expect(state.value).toBe('loading-model')
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'summarize', text: 'hola mundo', modelSize: '0.5b' })
  })

  it('reflects progress and result messages from the worker', () => {
    const worker = createFakeWorker()
    const { state, summary, summarize } = useSummarizer(() => worker)
    summarize('hola mundo', '0.5b')

    worker.onmessage?.({ data: { type: 'progress', status: 'summarizing' } } as MessageEvent)
    expect(state.value).toBe('summarizing')

    worker.onmessage?.({ data: { type: 'result', summary: 'TL;DR: hola' } } as MessageEvent)
    expect(state.value).toBe('done')
    expect(summary.value).toBe('TL;DR: hola')
  })

  it('reflects the chosen device when the worker reports it', () => {
    const worker = createFakeWorker()
    const { device, summarize } = useSummarizer(() => worker)
    summarize('hola mundo', '0.5b')

    worker.onmessage?.({ data: { type: 'device', device: 'wasm' } } as MessageEvent)

    expect(device.value).toBe('wasm')
  })

  it('reflects error messages from the worker', () => {
    const worker = createFakeWorker()
    const { state, errorMessage, summarize } = useSummarizer(() => worker)
    summarize('hola mundo', '0.5b')

    worker.onmessage?.({ data: { type: 'error', message: 'boom' } } as MessageEvent)

    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('boom')
  })

  it('treats a worker crash as an error', () => {
    const worker = createFakeWorker()
    const { state, errorMessage, summarize } = useSummarizer(() => worker)
    summarize('hola mundo', '0.5b')

    worker.onerror?.(new Event('error') as ErrorEvent)

    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('worker-crashed')
  })

  it('resets download progress when the worker crashes mid-download', () => {
    const worker = createFakeWorker()
    const { downloadProgress, summarize } = useSummarizer(() => worker)
    summarize('hola mundo', '0.5b')
    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 55 } } as MessageEvent)
    expect(downloadProgress.value).toBe(55)

    worker.onerror?.(new Event('error') as ErrorEvent)

    expect(downloadProgress.value).toBeNull()
  })

  it('retry terminates the old worker and creates a new one', () => {
    const firstWorker = createFakeWorker()
    const secondWorker = createFakeWorker()
    const factory = vi.fn().mockReturnValueOnce(firstWorker).mockReturnValueOnce(secondWorker)
    const { summarize, retry } = useSummarizer(factory)
    summarize('hola mundo', '0.5b')

    retry('hola mundo', '0.5b')

    expect(firstWorker.terminate).toHaveBeenCalled()
    expect(secondWorker.postMessage).toHaveBeenCalled()
  })

  it('reflects model download progress messages from the worker', () => {
    const worker = createFakeWorker()
    const { downloadProgress, summarize } = useSummarizer(() => worker)
    summarize('hola mundo', '0.5b')

    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 42 } } as MessageEvent)

    expect(downloadProgress.value).toBe(42)
  })

  it('resets download progress once summarizing starts', () => {
    const worker = createFakeWorker()
    const { downloadProgress, state, summarize } = useSummarizer(() => worker)
    summarize('hola mundo', '0.5b')
    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 80 } } as MessageEvent)
    expect(downloadProgress.value).toBe(80)

    worker.onmessage?.({ data: { type: 'progress', status: 'summarizing' } } as MessageEvent)

    expect(state.value).toBe('summarizing')
    expect(downloadProgress.value).toBeNull()
  })

  it('resets download progress when the worker reports an error', () => {
    const worker = createFakeWorker()
    const { downloadProgress, summarize } = useSummarizer(() => worker)
    summarize('hola mundo', '0.5b')
    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 30 } } as MessageEvent)

    worker.onmessage?.({ data: { type: 'error', message: 'boom' } } as MessageEvent)

    expect(downloadProgress.value).toBeNull()
  })
})
