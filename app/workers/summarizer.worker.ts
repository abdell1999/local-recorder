import { pipeline, type TextGenerationPipeline, type TextGenerationOutput, type Message } from '@huggingface/transformers'
import { getLlmModelRepoId, type LlmModelSize } from '../utils/llmModels'
import type { SummarizerWorkerRequest, SummarizerWorkerResponse } from './summarizer.types'
import { createProgressAggregator } from '../utils/modelDownloadProgress'
import { loadWithDeviceFallback } from '../utils/modelDevice'

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

  const { result, device } = await loadWithDeviceFallback((device) =>
    pipeline<'text-generation'>('text-generation', getLlmModelRepoId(modelSize), {
      device,
      progress_callback: createProgressAggregator((percent) => post({ type: 'model-download-progress', percent })),
    }),
  )
  post({ type: 'device', device })

  generator = result
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
