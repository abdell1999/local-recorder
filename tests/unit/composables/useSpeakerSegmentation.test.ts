import { describe, it, expect, vi } from 'vitest'
import { useSpeakerSegmentation, type MinimalSegmentationWorker } from '../../../app/composables/useSpeakerSegmentation'

function createFakeWorker() {
  const worker: MinimalSegmentationWorker = {
    postMessage: vi.fn(),
    onmessage: null,
    onerror: null,
    terminate: vi.fn(),
  }
  return worker
}

describe('useSpeakerSegmentation', () => {
  it('moves to loading-model and posts a segment message', () => {
    const worker = createFakeWorker()
    const { state, segment } = useSpeakerSegmentation(() => worker)

    segment(new Float32Array([0.1]))

    expect(state.value).toBe('loading-model')
    expect(worker.postMessage).toHaveBeenCalledWith(
      { type: 'segment', audio: expect.any(Float32Array) },
      expect.any(Array),
    )
  })

  it('clones the audio buffer before posting so the original stays usable afterwards', () => {
    const worker = createFakeWorker()
    const { segment } = useSpeakerSegmentation(() => worker)
    const original = new Float32Array([0.1, 0.2, 0.3])

    segment(original)

    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    const [message, transferList] = (worker.postMessage as ReturnType<typeof vi.fn>).mock.calls[0] as [
      { audio: Float32Array },
      Transferable[],
    ]
    expect(message.audio).not.toBe(original)
    expect(Array.from(message.audio)).toEqual(Array.from(original))
    expect(transferList).toEqual([message.audio.buffer])
  })

  it('reflects progress and result messages from the worker', () => {
    const worker = createFakeWorker()
    const { state, segments, segment } = useSpeakerSegmentation(() => worker)
    segment(new Float32Array([0.1]))

    worker.onmessage?.({ data: { type: 'progress', status: 'segmenting' } } as MessageEvent)
    expect(state.value).toBe('segmenting')

    const resultSegments = [{ windowIndex: 0, localSpeakerId: 1, start: 0, end: 2, confidence: 0.9, globalSpeakerId: 0 }]
    worker.onmessage?.({ data: { type: 'result', segments: resultSegments } } as MessageEvent)
    expect(state.value).toBe('done')
    expect(segments.value).toEqual(resultSegments)
  })

  it('reflects the identifying-speakers status from the worker', () => {
    const worker = createFakeWorker()
    const { state, segment } = useSpeakerSegmentation(() => worker)
    segment(new Float32Array([0.1]))

    worker.onmessage?.({ data: { type: 'progress', status: 'identifying-speakers' } } as MessageEvent)

    expect(state.value).toBe('identifying-speakers')
  })

  it('reflects the chosen device when the worker reports it', () => {
    const worker = createFakeWorker()
    const { device, segment } = useSpeakerSegmentation(() => worker)
    segment(new Float32Array([0.1]))

    worker.onmessage?.({ data: { type: 'device', device: 'wasm' } } as MessageEvent)

    expect(device.value).toBe('wasm')
  })

  it('reflects error messages from the worker', () => {
    const worker = createFakeWorker()
    const { state, errorMessage, segment } = useSpeakerSegmentation(() => worker)
    segment(new Float32Array([0.1]))

    worker.onmessage?.({ data: { type: 'error', message: 'boom' } } as MessageEvent)

    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('boom')
  })

  it('treats a worker crash as an error', () => {
    const worker = createFakeWorker()
    const { state, errorMessage, segment } = useSpeakerSegmentation(() => worker)
    segment(new Float32Array([0.1]))

    worker.onerror?.(new Event('error') as ErrorEvent)

    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('worker-crashed')
  })

  it('resets download progress when the worker crashes mid-download', () => {
    const worker = createFakeWorker()
    const { downloadProgress, segment } = useSpeakerSegmentation(() => worker)
    segment(new Float32Array([0.1]))
    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 55 } } as MessageEvent)
    expect(downloadProgress.value).toBe(55)

    worker.onerror?.(new Event('error') as ErrorEvent)

    expect(downloadProgress.value).toBeNull()
  })

  it('retry terminates the old worker and creates a new one', () => {
    const firstWorker = createFakeWorker()
    const secondWorker = createFakeWorker()
    const factory = vi.fn().mockReturnValueOnce(firstWorker).mockReturnValueOnce(secondWorker)
    const { segment, retry } = useSpeakerSegmentation(factory)
    segment(new Float32Array([0.1]))

    retry(new Float32Array([0.1]))

    expect(firstWorker.terminate).toHaveBeenCalled()
    expect(secondWorker.postMessage).toHaveBeenCalled()
  })

  it('reflects model download progress messages from the worker', () => {
    const worker = createFakeWorker()
    const { downloadProgress, segment } = useSpeakerSegmentation(() => worker)
    segment(new Float32Array([0.1]))

    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 42 } } as MessageEvent)

    expect(downloadProgress.value).toBe(42)
  })

  it('resets download progress once segmenting starts', () => {
    const worker = createFakeWorker()
    const { downloadProgress, state, segment } = useSpeakerSegmentation(() => worker)
    segment(new Float32Array([0.1]))
    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 80 } } as MessageEvent)
    expect(downloadProgress.value).toBe(80)

    worker.onmessage?.({ data: { type: 'progress', status: 'segmenting' } } as MessageEvent)

    expect(state.value).toBe('segmenting')
    expect(downloadProgress.value).toBeNull()
  })

  it('resets download progress when the worker reports an error', () => {
    const worker = createFakeWorker()
    const { downloadProgress, segment } = useSpeakerSegmentation(() => worker)
    segment(new Float32Array([0.1]))
    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 30 } } as MessageEvent)

    worker.onmessage?.({ data: { type: 'error', message: 'boom' } } as MessageEvent)

    expect(downloadProgress.value).toBeNull()
  })

  it('reset clears state and segments', () => {
    const worker = createFakeWorker()
    const { state, segments, segment, reset } = useSpeakerSegmentation(() => worker)
    segment(new Float32Array([0.1]))
    worker.onmessage?.({ data: { type: 'result', segments: [{ windowIndex: 0, localSpeakerId: 1, start: 0, end: 2, confidence: 0.9, globalSpeakerId: 0 }] } } as MessageEvent)
    expect(state.value).toBe('done')
    reset()
    expect(state.value).toBe('idle')
    expect(segments.value).toEqual([])
  })
})
