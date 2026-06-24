import { ref, shallowRef } from 'vue'
import type { LocalSpeakerSegment, SpeakerSegmentationWorkerResponse } from '../workers/speakerSegmentation.types'

export type SpeakerSegmentationState = 'idle' | 'loading-model' | 'segmenting' | 'done' | 'error'

export interface MinimalSegmentationWorker {
  postMessage: (message: unknown, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent<SpeakerSegmentationWorkerResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  terminate: () => void
}

function createDefaultWorker(): MinimalSegmentationWorker {
  return new Worker(new URL('../workers/speakerSegmentation.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as MinimalSegmentationWorker
}

export function useSpeakerSegmentation(createWorker: () => MinimalSegmentationWorker = createDefaultWorker) {
  const state = ref<SpeakerSegmentationState>('idle')
  const segments = shallowRef<LocalSpeakerSegment[]>([])
  const errorMessage = ref<string | null>(null)
  const device = ref<'webgpu' | 'wasm' | null>(null)
  const downloadProgress = ref<number | null>(null)
  let worker: MinimalSegmentationWorker | null = null

  function ensureWorker(): MinimalSegmentationWorker {
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
      } else if (message.type === 'result') {
        segments.value = message.segments
        state.value = 'done'
        downloadProgress.value = null
      } else if (message.type === 'error') {
        state.value = 'error'
        errorMessage.value = message.message
        downloadProgress.value = null
      }
    }
    worker.onerror = () => {
      state.value = 'error'
      errorMessage.value = 'worker-crashed'
      downloadProgress.value = null
    }
    return worker
  }

  function segment(audio: Float32Array) {
    errorMessage.value = null
    state.value = 'loading-model'
    const transferable = audio.slice()
    ensureWorker().postMessage({ type: 'segment', audio: transferable }, [transferable.buffer])
  }

  function retry(audio: Float32Array) {
    worker?.terminate()
    worker = null
    segment(audio)
  }

  return { state, segments, errorMessage, device, downloadProgress, segment, retry }
}
