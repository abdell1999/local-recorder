# Fallback WebGPU→WASM en los workers de IA — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir la detección frágil de dispositivo (`'gpu' in navigator`) en los tres workers de IA (`whisper.worker.ts`, `summarizer.worker.ts`, `speakerSegmentation.worker.ts`), que hoy falla sin red de seguridad cuando `navigator.gpu` existe pero la inicialización de WebGPU falla — confirmado en navegador real que esto rompe Whisper, no solo el worker de segmentación más reciente.

**Architecture:** Una utilidad compartida nueva, `loadWithDeviceFallback`, intenta cargar con `device:'webgpu'` y reintenta automáticamente con `device:'wasm'` si falla. Los tres workers se modifican para envolver su llamada de carga del modelo en esta utilidad en vez de calcular `device` directamente.

**Tech Stack:** Igual que fases anteriores — Nuxt 4, TypeScript, Vitest, pnpm, `@huggingface/transformers`.

## Global Constraints

- Package manager: pnpm only.
- Commits: sin co-author, mensajes en español, siempre en `main` (`CLAUDE.md`).
- Los tres workers no tienen test unitario directo (requieren navegador real) — se verifican por lectura de código.
- `pnpm dlx nuxi typecheck` debe seguir pasando limpio tras cada tarea.
- Tras cada tarea, correr `pnpm test` completo para confirmar que no hay regresiones.
- El `createProgressAggregator` debe crearse dentro del `loadFn` de cada worker (un agregador nuevo por intento), no compartido entre el intento WebGPU y el de WASM — ver spec para el motivo (variantes de precisión/archivos distintos por dispositivo).
- El mensaje `{type:'device', device}` se postea con el dispositivo que **realmente funcionó**, tras resolver `loadWithDeviceFallback` — no antes.
- Sin detección proactiva (`requestAdapter()`), sin tercera red de seguridad si `wasm` también falla, sin cambios de UI (todo fuera de alcance, ver spec).
- La verificación manual en navegador (repetir el script de Playwright que reveló el bug) **no es una tarea de este plan** — se hace después, directamente por el controlador, mismo criterio ya usado para los spikes de diarización.

---

### Task 1: Utilidad `loadWithDeviceFallback`

**Files:**
- Create: `app/utils/modelDevice.ts`
- Test: `tests/unit/utils/modelDevice.test.ts`

**Interfaces:**
- Produces: `type ModelDevice = 'webgpu' | 'wasm'`; `loadWithDeviceFallback<T>(loadFn: (device: ModelDevice) => Promise<T>): Promise<{ result: T; device: ModelDevice }>`. Consumido por las Tareas 2, 3 y 4.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/utils/modelDevice.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { loadWithDeviceFallback } from '../../../app/utils/modelDevice'

describe('loadWithDeviceFallback', () => {
  it('uses webgpu when navigator.gpu is present and loadFn succeeds', async () => {
    vi.stubGlobal('navigator', { gpu: {} })
    const loadFn = vi.fn().mockResolvedValue('model-result')

    const { result, device } = await loadWithDeviceFallback(loadFn)

    expect(device).toBe('webgpu')
    expect(result).toBe('model-result')
    expect(loadFn).toHaveBeenCalledTimes(1)
    expect(loadFn).toHaveBeenCalledWith('webgpu')
  })

  it('falls back to wasm when navigator.gpu is present but the webgpu attempt fails', async () => {
    vi.stubGlobal('navigator', { gpu: {} })
    const loadFn = vi.fn().mockRejectedValueOnce(new Error('no adapter')).mockResolvedValueOnce('wasm-result')

    const { result, device } = await loadWithDeviceFallback(loadFn)

    expect(device).toBe('wasm')
    expect(result).toBe('wasm-result')
    expect(loadFn).toHaveBeenNthCalledWith(1, 'webgpu')
    expect(loadFn).toHaveBeenNthCalledWith(2, 'wasm')
  })

  it('uses wasm directly when navigator.gpu is absent', async () => {
    vi.stubGlobal('navigator', {})
    const loadFn = vi.fn().mockResolvedValue('wasm-result')

    const { result, device } = await loadWithDeviceFallback(loadFn)

    expect(device).toBe('wasm')
    expect(loadFn).toHaveBeenCalledTimes(1)
    expect(loadFn).toHaveBeenCalledWith('wasm')
  })

  it('propagates the error when both webgpu and wasm attempts fail', async () => {
    vi.stubGlobal('navigator', { gpu: {} })
    const loadFn = vi.fn().mockRejectedValue(new Error('boom'))

    await expect(loadWithDeviceFallback(loadFn)).rejects.toThrow('boom')
  })
})
```

- [ ] **Step 2: Ejecutar el test para confirmar que falla**

Run: `pnpm test -- modelDevice`
Expected: FAIL con "Cannot find module '../../../app/utils/modelDevice'"

- [ ] **Step 3: Implementar `app/utils/modelDevice.ts`**

```ts
export type ModelDevice = 'webgpu' | 'wasm'

export async function loadWithDeviceFallback<T>(
  loadFn: (device: ModelDevice) => Promise<T>,
): Promise<{ result: T; device: ModelDevice }> {
  const canTryWebgpu = typeof navigator !== 'undefined' && 'gpu' in navigator
  if (canTryWebgpu) {
    try {
      return { result: await loadFn('webgpu'), device: 'webgpu' }
    } catch {
      // WebGPU existe pero falló al inicializar — se ignora y se
      // reintenta con WASM en vez de propagar el error.
    }
  }
  return { result: await loadFn('wasm'), device: 'wasm' }
}
```

- [ ] **Step 4: Ejecutar el test para confirmar que pasa**

Run: `pnpm test -- modelDevice`
Expected: PASS (4 tests passed)

- [ ] **Step 5: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 6: Commit**

```bash
git add app/utils/modelDevice.ts tests/unit/utils/modelDevice.test.ts
git commit -m "Añade loadWithDeviceFallback para reintentar con WASM si WebGPU falla"
```

---

### Task 2: Aplicar el fallback en `whisper.worker.ts`

**Files:**
- Modify: `app/workers/whisper.worker.ts:1-35`

**Interfaces:**
- Consumes: `loadWithDeviceFallback` de `app/utils/modelDevice.ts` (Tarea 1).
- No produce nada nuevo — `whisper.worker.ts` no tiene otros consumidores dentro del repo más allá de `useTranscription.ts`, que no cambia (el protocolo de mensajes `{type:'device', device}` no cambia de forma, solo cuándo se postea).

Este archivo no tiene test unitario directo (requiere navegador real para `pipeline()`) — su corrección se verifica leyendo el código y con la suite completa + typecheck.

- [ ] **Step 1: Añadir el import**

Cambiar (líneas 1-5 actuales):
```ts
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import { getModelRepoId, type WhisperModelSize } from '../utils/whisperModels'
import type { WhisperWorkerRequest, WhisperWorkerResponse, WhisperChunk } from './whisper.types'
import { filterNonSpeechChunks, deriveText } from '../utils/transcriptClean'
import { createProgressAggregator } from '../utils/modelDownloadProgress'
```
por:
```ts
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import { getModelRepoId, type WhisperModelSize } from '../utils/whisperModels'
import type { WhisperWorkerRequest, WhisperWorkerResponse, WhisperChunk } from './whisper.types'
import { filterNonSpeechChunks, deriveText } from '../utils/transcriptClean'
import { createProgressAggregator } from '../utils/modelDownloadProgress'
import { loadWithDeviceFallback } from '../utils/modelDevice'
```

- [ ] **Step 2: Reescribir `getTranscriber`**

Cambiar (líneas 20-35 actuales):
```ts
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
por:
```ts
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
```

El resto del archivo (`self.onmessage`) no cambia.

- [ ] **Step 3: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan, sin regresiones — este archivo no tiene tests propios)

- [ ] **Step 4: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 5: Commit**

```bash
git add app/workers/whisper.worker.ts
git commit -m "Aplica loadWithDeviceFallback en whisper.worker.ts"
```

---

### Task 3: Aplicar el fallback en `summarizer.worker.ts`

**Files:**
- Modify: `app/workers/summarizer.worker.ts:1-34`

**Interfaces:**
- Consumes: `loadWithDeviceFallback` de `app/utils/modelDevice.ts` (Tarea 1).
- No produce nada nuevo — el protocolo de mensajes no cambia de forma.

Sin test unitario directo (requiere navegador real) — verificado por lectura de código y suite + typecheck.

- [ ] **Step 1: Añadir el import**

Cambiar (líneas 1-4 actuales):
```ts
import { pipeline, type TextGenerationPipeline, type TextGenerationOutput, type Message } from '@huggingface/transformers'
import { getLlmModelRepoId, type LlmModelSize } from '../utils/llmModels'
import type { SummarizerWorkerRequest, SummarizerWorkerResponse } from './summarizer.types'
import { createProgressAggregator } from '../utils/modelDownloadProgress'
```
por:
```ts
import { pipeline, type TextGenerationPipeline, type TextGenerationOutput, type Message } from '@huggingface/transformers'
import { getLlmModelRepoId, type LlmModelSize } from '../utils/llmModels'
import type { SummarizerWorkerRequest, SummarizerWorkerResponse } from './summarizer.types'
import { createProgressAggregator } from '../utils/modelDownloadProgress'
import { loadWithDeviceFallback } from '../utils/modelDevice'
```

- [ ] **Step 2: Reescribir `getGenerator`**

Cambiar (líneas 19-34 actuales):
```ts
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
```
por:
```ts
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
```

El resto del archivo (`self.onmessage`) no cambia.

- [ ] **Step 3: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan, sin regresiones)

- [ ] **Step 4: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 5: Commit**

```bash
git add app/workers/summarizer.worker.ts
git commit -m "Aplica loadWithDeviceFallback en summarizer.worker.ts"
```

---

### Task 4: Aplicar el fallback en `speakerSegmentation.worker.ts`

**Files:**
- Modify: `app/workers/speakerSegmentation.worker.ts:1-51`

**Interfaces:**
- Consumes: `loadWithDeviceFallback` de `app/utils/modelDevice.ts` (Tarea 1).
- No produce nada nuevo — el protocolo de mensajes no cambia de forma.

Sin test unitario directo (requiere navegador real) — verificado por lectura de código y suite + typecheck.

- [ ] **Step 1: Añadir el import**

Cambiar (líneas 1-9 actuales):
```ts
import { AutoModelForAudioFrameClassification, AutoProcessor } from '@huggingface/transformers'
import type { Tensor } from '@huggingface/transformers'
import { computeWindows } from '../utils/audioWindows'
import { createProgressAggregator } from '../utils/modelDownloadProgress'
import type {
  SpeakerSegmentationWorkerRequest,
  SpeakerSegmentationWorkerResponse,
  LocalSpeakerSegment,
} from './speakerSegmentation.types'
```
por:
```ts
import { AutoModelForAudioFrameClassification, AutoProcessor } from '@huggingface/transformers'
import type { Tensor } from '@huggingface/transformers'
import { computeWindows } from '../utils/audioWindows'
import { createProgressAggregator } from '../utils/modelDownloadProgress'
import { loadWithDeviceFallback } from '../utils/modelDevice'
import type {
  SpeakerSegmentationWorkerRequest,
  SpeakerSegmentationWorkerResponse,
  LocalSpeakerSegment,
} from './speakerSegmentation.types'
```

- [ ] **Step 2: Reescribir `getModelAndProcessor`**

Cambiar (líneas 37-51 actuales):
```ts
async function getModelAndProcessor() {
  if (model && processor) return { model, processor }
  post({ type: 'progress', status: 'loading-model' })
  const device = typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm'
  post({ type: 'device', device })

  const onProgress = createProgressAggregator((percent) => post({ type: 'model-download-progress', percent }))

  model = await AutoModelForAudioFrameClassification.from_pretrained(MODEL_ID, {
    device,
    progress_callback: onProgress,
  })
  processor = await AutoProcessor.from_pretrained(MODEL_ID)
  return { model, processor }
}
```
por:
```ts
async function getModelAndProcessor() {
  if (model && processor) return { model, processor }
  post({ type: 'progress', status: 'loading-model' })

  const { result, device } = await loadWithDeviceFallback((device) =>
    AutoModelForAudioFrameClassification.from_pretrained(MODEL_ID, {
      device,
      progress_callback: createProgressAggregator((percent) => post({ type: 'model-download-progress', percent })),
    }),
  )
  post({ type: 'device', device })

  model = result
  processor = await AutoProcessor.from_pretrained(MODEL_ID)
  return { model, processor }
}
```

El resto del archivo (`self.onmessage`, el tipo local `PyAnnoteSpeakerDiarizationProcessor`) no cambia.

- [ ] **Step 3: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan, sin regresiones)

- [ ] **Step 4: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 5: Commit**

```bash
git add app/workers/speakerSegmentation.worker.ts
git commit -m "Aplica loadWithDeviceFallback en speakerSegmentation.worker.ts"
```

---
