import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import { getModelRepoId, type WhisperModelSize } from '../utils/whisperModels'
import type { WhisperWorkerRequest, WhisperWorkerResponse, WhisperChunk } from './whisper.types'
import { filterNonSpeechChunks, deriveText } from '../utils/transcriptClean'
import { createProgressAggregator } from '../utils/modelDownloadProgress'

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
  // Heurística usada solo como pista para la UI y para el dtype — la
  // selección real de backend la hace onnxruntime-web internamente vía
  // device:'auto' (ver docs/superpowers/specs/2026-06-24-fix-device-auto-design.md).
  const device = typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm'
  post({ type: 'device', device })

  const onProgress = createProgressAggregator((percent) => post({ type: 'model-download-progress', percent }))

  transcriber = await pipeline<'automatic-speech-recognition'>(
    'automatic-speech-recognition',
    getModelRepoId(modelSize),
    { device: 'auto', dtype: device === 'wasm' ? 'q8' : undefined, progress_callback: onProgress },
  )
  loadedModelSize = modelSize
  return transcriber
}

self.onmessage = async (event: MessageEvent<WhisperWorkerRequest>) => {
  const { audio, modelSize, language } = event.data
  try {
    const asr = await getTranscriber(modelSize)
    post({ type: 'progress', status: 'transcribing' })

    const audioDurationSeconds = audio.length / 16000
    const totalChunks = Math.max(1, Math.ceil(audioDurationSeconds / (CHUNK_LENGTH_S - STRIDE_LENGTH_S)))
    post({ type: 'transcription-start', audioDuration: audioDurationSeconds, totalChunks })

    const output = await asr(audio, {
      return_timestamps: true,
      chunk_length_s: CHUNK_LENGTH_S,
      stride_length_s: STRIDE_LENGTH_S,
      ...(language !== 'auto' ? { language } : {}),
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
