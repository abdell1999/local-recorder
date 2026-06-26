import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
    expect(worker.postMessage).toHaveBeenCalledWith(
      { type: 'transcribe', audio: expect.any(Float32Array), modelSize: 'small', language: 'auto' },
      expect.any(Array),
    )
  })

  it('clones the audio buffer before posting so the original stays usable for a future retry', () => {
    const worker = createFakeWorker()
    const { transcribe } = useTranscription(() => worker)
    const original = new Float32Array([0.1, 0.2, 0.3])

    transcribe(original, 'small')

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

  it('passes the specified language to the worker', () => {
    const worker = createFakeWorker()
    const { transcribe } = useTranscription(() => worker)
    transcribe(new Float32Array([0.1]), 'small', 'es')
    expect(worker.postMessage).toHaveBeenCalledWith(
      { type: 'transcribe', audio: expect.any(Float32Array), modelSize: 'small', language: 'es' },
      expect.any(Array),
    )
  })

  it('resets download progress when the worker reports an error', () => {
    const worker = createFakeWorker()
    const { downloadProgress, transcribe } = useTranscription(() => worker)
    transcribe(new Float32Array([0.1]), 'small')
    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 30 } } as MessageEvent)

    worker.onmessage?.({ data: { type: 'error', message: 'boom' } } as MessageEvent)

    expect(downloadProgress.value).toBeNull()
  })

  describe('timing', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('starts elapsed timer when transcription-start message arrives', () => {
      const worker = createFakeWorker()
      const { elapsedSeconds, transcribe } = useTranscription(() => worker)
      transcribe(new Float32Array([0.1]), 'small')

      worker.onmessage?.({ data: { type: 'transcription-start', audioDuration: 60, totalChunks: 3 } } as MessageEvent)
      vi.advanceTimersByTime(5000)

      expect(elapsedSeconds.value).toBe(5)
    })

    it('computes ETA from chunk-progress when elapsed > 0', () => {
      const worker = createFakeWorker()
      const { eta, transcribe } = useTranscription(() => worker)
      transcribe(new Float32Array([0.1]), 'small')

      worker.onmessage?.({ data: { type: 'transcription-start', audioDuration: 60, totalChunks: 3 } } as MessageEvent)
      vi.advanceTimersByTime(10000)

      worker.onmessage?.({ data: { type: 'chunk-progress', done: 2, total: 8 } } as MessageEvent)
      // 10s elapsed, 2/8 done → 5s per segment, 6 remaining → ETA = 30s
      expect(eta.value).toBe(30)
    })

    it('stores chunkProgress when chunk-progress message arrives', () => {
      const worker = createFakeWorker()
      const { chunkProgress, transcribe } = useTranscription(() => worker)
      transcribe(new Float32Array([0.1]), 'small')

      worker.onmessage?.({ data: { type: 'transcription-start', audioDuration: 10, totalChunks: 1 } } as MessageEvent)
      worker.onmessage?.({ data: { type: 'chunk-progress', done: 3, total: 8 } } as MessageEvent)

      expect(chunkProgress.value).toEqual({ done: 3, total: 8 })
    })

    it('saves transcriptionDuration and stops timer when result arrives', () => {
      const worker = createFakeWorker()
      const { transcriptionDuration, elapsedSeconds, transcribe } = useTranscription(() => worker)
      transcribe(new Float32Array([0.1]), 'small')

      worker.onmessage?.({ data: { type: 'transcription-start', audioDuration: 60, totalChunks: 3 } } as MessageEvent)
      vi.advanceTimersByTime(45000)

      worker.onmessage?.({ data: { type: 'result', text: 'hola', chunks: [] } } as MessageEvent)
      expect(transcriptionDuration.value).toBe(45)

      // Timer should be stopped — advancing time no longer increments elapsed
      vi.advanceTimersByTime(5000)
      expect(elapsedSeconds.value).toBe(45)
    })

    it('stops timer and clears eta/chunkProgress on result', () => {
      const worker = createFakeWorker()
      const { eta, chunkProgress, transcribe } = useTranscription(() => worker)
      transcribe(new Float32Array([0.1]), 'small')

      worker.onmessage?.({ data: { type: 'transcription-start', audioDuration: 30, totalChunks: 2 } } as MessageEvent)
      vi.advanceTimersByTime(5000)
      worker.onmessage?.({ data: { type: 'chunk-progress', done: 2, total: 8 } } as MessageEvent)
      expect(eta.value).not.toBeNull()
      expect(chunkProgress.value).not.toBeNull()

      worker.onmessage?.({ data: { type: 'result', text: 'ok', chunks: [] } } as MessageEvent)
      expect(eta.value).toBeNull()
      expect(chunkProgress.value).toBeNull()
    })

    it('stops timer on worker error', () => {
      const worker = createFakeWorker()
      const { elapsedSeconds, transcribe } = useTranscription(() => worker)
      transcribe(new Float32Array([0.1]), 'small')

      worker.onmessage?.({ data: { type: 'transcription-start', audioDuration: 60, totalChunks: 3 } } as MessageEvent)
      vi.advanceTimersByTime(10000)

      worker.onmessage?.({ data: { type: 'error', message: 'boom' } } as MessageEvent)
      vi.advanceTimersByTime(5000)
      expect(elapsedSeconds.value).toBe(10)
    })

    it('stops timer on worker crash', () => {
      const worker = createFakeWorker()
      const { elapsedSeconds, transcribe } = useTranscription(() => worker)
      transcribe(new Float32Array([0.1]), 'small')

      worker.onmessage?.({ data: { type: 'transcription-start', audioDuration: 60, totalChunks: 3 } } as MessageEvent)
      vi.advanceTimersByTime(8000)

      worker.onerror?.(new Event('error') as ErrorEvent)
      vi.advanceTimersByTime(5000)
      expect(elapsedSeconds.value).toBe(8)
    })

    it('resets timing state when a new transcription starts', () => {
      const worker = createFakeWorker()
      const { elapsedSeconds, eta, transcriptionDuration, chunkProgress, transcribe } = useTranscription(() => worker)
      transcribe(new Float32Array([0.1]), 'small')

      worker.onmessage?.({ data: { type: 'transcription-start', audioDuration: 10, totalChunks: 1 } } as MessageEvent)
      vi.advanceTimersByTime(5000)
      worker.onmessage?.({ data: { type: 'chunk-progress', done: 2, total: 8 } } as MessageEvent)
      worker.onmessage?.({ data: { type: 'result', text: 'hi', chunks: [] } } as MessageEvent)
      expect(transcriptionDuration.value).toBe(5)

      transcribe(new Float32Array([0.1]), 'small')
      expect(elapsedSeconds.value).toBe(0)
      expect(eta.value).toBeNull()
      expect(transcriptionDuration.value).toBeNull()
      expect(chunkProgress.value).toBeNull()
    })
  })
})
