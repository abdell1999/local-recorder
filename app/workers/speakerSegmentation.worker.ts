import { AutoModelForAudioFrameClassification, AutoProcessor } from '@huggingface/transformers'
import type { Tensor } from '@huggingface/transformers'
import { computeWindows } from '../utils/audioWindows'
import { createProgressAggregator } from '../utils/modelDownloadProgress'
import type {
  SpeakerSegmentationWorkerRequest,
  SpeakerSegmentationWorkerResponse,
  LocalSpeakerSegment,
} from './speakerSegmentation.types'

const MODEL_ID = 'onnx-community/pyannote-segmentation-3.0'
const SAMPLE_RATE = 16000
const WINDOW_SECONDS = 10
const STEP_SECONDS = 5

// `AutoProcessor.from_pretrained` is typed to return the generic base
// `Processor`, pero en tiempo de ejecución para este modelo devuelve un
// `PyAnnoteProcessor` (no exportado desde el paquete raíz) que sí expone
// `post_process_speaker_diarization` — documentado en el propio JSDoc de la
// librería (models.js ~L6289) y en feature_extraction_pyannote.d.ts. Este
// tipo local solo añade esa firma para el cast puntual de abajo; no
// reimplementa ni cambia el comportamiento documentado.
type PyAnnoteSpeakerDiarizationProcessor = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> & {
  post_process_speaker_diarization(
    logits: Tensor,
    num_samples: number,
  ): Array<Array<{ id: number, start: number, end: number, confidence: number }>>
}

let model: Awaited<ReturnType<typeof AutoModelForAudioFrameClassification.from_pretrained>> | null = null
let processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null = null

function post(message: SpeakerSegmentationWorkerResponse) {
  ;(self as unknown as Worker).postMessage(message)
}

async function getModelAndProcessor() {
  if (model && processor) return { model, processor }
  post({ type: 'progress', status: 'loading-model' })
  // Heurística usada solo como pista para la UI y para el dtype — la
  // selección real de backend la hace onnxruntime-web internamente vía
  // device:'auto' (ver docs/superpowers/specs/2026-06-24-fix-device-auto-design.md).
  const device = typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm'
  post({ type: 'device', device })

  const onProgress = createProgressAggregator((percent) => post({ type: 'model-download-progress', percent }))

  model = await AutoModelForAudioFrameClassification.from_pretrained(MODEL_ID, {
    device: 'auto',
    dtype: device === 'wasm' ? 'q8' : undefined,
    progress_callback: onProgress,
  })
  processor = await AutoProcessor.from_pretrained(MODEL_ID)
  return { model, processor }
}

self.onmessage = async (event: MessageEvent<SpeakerSegmentationWorkerRequest>) => {
  const { audio } = event.data
  try {
    const { model, processor } = await getModelAndProcessor()
    post({ type: 'progress', status: 'segmenting' })

    const windows = computeWindows(audio.length, SAMPLE_RATE, WINDOW_SECONDS, STEP_SECONDS)
    const segments: LocalSpeakerSegment[] = []

    for (const [windowIndex, { start, end }] of windows.entries()) {
      const windowAudio = audio.subarray(start, end)
      const inputs = await processor(windowAudio)
      const { logits } = await model(inputs)
      const [windowSegments = []] = (processor as PyAnnoteSpeakerDiarizationProcessor).post_process_speaker_diarization(
        logits,
        windowAudio.length,
      )
      const windowOffsetSeconds = start / SAMPLE_RATE
      for (const seg of windowSegments) {
        segments.push({
          windowIndex,
          localSpeakerId: seg.id,
          start: seg.start + windowOffsetSeconds,
          end: seg.end + windowOffsetSeconds,
          confidence: seg.confidence,
        })
      }
    }

    post({ type: 'result', segments })
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : 'unknown-error' })
  }
}
