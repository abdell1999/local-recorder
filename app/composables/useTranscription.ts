import { ref, shallowRef } from 'vue'
import type { WhisperModelSize } from '../utils/whisperModels'
import type { WhisperWorkerResponse, WhisperChunk } from '../workers/whisper.types'

export type TranscriptionState = 'idle' | 'loading-model' | 'transcribing' | 'done' | 'error'

export interface MinimalWorker {
  postMessage: (message: unknown) => void
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
  let worker: MinimalWorker | null = null

  function ensureWorker(): MinimalWorker {
    if (worker) return worker
    worker = createWorker()
    worker.onmessage = (event) => {
      const message = event.data
      if (message.type === 'progress') {
        state.value = message.status
      } else if (message.type === 'device') {
        device.value = message.device
      } else if (message.type === 'result') {
        text.value = message.text
        chunks.value = message.chunks
        state.value = 'done'
      } else if (message.type === 'error') {
        state.value = 'error'
        errorMessage.value = message.message
      }
    }
    worker.onerror = () => {
      state.value = 'error'
      errorMessage.value = 'worker-crashed'
    }
    return worker
  }

  function transcribe(audio: Float32Array, modelSize: WhisperModelSize) {
    errorMessage.value = null
    state.value = 'loading-model'
    ensureWorker().postMessage({ type: 'transcribe', audio, modelSize })
  }

  function retry(audio: Float32Array, modelSize: WhisperModelSize) {
    worker?.terminate()
    worker = null
    transcribe(audio, modelSize)
  }

  return { state, text, chunks, errorMessage, device, transcribe, retry }
}
