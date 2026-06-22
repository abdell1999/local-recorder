import { pipeline, type AutomaticSpeechRecognitionPipeline, type ProgressInfo } from '@huggingface/transformers'
import { getModelRepoId, type WhisperModelSize } from '../utils/whisperModels'
import type { WhisperWorkerRequest, WhisperWorkerResponse, WhisperChunk } from './whisper.types'

let transcriber: AutomaticSpeechRecognitionPipeline | null = null
let loadedModelSize: WhisperModelSize | null = null

function post(message: WhisperWorkerResponse) {
  ;(self as unknown as Worker).postMessage(message)
}

async function getTranscriber(modelSize: WhisperModelSize) {
  if (transcriber && loadedModelSize === modelSize) return transcriber
  post({ type: 'progress', status: 'loading-model' })
  const device = typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm'
  post({ type: 'device', device })

  const fileBytes = new Map<string, { loaded: number; total: number }>()
  let lastPostedPercent = -1

  function onProgress(info: ProgressInfo) {
    if (info.status !== 'progress') return
    fileBytes.set(info.file, { loaded: info.loaded, total: info.total })
    let loadedSum = 0
    let totalSum = 0
    for (const entry of fileBytes.values()) {
      loadedSum += entry.loaded
      totalSum += entry.total
    }
    if (totalSum === 0) return
    const percent = Math.round((loadedSum / totalSum) * 100)
    if (percent !== lastPostedPercent) {
      lastPostedPercent = percent
      post({ type: 'model-download-progress', percent })
    }
  }

  transcriber = await pipeline<'automatic-speech-recognition'>(
    'automatic-speech-recognition',
    getModelRepoId(modelSize),
    { device, progress_callback: onProgress },
  )
  loadedModelSize = modelSize
  return transcriber
}

self.onmessage = async (event: MessageEvent<WhisperWorkerRequest>) => {
  const { audio, modelSize } = event.data
  try {
    const asr = await getTranscriber(modelSize)
    post({ type: 'progress', status: 'transcribing' })
    const output = await asr(audio, { return_timestamps: true })
    const rawChunks = Array.isArray(output) ? output[0]?.chunks ?? [] : output.chunks ?? []
    const chunks: WhisperChunk[] = rawChunks.map((chunk: { text: string; timestamp: [number, number | null] }) => ({
      text: chunk.text,
      timestamp: chunk.timestamp,
    }))
    const text = Array.isArray(output) ? output[0]?.text ?? '' : output.text
    post({ type: 'result', text, chunks })
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : 'unknown-error' })
  }
}
