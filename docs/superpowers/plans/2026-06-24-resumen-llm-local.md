# Resumen con LLM local — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir generación de resumen (TL;DR + puntos clave) de la transcripción con un LLM pequeño (Qwen2.5 0.5B/1.5B Instruct) ejecutándose localmente en el navegador, con selector de tamaño, progreso de descarga y manejo de errores/reintento — mismo patrón ya usado para Whisper.

**Architecture:** Un worker nuevo (`summarizer.worker.ts`) carga `pipeline('text-generation', repoId)` y genera el resumen a partir de un mensaje de chat (system+user). La lógica de agregación de progreso de descarga, hoy duplicada solo en `whisper.worker.ts`, se extrae primero a `app/utils/modelDownloadProgress.ts` y la usan ambos workers. `useSummarizer.ts` envuelve el nuevo worker con el mismo protocolo postMessage/onmessage que `useTranscription.ts`. `index.vue` añade el selector de tamaño de LLM, el botón "Resumir" y el editor de resumen, todo dentro de la sección que ya solo se muestra cuando hay transcripción no vacía.

**Tech Stack:** Igual que fases anteriores — Nuxt 4, TypeScript, Vue `<script setup>`, Tailwind CSS, Vitest + `@vue/test-utils` + happy-dom, pnpm, `@huggingface/transformers` (mismo paquete que Whisper, pipeline `text-generation` en vez de `automatic-speech-recognition`).

## Global Constraints

- Package manager: pnpm only.
- Styling: Tailwind CSS, sin librería de componentes.
- Commits: sin co-author, mensajes en español, siempre en `main` (`CLAUDE.md`).
- Composables/componentes con imports explícitos de `vue`, no auto-imports de Nuxt.
- `whisper.worker.ts` y `summarizer.worker.ts` no tienen test unitario directo (requieren navegador real para `pipeline`) — se verifican leyendo el código, igual que en fases anteriores.
- `pnpm dlx nuxi typecheck` debe seguir pasando limpio tras cada tarea.
- Tras cada tarea, correr `pnpm test` completo para confirmar que no hay regresiones.
- Modelos de LLM verificados y exactos a usar: `onnx-community/Qwen2.5-0.5B-Instruct` (tamaño `'0.5b'`, por defecto) y `onnx-community/Qwen2.5-1.5B-Instruct` (tamaño `'1.5b'`). Sin tercer tamaño.
- Sin exportación del resumen, sin troceo de transcripciones largas, sin liberar el worker de Whisper al resumir, sin control programático de idioma de salida, sin cancelación a media generación (todo fuera de alcance, ver spec).

---

### Task 1: Extraer `createProgressAggregator` y refactorizar `whisper.worker.ts`

**Files:**
- Create: `app/utils/modelDownloadProgress.ts`
- Test: `tests/unit/utils/modelDownloadProgress.test.ts`
- Modify: `app/workers/whisper.worker.ts`

**Interfaces:**
- Produces: `createProgressAggregator(onPercent: (percent: number) => void): (info: ProgressInfo) => void`. Consumido por `whisper.worker.ts` (esta misma tarea) y por `summarizer.worker.ts` (Tarea 5).

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/utils/modelDownloadProgress.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { ProgressInfo } from '@huggingface/transformers'
import { createProgressAggregator } from '../../../app/utils/modelDownloadProgress'

const progressEvent = (file: string, loaded: number, total: number): ProgressInfo => ({
  status: 'progress',
  name: 'model',
  file,
  progress: total === 0 ? 0 : (loaded / total) * 100,
  loaded,
  total,
})

describe('createProgressAggregator', () => {
  it('reports the aggregated percent across multiple files', () => {
    const onPercent = vi.fn()
    const onProgress = createProgressAggregator(onPercent)

    onProgress(progressEvent('a.bin', 50, 100))
    onProgress(progressEvent('b.bin', 0, 100))

    expect(onPercent).toHaveBeenLastCalledWith(25)
  })

  it('only calls onPercent when the rounded value changes', () => {
    const onPercent = vi.fn()
    const onProgress = createProgressAggregator(onPercent)

    onProgress(progressEvent('a.bin', 50, 100))
    onProgress(progressEvent('a.bin', 50, 100))

    expect(onPercent).toHaveBeenCalledTimes(1)
  })

  it('ignores non-progress status events', () => {
    const onPercent = vi.fn()
    const onProgress = createProgressAggregator(onPercent)

    onProgress({ status: 'initiate', name: 'model', file: 'a.bin' })

    expect(onPercent).not.toHaveBeenCalled()
  })

  it('does not call onPercent while the total is zero', () => {
    const onPercent = vi.fn()
    const onProgress = createProgressAggregator(onPercent)

    onProgress(progressEvent('a.bin', 0, 0))

    expect(onPercent).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Ejecutar el test para confirmar que falla**

Run: `pnpm test -- modelDownloadProgress`
Expected: FAIL con "Cannot find module '../../../app/utils/modelDownloadProgress'"

- [ ] **Step 3: Implementar `app/utils/modelDownloadProgress.ts`**

```ts
import type { ProgressInfo } from '@huggingface/transformers'

export function createProgressAggregator(onPercent: (percent: number) => void) {
  const fileBytes = new Map<string, { loaded: number; total: number }>()
  let lastPostedPercent = -1
  return function onProgress(info: ProgressInfo) {
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
      onPercent(percent)
    }
  }
}
```

- [ ] **Step 4: Ejecutar el test para confirmar que pasa**

Run: `pnpm test -- modelDownloadProgress`
Expected: PASS (4 tests passed)

- [ ] **Step 5: Refactorizar `app/workers/whisper.worker.ts` para usar el agregador compartido**

El archivo actual (líneas 1-52) es:

```ts
import { pipeline, type AutomaticSpeechRecognitionPipeline, type ProgressInfo } from '@huggingface/transformers'
import { getModelRepoId, type WhisperModelSize } from '../utils/whisperModels'
import type { WhisperWorkerRequest, WhisperWorkerResponse, WhisperChunk } from './whisper.types'
import { filterNonSpeechChunks, deriveText } from '../utils/transcriptClean'

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
```

Reemplazar por:

```ts
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
  const device = typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm'
  post({ type: 'device', device })

  const onProgress = createProgressAggregator((percent) => post({ type: 'model-download-progress', percent }))

  transcriber = await pipeline<'automatic-speech-recognition'>(
    'automatic-speech-recognition',
    getModelRepoId(modelSize),
    { device, progress_callback: onProgress },
  )
  loadedModelSize = modelSize
  return transcriber
}
```

El resto del archivo (`self.onmessage = ...`) no cambia.

- [ ] **Step 6: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan, sin regresiones — `whisper.worker.ts` no tiene tests propios, pero no debe romper ningún otro)

- [ ] **Step 7: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 8: Commit**

```bash
git add app/utils/modelDownloadProgress.ts tests/unit/utils/modelDownloadProgress.test.ts app/workers/whisper.worker.ts
git commit -m "Extrae createProgressAggregator y lo reutiliza en whisper.worker.ts"
```

---

### Task 2: Registro de modelos LLM (`llmModels.ts`)

**Files:**
- Create: `app/utils/llmModels.ts`
- Test: `tests/unit/utils/llmModels.test.ts`

**Interfaces:**
- Produces: `LlmModelSize = '0.5b' | '1.5b'`; `LLM_MODELS: Record<LlmModelSize, string>`; `getLlmModelRepoId(size: LlmModelSize): string`. Consumido por las Tareas 3, 4, 5 y 6.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/utils/llmModels.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { LLM_MODELS, getLlmModelRepoId } from '../../../app/utils/llmModels'

describe('llmModels', () => {
  it('has exactly the two supported sizes', () => {
    expect(Object.keys(LLM_MODELS).sort()).toEqual(['0.5b', '1.5b'])
  })

  it('returns the matching repo id for each size', () => {
    expect(getLlmModelRepoId('0.5b')).toBe('onnx-community/Qwen2.5-0.5B-Instruct')
    expect(getLlmModelRepoId('1.5b')).toBe('onnx-community/Qwen2.5-1.5B-Instruct')
  })
})
```

- [ ] **Step 2: Ejecutar el test para confirmar que falla**

Run: `pnpm test -- llmModels`
Expected: FAIL con "Cannot find module '../../../app/utils/llmModels'"

- [ ] **Step 3: Implementar `app/utils/llmModels.ts`**

```ts
export type LlmModelSize = '0.5b' | '1.5b'

export const LLM_MODELS: Record<LlmModelSize, string> = {
  '0.5b': 'onnx-community/Qwen2.5-0.5B-Instruct',
  '1.5b': 'onnx-community/Qwen2.5-1.5B-Instruct',
}

export function getLlmModelRepoId(size: LlmModelSize): string {
  return LLM_MODELS[size]
}
```

- [ ] **Step 4: Ejecutar el test para confirmar que pasa**

Run: `pnpm test -- llmModels`
Expected: PASS (2 tests passed)

- [ ] **Step 5: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 6: Commit**

```bash
git add app/utils/llmModels.ts tests/unit/utils/llmModels.test.ts
git commit -m "Añade registro de modelos LLM (Qwen2.5 0.5B/1.5B Instruct)"
```

---

### Task 3: `useLlmModelSelector`

**Files:**
- Create: `app/composables/useLlmModelSelector.ts`
- Test: `tests/unit/composables/useLlmModelSelector.test.ts`

**Interfaces:**
- Consumes: `LlmModelSize` de `app/utils/llmModels.ts` (Tarea 2).
- Produces: `useLlmModelSelector(): { modelSize: Ref<LlmModelSize>; setModelSize: (size: LlmModelSize) => void }`. Consumido por la Tarea 8 (`index.vue`).

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/composables/useLlmModelSelector.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useLlmModelSelector } from '../../../app/composables/useLlmModelSelector'

beforeEach(() => {
  localStorage.clear()
})

describe('useLlmModelSelector', () => {
  it('defaults to 0.5b when nothing is stored', () => {
    const { modelSize } = useLlmModelSelector()
    expect(modelSize.value).toBe('0.5b')
  })

  it('persists the chosen size to localStorage', () => {
    const { modelSize, setModelSize } = useLlmModelSelector()
    setModelSize('1.5b')
    expect(modelSize.value).toBe('1.5b')
    expect(localStorage.getItem('local-recorder:llm-model-size')).toBe('1.5b')
  })

  it('reads a previously stored size on init', () => {
    localStorage.setItem('local-recorder:llm-model-size', '1.5b')
    const { modelSize } = useLlmModelSelector()
    expect(modelSize.value).toBe('1.5b')
  })
})
```

- [ ] **Step 2: Ejecutar el test para confirmar que falla**

Run: `pnpm test -- useLlmModelSelector`
Expected: FAIL con "Cannot find module '../../../app/composables/useLlmModelSelector'"

- [ ] **Step 3: Implementar `app/composables/useLlmModelSelector.ts`**

```ts
import { ref, watch } from 'vue'
import type { LlmModelSize } from '../utils/llmModels'

const STORAGE_KEY = 'local-recorder:llm-model-size'
const DEFAULT_SIZE: LlmModelSize = '0.5b'

export function useLlmModelSelector() {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  const modelSize = ref<LlmModelSize>((stored as LlmModelSize) || DEFAULT_SIZE)

  watch(modelSize, (value) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, value)
    }
  }, { flush: 'sync' })

  function setModelSize(size: LlmModelSize) {
    modelSize.value = size
  }

  return { modelSize, setModelSize }
}
```

- [ ] **Step 4: Ejecutar el test para confirmar que pasa**

Run: `pnpm test -- useLlmModelSelector`
Expected: PASS (3 tests passed)

- [ ] **Step 5: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 6: Commit**

```bash
git add app/composables/useLlmModelSelector.ts tests/unit/composables/useLlmModelSelector.test.ts
git commit -m "Añade useLlmModelSelector con persistencia en localStorage"
```

---

### Task 4: Componente `LlmModelSizePicker`

**Files:**
- Create: `app/components/settings/LlmModelSizePicker.vue`
- Test: `tests/unit/components/LlmModelSizePicker.test.ts`

**Interfaces:**
- Consumes: `LLM_MODELS`, `LlmModelSize` de `app/utils/llmModels.ts` (Tarea 2).
- Produces: componente con prop `modelValue: LlmModelSize`, prop opcional `disabled?: boolean` (por defecto `false`), emite `update:modelValue: [value: LlmModelSize]`. Compatible con `v-model`. `data-testid="llm-model-size-picker"`. Consumido por la Tarea 8.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/components/LlmModelSizePicker.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LlmModelSizePicker from '../../../app/components/settings/LlmModelSizePicker.vue'

describe('LlmModelSizePicker', () => {
  it('renders the two supported model sizes as options', () => {
    const wrapper = mount(LlmModelSizePicker, { props: { modelValue: '0.5b' } })
    const options = wrapper.findAll('option')
    expect(options.map((o) => o.element.value)).toEqual(['0.5b', '1.5b'])
  })

  it('emits update:modelValue when the selection changes', async () => {
    const wrapper = mount(LlmModelSizePicker, { props: { modelValue: '0.5b' } })
    await wrapper.get('[data-testid="llm-model-size-picker"]').setValue('1.5b')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['1.5b'])
  })

  it('disables the select when the disabled prop is true', () => {
    const wrapper = mount(LlmModelSizePicker, { props: { modelValue: '0.5b', disabled: true } })
    expect(wrapper.get<HTMLSelectElement>('[data-testid="llm-model-size-picker"]').element.disabled).toBe(true)
  })

  it('is enabled by default', () => {
    const wrapper = mount(LlmModelSizePicker, { props: { modelValue: '0.5b' } })
    expect(wrapper.get<HTMLSelectElement>('[data-testid="llm-model-size-picker"]').element.disabled).toBe(false)
  })
})
```

- [ ] **Step 2: Ejecutar el test para confirmar que falla**

Run: `pnpm test -- LlmModelSizePicker`
Expected: FAIL con "Cannot find module '../../../app/components/settings/LlmModelSizePicker.vue'"

- [ ] **Step 3: Implementar `app/components/settings/LlmModelSizePicker.vue`**

```vue
<script setup lang="ts">
import { LLM_MODELS, type LlmModelSize } from '../../utils/llmModels'

withDefaults(defineProps<{ modelValue: LlmModelSize; disabled?: boolean }>(), { disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: LlmModelSize] }>()

const sizes = Object.keys(LLM_MODELS) as LlmModelSize[]

function onChange(event: Event) {
  emit('update:modelValue', (event.target as HTMLSelectElement).value as LlmModelSize)
}
</script>

<template>
  <select
    data-testid="llm-model-size-picker"
    class="border rounded px-2 py-1 text-sm"
    :value="modelValue"
    :disabled="disabled"
    @change="onChange"
  >
    <option v-for="size in sizes" :key="size" :value="size">{{ size }}</option>
  </select>
</template>
```

- [ ] **Step 4: Ejecutar el test para confirmar que pasa**

Run: `pnpm test -- LlmModelSizePicker`
Expected: PASS (4 tests passed)

- [ ] **Step 5: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 6: Commit**

```bash
git add app/components/settings/LlmModelSizePicker.vue tests/unit/components/LlmModelSizePicker.test.ts
git commit -m "Añade componente LlmModelSizePicker"
```

---

### Task 5: Protocolo y worker del resumen (`summarizer.types.ts` + `summarizer.worker.ts`)

**Files:**
- Create: `app/workers/summarizer.types.ts`
- Create: `app/workers/summarizer.worker.ts`

**Interfaces:**
- Consumes: `createProgressAggregator` de `app/utils/modelDownloadProgress.ts` (Tarea 1); `getLlmModelRepoId`, `LlmModelSize` de `app/utils/llmModels.ts` (Tarea 2).
- Produces: protocolo `SummarizerWorkerRequest`/`SummarizerWorkerResponse` y el archivo de worker en `app/workers/summarizer.worker.ts` (referenciado por ruta desde la Tarea 6, `useSummarizer.ts`).
- Ninguno de los dos archivos tiene test unitario directo (`pipeline()` requiere navegador real, igual que `whisper.worker.ts`) — se verifican por lectura de código.

- [ ] **Step 1: Implementar `app/workers/summarizer.types.ts`**

```ts
import type { LlmModelSize } from '../utils/llmModels'

export interface SummarizeRequest {
  type: 'summarize'
  text: string
  modelSize: LlmModelSize
}

export interface SummaryProgressMessage {
  type: 'progress'
  status: 'loading-model' | 'summarizing'
}

export interface SummaryDeviceMessage {
  type: 'device'
  device: 'webgpu' | 'wasm'
}

export interface SummaryModelProgressMessage {
  type: 'model-download-progress'
  percent: number
}

export interface SummaryResultMessage {
  type: 'result'
  summary: string
}

export interface SummaryErrorMessage {
  type: 'error'
  message: string
}

export type SummarizerWorkerRequest = SummarizeRequest
export type SummarizerWorkerResponse =
  | SummaryProgressMessage
  | SummaryDeviceMessage
  | SummaryModelProgressMessage
  | SummaryResultMessage
  | SummaryErrorMessage
```

- [ ] **Step 2: Implementar `app/workers/summarizer.worker.ts`**

```ts
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
  const device = typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm'
  post({ type: 'device', device })

  const onProgress = createProgressAggregator((percent) => post({ type: 'model-download-progress', percent }))

  generator = await pipeline<'text-generation'>(
    'text-generation',
    getLlmModelRepoId(modelSize),
    { device, progress_callback: onProgress },
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
    const resultMessages = output[0].generated_text as Message[]
    const summary = resultMessages[resultMessages.length - 1].content
    post({ type: 'result', summary })
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : 'unknown-error' })
  }
}
```

Nota sobre la forma de `output`: con entrada de tipo chat (array de mensajes, no batched), `@huggingface/transformers` devuelve `TextGenerationOutput` directamente (un array de candidatos, no un array de arrays) — confirmado en `node_modules/@huggingface/transformers/types/pipelines.d.ts`. Por eso no hace falta el patrón `Array.isArray(output) ? output[0] : output` que sí usa `whisper.worker.ts` (ahí la ambigüedad viene de si el *input* de audio estaba o no batcheado; aquí el worker controla siempre una única llamada no batcheada, así que la forma de la salida es siempre la misma).

- [ ] **Step 3: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores. Si `TextGenerationPipeline`, `TextGenerationOutput` o `Message` no se resuelven como tipos importables desde `@huggingface/transformers`, comprobar `node_modules/@huggingface/transformers/types/transformers.d.ts` (debe re-exportar `pipelines.js` y `tokenizers.js` vía `export *`) antes de inventar un tipo local.

- [ ] **Step 4: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan — ninguno ejercita estos dos archivos nuevos directamente, así que no debería haber cambios en el recuento de tests)

- [ ] **Step 5: Commit**

```bash
git add app/workers/summarizer.types.ts app/workers/summarizer.worker.ts
git commit -m "Añade worker de resumen con LLM (pipeline text-generation)"
```

---

### Task 6: Composable `useSummarizer`

**Files:**
- Create: `app/composables/useSummarizer.ts`
- Test: `tests/unit/composables/useSummarizer.test.ts`

**Interfaces:**
- Consumes: tipo `LlmModelSize` de `app/utils/llmModels.ts` (Tarea 2); tipo `SummarizerWorkerResponse` de `app/workers/summarizer.types.ts` (Tarea 5); el archivo `app/workers/summarizer.worker.ts` (Tarea 5) por ruta, para el worker por defecto.
- Produces: `useSummarizer(createWorker?): { state: Ref<SummarizerState>; summary: Ref<string>; errorMessage: Ref<string|null>; device: Ref<'webgpu'|'wasm'|null>; downloadProgress: Ref<number|null>; summarize(text: string, modelSize: LlmModelSize): void; retry(text: string, modelSize: LlmModelSize): void }`. Tipo exportado `MinimalSummarizerWorker`. Consumido por la Tarea 8 (`index.vue`).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/unit/composables/useSummarizer.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { useSummarizer, type MinimalSummarizerWorker } from '../../../app/composables/useSummarizer'

function createFakeWorker() {
  const worker: MinimalSummarizerWorker = {
    postMessage: vi.fn(),
    onmessage: null,
    onerror: null,
    terminate: vi.fn(),
  }
  return worker
}

describe('useSummarizer', () => {
  it('moves to loading-model and posts a summarize message', () => {
    const worker = createFakeWorker()
    const { state, summarize } = useSummarizer(() => worker)

    summarize('hola mundo', '0.5b')

    expect(state.value).toBe('loading-model')
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'summarize', text: 'hola mundo', modelSize: '0.5b' })
  })

  it('reflects progress and result messages from the worker', () => {
    const worker = createFakeWorker()
    const { state, summary, summarize } = useSummarizer(() => worker)
    summarize('hola mundo', '0.5b')

    worker.onmessage?.({ data: { type: 'progress', status: 'summarizing' } } as MessageEvent)
    expect(state.value).toBe('summarizing')

    worker.onmessage?.({ data: { type: 'result', summary: 'TL;DR: hola' } } as MessageEvent)
    expect(state.value).toBe('done')
    expect(summary.value).toBe('TL;DR: hola')
  })

  it('reflects the chosen device when the worker reports it', () => {
    const worker = createFakeWorker()
    const { device, summarize } = useSummarizer(() => worker)
    summarize('hola mundo', '0.5b')

    worker.onmessage?.({ data: { type: 'device', device: 'wasm' } } as MessageEvent)

    expect(device.value).toBe('wasm')
  })

  it('reflects error messages from the worker', () => {
    const worker = createFakeWorker()
    const { state, errorMessage, summarize } = useSummarizer(() => worker)
    summarize('hola mundo', '0.5b')

    worker.onmessage?.({ data: { type: 'error', message: 'boom' } } as MessageEvent)

    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('boom')
  })

  it('treats a worker crash as an error', () => {
    const worker = createFakeWorker()
    const { state, errorMessage, summarize } = useSummarizer(() => worker)
    summarize('hola mundo', '0.5b')

    worker.onerror?.(new Event('error') as ErrorEvent)

    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('worker-crashed')
  })

  it('resets download progress when the worker crashes mid-download', () => {
    const worker = createFakeWorker()
    const { downloadProgress, summarize } = useSummarizer(() => worker)
    summarize('hola mundo', '0.5b')
    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 55 } } as MessageEvent)
    expect(downloadProgress.value).toBe(55)

    worker.onerror?.(new Event('error') as ErrorEvent)

    expect(downloadProgress.value).toBeNull()
  })

  it('retry terminates the old worker and creates a new one', () => {
    const firstWorker = createFakeWorker()
    const secondWorker = createFakeWorker()
    const factory = vi.fn().mockReturnValueOnce(firstWorker).mockReturnValueOnce(secondWorker)
    const { summarize, retry } = useSummarizer(factory)
    summarize('hola mundo', '0.5b')

    retry('hola mundo', '0.5b')

    expect(firstWorker.terminate).toHaveBeenCalled()
    expect(secondWorker.postMessage).toHaveBeenCalled()
  })

  it('reflects model download progress messages from the worker', () => {
    const worker = createFakeWorker()
    const { downloadProgress, summarize } = useSummarizer(() => worker)
    summarize('hola mundo', '0.5b')

    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 42 } } as MessageEvent)

    expect(downloadProgress.value).toBe(42)
  })

  it('resets download progress once summarizing starts', () => {
    const worker = createFakeWorker()
    const { downloadProgress, state, summarize } = useSummarizer(() => worker)
    summarize('hola mundo', '0.5b')
    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 80 } } as MessageEvent)
    expect(downloadProgress.value).toBe(80)

    worker.onmessage?.({ data: { type: 'progress', status: 'summarizing' } } as MessageEvent)

    expect(state.value).toBe('summarizing')
    expect(downloadProgress.value).toBeNull()
  })

  it('resets download progress when the worker reports an error', () => {
    const worker = createFakeWorker()
    const { downloadProgress, summarize } = useSummarizer(() => worker)
    summarize('hola mundo', '0.5b')
    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 30 } } as MessageEvent)

    worker.onmessage?.({ data: { type: 'error', message: 'boom' } } as MessageEvent)

    expect(downloadProgress.value).toBeNull()
  })
})
```

- [ ] **Step 2: Ejecutar los tests para confirmar que fallan**

Run: `pnpm test -- useSummarizer`
Expected: FAIL con "Cannot find module '../../../app/composables/useSummarizer'"

- [ ] **Step 3: Implementar `app/composables/useSummarizer.ts`**

```ts
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
```

- [ ] **Step 4: Ejecutar los tests para confirmar que pasan**

Run: `pnpm test -- useSummarizer`
Expected: PASS (10 tests passed)

- [ ] **Step 5: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan, sin regresiones)

- [ ] **Step 6: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 7: Commit**

```bash
git add app/composables/useSummarizer.ts tests/unit/composables/useSummarizer.test.ts
git commit -m "Añade composable useSummarizer"
```

---

### Task 7: Componente `SummaryEditor`

**Files:**
- Create: `app/components/summary/SummaryEditor.vue`
- Test: `tests/unit/components/SummaryEditor.test.ts`

**Interfaces:**
- No consume nada de tareas anteriores.
- Produces: componente con prop `modelValue: string`, emite `update:modelValue: [value: string]`. Compatible con `v-model`. `data-testid="summary-editor"`. Consumido por la Tarea 8.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/components/SummaryEditor.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SummaryEditor from '../../../app/components/summary/SummaryEditor.vue'

describe('SummaryEditor', () => {
  it('renders the current text', () => {
    const wrapper = mount(SummaryEditor, { props: { modelValue: 'TL;DR: hola' } })
    expect(wrapper.get('[data-testid="summary-editor"]').element.value).toBe('TL;DR: hola')
  })

  it('emits update:modelValue on input', async () => {
    const wrapper = mount(SummaryEditor, { props: { modelValue: 'TL;DR: hola' } })
    const textarea = wrapper.get('[data-testid="summary-editor"]')
    await textarea.setValue('TL;DR: hola mundo')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['TL;DR: hola mundo'])
  })
})
```

- [ ] **Step 2: Ejecutar el test para confirmar que falla**

Run: `pnpm test -- SummaryEditor`
Expected: FAIL con "Cannot find module '../../../app/components/summary/SummaryEditor.vue'"

- [ ] **Step 3: Implementar `app/components/summary/SummaryEditor.vue`**

```vue
<script setup lang="ts">
defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <textarea
    class="w-full h-64 p-3 border rounded font-mono text-sm"
    data-testid="summary-editor"
    :value="modelValue"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>
```

- [ ] **Step 4: Ejecutar el test para confirmar que pasa**

Run: `pnpm test -- SummaryEditor`
Expected: PASS (2 tests passed)

- [ ] **Step 5: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 6: Commit**

```bash
git add app/components/summary/SummaryEditor.vue tests/unit/components/SummaryEditor.test.ts
git commit -m "Añade componente SummaryEditor"
```

---

### Task 8: Conectar el resumen en `index.vue`

**Files:**
- Modify: `app/pages/index.vue`
- Modify: `tests/unit/pages/index.test.ts`

**Interfaces:**
- Consumes: `useLlmModelSelector` (Tarea 3), `LlmModelSizePicker` (Tarea 4), `useSummarizer` (Tarea 6), `SummaryEditor` (Tarea 7).
- No produce nada nuevo — última tarea del plan.

- [ ] **Step 1: Escribir los tests que fallan**

En `tests/unit/pages/index.test.ts`, añadir los imports junto a los demás (después de `import RecordButton ...`):

```ts
import LlmModelSizePicker from '../../../app/components/settings/LlmModelSizePicker.vue'
import SummaryEditor from '../../../app/components/summary/SummaryEditor.vue'
```

Añadir los refs y mocks de resumen junto a los ya existentes. Cambiar:
```ts
const setModelSize = vi.fn()

vi.mock('../../../app/composables/useModelSelector', () => ({
  useModelSelector: () => ({ modelSize, setModelSize }),
}))
```
por:
```ts
const setModelSize = vi.fn()

vi.mock('../../../app/composables/useModelSelector', () => ({
  useModelSelector: () => ({ modelSize, setModelSize }),
}))

const summarize = vi.fn()
const retrySummarize = vi.fn()
const setLlmModelSize = vi.fn()
const llmModelSize = ref('0.5b')
const summarizerState = ref('idle')
const summary = ref('')
const summarizerError = ref<string | null>(null)
const summaryDownloadProgress = ref<number | null>(null)

vi.mock('../../../app/composables/useLlmModelSelector', () => ({
  useLlmModelSelector: () => ({ modelSize: llmModelSize, setModelSize: setLlmModelSize }),
}))
vi.mock('../../../app/composables/useSummarizer', () => ({
  useSummarizer: () => ({
    state: summarizerState,
    summary,
    errorMessage: summarizerError,
    downloadProgress: summaryDownloadProgress,
    summarize,
    retry: retrySummarize,
  }),
}))
```

Añadir `LlmModelSizePicker: true, SummaryEditor: true` al objeto `stubs` de `mountPage()`:
```ts
function mountPage() {
  return mount(IndexPage, {
    global: {
      stubs: {
        RecordingTimer: true,
        TranscriptEditor: true,
        ExportMenu: true,
        ModelSizePicker: true,
      },
    },
  })
}
```
por:
```ts
function mountPage() {
  return mount(IndexPage, {
    global: {
      stubs: {
        RecordingTimer: true,
        TranscriptEditor: true,
        ExportMenu: true,
        ModelSizePicker: true,
        LlmModelSizePicker: true,
        SummaryEditor: true,
      },
    },
  })
}
```

Añadir los reseteos en `beforeEach`:
```ts
beforeEach(() => {
  vi.clearAllMocks()
  recorderState.value = 'idle'
  recorderError.value = null
  importError.value = null
  transcriptionState.value = 'idle'
  transcriptionError.value = null
  transcriptionDevice.value = null
  downloadProgress.value = null
})
```
por:
```ts
beforeEach(() => {
  vi.clearAllMocks()
  recorderState.value = 'idle'
  recorderError.value = null
  importError.value = null
  transcriptionState.value = 'idle'
  transcriptionError.value = null
  transcriptionDevice.value = null
  downloadProgress.value = null
  summarizerState.value = 'idle'
  summarizerError.value = null
  summaryDownloadProgress.value = null
  summary.value = ''
})
```

Añadir al final del `describe('index page', ...)`, antes del cierre:

```ts

  it('shows the summarize controls only once there is transcribed text', async () => {
    transcriptionText.value = 'texto reconocido'
    const wrapper = mountPage()
    expect(wrapper.find('[data-testid="summarize-button"]').exists()).toBe(false)

    transcriptionState.value = 'done'
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="summarize-button"]').exists()).toBe(true)
    expect(wrapper.findComponent(LlmModelSizePicker).exists()).toBe(true)
  })

  it('disables the summarize controls while the summary is loading or generating', async () => {
    transcriptionText.value = 'texto reconocido'
    const wrapper = mountPage()
    transcriptionState.value = 'done'
    await wrapper.vm.$nextTick()
    expect(wrapper.get<HTMLButtonElement>('[data-testid="summarize-button"]').element.disabled).toBe(false)

    summarizerState.value = 'loading-model'
    await wrapper.vm.$nextTick()
    expect(wrapper.get<HTMLButtonElement>('[data-testid="summarize-button"]').element.disabled).toBe(true)

    summarizerState.value = 'summarizing'
    await wrapper.vm.$nextTick()
    expect(wrapper.get<HTMLButtonElement>('[data-testid="summarize-button"]').element.disabled).toBe(true)
  })

  it('summarizes the edited transcript with the selected LLM size when clicked', async () => {
    transcriptionText.value = 'texto reconocido'
    const wrapper = mountPage()
    transcriptionState.value = 'done'
    await wrapper.vm.$nextTick()

    await wrapper.get('[data-testid="summarize-button"]').trigger('click')

    expect(summarize).toHaveBeenCalledWith('texto reconocido', '0.5b')
  })

  it('shows the summary editor once the summary is done', async () => {
    transcriptionText.value = 'texto reconocido'
    summary.value = 'TL;DR: resumen'
    const wrapper = mountPage()
    transcriptionState.value = 'done'
    await wrapper.vm.$nextTick()

    summarizerState.value = 'done'
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent(SummaryEditor).props('modelValue')).toBe('TL;DR: resumen')
  })

  it('shows a summarize error with a retry button', async () => {
    transcriptionText.value = 'texto reconocido'
    const wrapper = mountPage()
    transcriptionState.value = 'done'
    await wrapper.vm.$nextTick()

    summarizerState.value = 'error'
    summarizerError.value = 'boom'
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-testid="summarize-error"]').text()).toContain('boom')
    await wrapper.get('[data-testid="summarize-retry-button"]').trigger('click')
    expect(retrySummarize).toHaveBeenCalledWith('texto reconocido', '0.5b')
  })
```

- [ ] **Step 2: Ejecutar los tests para confirmar que fallan**

Run: `pnpm test -- index`
Expected: FAIL — ninguno de los `data-testid` nuevos existe todavía en `index.vue`, y los módulos `useLlmModelSelector`/`useSummarizer` mockeados no son importados por la página real.

- [ ] **Step 3: Modificar `app/pages/index.vue`**

Añadir los imports nuevos junto a los existentes:
```ts
import ModelSizePicker from '../components/settings/ModelSizePicker.vue'
```
por:
```ts
import ModelSizePicker from '../components/settings/ModelSizePicker.vue'
import LlmModelSizePicker from '../components/settings/LlmModelSizePicker.vue'
import SummaryEditor from '../components/summary/SummaryEditor.vue'
```

Y:
```ts
import { useModelSelector } from '../composables/useModelSelector'
import { useTranscription } from '../composables/useTranscription'
```
por:
```ts
import { useModelSelector } from '../composables/useModelSelector'
import { useLlmModelSelector } from '../composables/useLlmModelSelector'
import { useTranscription } from '../composables/useTranscription'
import { useSummarizer } from '../composables/useSummarizer'
```

Añadir, justo después del bloque `useTranscription()` existente (después del cierre `} = useTranscription()`):

```ts
const { modelSize: llmModelSize, setModelSize: setLlmModelSize } = useLlmModelSelector()

const {
  state: summarizerState,
  summary,
  errorMessage: summarizerError,
  downloadProgress: summaryDownloadProgress,
  summarize,
  retry: retrySummarize,
} = useSummarizer()

const editedSummary = ref('')

watch(summarizerState, (state) => {
  if (state === 'done') editedSummary.value = summary.value
})

function handleSummarize() {
  summarize(editedText.value, llmModelSize.value)
}

function handleSummarizeRetry() {
  retrySummarize(editedText.value, llmModelSize.value)
}
```

En el template, dentro del `<template v-else>` que ya envuelve `TranscriptEditor`/`ExportMenu` (dentro del `<template v-if="transcriptionState === 'done'">`), cambiar:
```html
      <template v-else>
        <TranscriptEditor v-model="editedText" />
        <ExportMenu :result="{ text: editedText, chunks: transcriptionChunks }" />
      </template>
```
por:
```html
      <template v-else>
        <TranscriptEditor v-model="editedText" />
        <ExportMenu :result="{ text: editedText, chunks: transcriptionChunks }" />

        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-600">Modelo de resumen:</span>
          <LlmModelSizePicker
            :model-value="llmModelSize"
            :disabled="summarizerState === 'loading-model' || summarizerState === 'summarizing'"
            @update:model-value="setLlmModelSize"
          />
          <button
            data-testid="summarize-button"
            class="px-4 py-2 rounded font-semibold bg-blue-600 text-white"
            :disabled="summarizerState === 'loading-model' || summarizerState === 'summarizing'"
            @click="handleSummarize"
          >
            Resumir
          </button>
        </div>
        <p v-if="summarizerState === 'loading-model'" data-testid="status-loading-model-llm">Descargando modelo de resumen…</p>
        <progress
          v-if="summaryDownloadProgress !== null"
          data-testid="llm-download-progress"
          :value="summaryDownloadProgress"
          max="100"
        />
        <p v-if="summarizerState === 'summarizing'" data-testid="status-summarizing-llm">Generando resumen…</p>
        <div v-if="summarizerState === 'error'" data-testid="summarize-error">
          <p class="text-red-600">{{ summarizerError ?? 'Ocurrió un error al generar el resumen.' }}</p>
          <button data-testid="summarize-retry-button" class="underline" @click="handleSummarizeRetry">Reintentar</button>
        </div>
        <SummaryEditor v-if="summarizerState === 'done'" v-model="editedSummary" />
      </template>
```

- [ ] **Step 4: Ejecutar los tests para confirmar que pasan**

Run: `pnpm test -- index`
Expected: PASS (18 tests passed)

- [ ] **Step 5: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan, sin regresiones)

- [ ] **Step 6: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 7: Ejecutar la suite E2E**

Run: `pnpm test:e2e`
Expected: PASS (4 tests passed) — el `FakeWhisperWorker` no se ve afectado; no se añade un fake de resumen, los tests E2E existentes no tocan esa parte de la UI.

- [ ] **Step 8: Commit**

```bash
git add app/pages/index.vue tests/unit/pages/index.test.ts
git commit -m "Conecta el resumen con LLM local en la página principal"
```

---
