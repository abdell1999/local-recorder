import { pipeline, type TextGenerationPipeline, type TextGenerationOutput, type Message } from '@huggingface/transformers'
import { getLlmModelRepoId, type LlmModelSize } from '../utils/llmModels'
import type { SummarizerWorkerRequest, SummarizerWorkerResponse } from './summarizer.types'
import { createProgressAggregator } from '../utils/modelDownloadProgress'

let generator: TextGenerationPipeline | null = null
let loadedModelSize: LlmModelSize | null = null

const SUMMARY_SYSTEM_PROMPT =
  'Eres un asistente que resume transcripciones de audio. Responde ' +
  'siempre en el mismo idioma que el texto proporcionado. Usa ' +
  'exactamente este formato:\n\nTL;DR: <resumen de 2-3 frases>\n\n' +
  'Puntos clave:\n- <punto>\n- <punto>...'

function post(message: SummarizerWorkerResponse) {
  ;(self as unknown as Worker).postMessage(message)
}

async function getGenerator(modelSize: LlmModelSize) {
  if (generator && loadedModelSize === modelSize) return generator
  post({ type: 'progress', status: 'loading-model' })
  // Heurística usada solo como pista para la UI (aviso de "modo
  // compatibilidad") — la selección real de backend la hace
  // onnxruntime-web internamente vía device:'auto'. El dtype se fija
  // siempre a 'q8' (ver docs/superpowers/specs/2026-06-25-fix-summarizer-dtype-q8-design.md):
  // en fp32 sin cuantizar, este modelo agota la memoria del runtime wasm
  // cuando WebGPU está presente pero roto y se cae a wasm internamente.
  const device = typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm'
  post({ type: 'device', device })

  const onProgress = createProgressAggregator((percent) => post({ type: 'model-download-progress', percent }))

  generator = await pipeline<'text-generation'>(
    'text-generation',
    getLlmModelRepoId(modelSize),
    { device: 'auto', dtype: 'q8', progress_callback: onProgress },
  )
  loadedModelSize = modelSize
  return generator
}

self.onmessage = async (event: MessageEvent<SummarizerWorkerRequest>) => {
  const { text, modelSize } = event.data
  try {
    const generate = await getGenerator(modelSize)
    post({ type: 'progress', status: 'summarizing' })
    const messages: Message[] = [
      { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
      { role: 'user', content: text },
    ]
    const output = (await generate(messages, { max_new_tokens: 256, do_sample: false })) as TextGenerationOutput
    const resultMessages = output[0]?.generated_text as Message[] | undefined
    const summary = resultMessages?.[resultMessages.length - 1]?.content
    if (summary === undefined) throw new Error('empty-generation-output')
    post({ type: 'result', summary })
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : 'unknown-error' })
  }
}
