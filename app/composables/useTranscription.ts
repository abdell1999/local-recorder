import { ref, shallowRef } from 'vue'
import type { WhisperModelSize } from '../utils/whisperModels'
import type { WhisperWorkerResponse, WhisperChunk } from '../workers/whisper.types'

export type TranscriptionState = 'idle' | 'loading-model' | 'transcribing' | 'done' | 'error'

export interface MinimalWorker {
  postMessage: (message: unknown, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent<WhisperWorkerResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  terminate: () => void
}

function createDefaultWorker(): MinimalWorker {
  return new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as MinimalWorker
}

export function useTranscription(createWorker: () => MinimalWorker = createDefaultWorker) {
  const state = ref<TranscriptionState>('idle')
  const text = ref('')
  const chunks = shallowRef<WhisperChunk[]>([])
  const errorMessage = ref<string | null>(null)
  const device = ref<'webgpu' | 'wasm' | null>(null)
  const downloadProgress = ref<number | null>(null)
  const elapsedSeconds = ref<number>(0)
  const eta = ref<number | null>(null)
  const transcriptionDuration = ref<number | null>(null)
  const chunkProgress = ref<{ done: number; total: number } | null>(null)
  let worker: MinimalWorker | null = null
  let timerHandle: ReturnType<typeof setInterval> | null = null

  function stopTimer() {
    if (timerHandle !== null) {
      clearInterval(timerHandle)
      timerHandle = null
    }
  }

  function ensureWorker(): MinimalWorker {
    if (worker) return worker
    worker = createWorker()
    worker.onmessage = (event) => {
      const message = event.data
      if (message.type === 'progress') {
        state.value = message.status
        downloadProgress.value = null
      } else if (message.type === 'model-download-progress') {
        downloadProgress.value = message.percent
      } else if (message.type === 'device') {
        device.value = message.device
      } else if (message.type === 'transcription-start') {
        timerHandle = setInterval(() => { elapsedSeconds.value++ }, 1000)
      } else if (message.type === 'chunk-progress') {
        chunkProgress.value = { done: message.done, total: message.total }
        if (message.done > 0 && elapsedSeconds.value > 0) {
          const secondsPerSegment = elapsedSeconds.value / message.done
          eta.value = Math.round(secondsPerSegment * (message.total - message.done))
        }
      } else if (message.type === 'result') {
        stopTimer()
        transcriptionDuration.value = elapsedSeconds.value
        text.value = message.text
        chunks.value = message.chunks
        state.value = 'done'
        downloadProgress.value = null
        eta.value = null
        chunkProgress.value = null
      } else if (message.type === 'error') {
        stopTimer()
        state.value = 'error'
        errorMessage.value = message.message
        downloadProgress.value = null
      }
    }
    worker.onerror = () => {
      stopTimer()
      state.value = 'error'
      errorMessage.value = 'worker-crashed'
      downloadProgress.value = null
    }
    return worker
  }

  function transcribe(audio: Float32Array, modelSize: WhisperModelSize, language = 'auto') {
    stopTimer()
    elapsedSeconds.value = 0
    eta.value = null
    transcriptionDuration.value = null
    chunkProgress.value = null
    errorMessage.value = null
    state.value = 'loading-model'
    const transferable = audio.slice()
    ensureWorker().postMessage(
      { type: 'transcribe', audio: transferable, modelSize, language },
      [transferable.buffer],
    )
  }

  function retry(audio: Float32Array, modelSize: WhisperModelSize, language = 'auto') {
    worker?.terminate()
    worker = null
    transcribe(audio, modelSize, language)
  }

  return {
    state,
    text,
    chunks,
    errorMessage,
    device,
    downloadProgress,
    elapsedSeconds,
    eta,
    transcriptionDuration,
    chunkProgress,
    transcribe,
    retry,
  }
}
