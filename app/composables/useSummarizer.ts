import { ref } from 'vue'
import type { LlmModelSize } from '../utils/llmModels'
import type { SummarizerWorkerResponse } from '../workers/summarizer.types'

export type SummarizerState = 'idle' | 'loading-model' | 'summarizing' | 'done' | 'error'

export interface MinimalSummarizerWorker {
  postMessage: (message: unknown) => void
  onmessage: ((event: MessageEvent<SummarizerWorkerResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  terminate: () => void
}

function createDefaultWorker(): MinimalSummarizerWorker {
  return new Worker(new URL('../workers/summarizer.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as MinimalSummarizerWorker
}

export function useSummarizer(createWorker: () => MinimalSummarizerWorker = createDefaultWorker) {
  const state = ref<SummarizerState>('idle')
  const summary = ref('')
  const errorMessage = ref<string | null>(null)
  const device = ref<'webgpu' | 'wasm' | null>(null)
  const downloadProgress = ref<number | null>(null)
  let worker: MinimalSummarizerWorker | null = null

  function ensureWorker(): MinimalSummarizerWorker {
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
        summary.value = message.summary
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

  function summarize(text: string, modelSize: LlmModelSize) {
    errorMessage.value = null
    state.value = 'loading-model'
    ensureWorker().postMessage({ type: 'summarize', text, modelSize })
  }

  function retry(text: string, modelSize: LlmModelSize) {
    worker?.terminate()
    worker = null
    summarize(text, modelSize)
  }

  return { state, summary, errorMessage, device, downloadProgress, summarize, retry }
}
