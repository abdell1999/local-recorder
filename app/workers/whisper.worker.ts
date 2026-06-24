import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import { getModelRepoId, type WhisperModelSize } from '../utils/whisperModels'
import type { WhisperWorkerRequest, WhisperWorkerResponse, WhisperChunk } from './whisper.types'
import { filterNonSpeechChunks, deriveText } from '../utils/transcriptClean'
import { createProgressAggregator } from '../utils/modelDownloadProgress'
import { loadWithDeviceFallback } from '../utils/modelDevice'

let transcriber: AutomaticSpeechRecognitionPipeline | null = null
let loadedModelSize: WhisperModelSize | null = null

// Valores recomendados por la documentación de @huggingface/transformers para
// audio de más de 30s: sin esto, WhisperFeatureExtractor trunca el audio a los
// primeros 30 segundos y descarta el resto antes de que llegue al modelo.
const CHUNK_LENGTH_S = 30
const STRIDE_LENGTH_S = 5

function post(message: WhisperWorkerResponse) {
  ;(self as unknown as Worker).postMessage(message)
}

async function getTranscriber(modelSize: WhisperModelSize) {
  if (transcriber && loadedModelSize === modelSize) return transcriber
  post({ type: 'progress', status: 'loading-model' })

  const { result, device } = await loadWithDeviceFallback((device) =>
    pipeline<'automatic-speech-recognition'>('automatic-speech-recognition', getModelRepoId(modelSize), {
      device,
      progress_callback: createProgressAggregator((percent) => post({ type: 'model-download-progress', percent })),
    }),
  )
  post({ type: 'device', device })

  transcriber = result
  loadedModelSize = modelSize
  return transcriber
}

self.onmessage = async (event: MessageEvent<WhisperWorkerRequest>) => {
  const { audio, modelSize } = event.data
  try {
    const asr = await getTranscriber(modelSize)
    post({ type: 'progress', status: 'transcribing' })
    const output = await asr(audio, {
      return_timestamps: true,
      chunk_length_s: CHUNK_LENGTH_S,
      stride_length_s: STRIDE_LENGTH_S,
    })
    const rawChunks = Array.isArray(output) ? output[0]?.chunks ?? [] : output.chunks ?? []
    const rawText = Array.isArray(output) ? output[0]?.text ?? '' : output.text
    const mappedChunks: WhisperChunk[] = rawChunks.map((chunk: { text: string; timestamp: [number, number | null] }) => ({
      text: chunk.text,
      timestamp: chunk.timestamp,
    }))
    const chunks = filterNonSpeechChunks(mappedChunks)
    const text = deriveText(chunks, rawText)
    post({ type: 'result', text, chunks })
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : 'unknown-error' })
  }
}
