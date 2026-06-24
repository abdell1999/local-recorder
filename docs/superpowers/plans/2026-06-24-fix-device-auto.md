# Corrección del fallback WebGPU→WASM: `device:'auto'` — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir el fix de fallback WebGPU→WASM ya mergeado (`loadWithDeviceFallback`, commits `6c7cab2..79776d8`), que **no funciona de verdad** (verificado en navegador: ambos intentos fallan igual, porque `onnxruntime-web` queda con el registro de WebGPU "envenenado" tras el primer fallo dentro del mismo worker). La corrección real, ya verificada en navegador, es pasar `device:'auto'` para que `onnxruntime-web` use su propio fallback nativo entre proveedores de ejecución dentro de la misma sesión.

**Architecture:** Los tres workers (`whisper.worker.ts`, `summarizer.worker.ts`, `speakerSegmentation.worker.ts`) vuelven al patrón original (heurística `'gpu' in navigator` calculada y posteada de inmediato, solo como pista para la UI), pero la llamada real a `pipeline()`/`from_pretrained()` pasa `device:'auto'` (literal) más un `dtype` calculado a partir de esa heurística, en vez de pasar por `loadWithDeviceFallback`. La utilidad `app/utils/modelDevice.ts` se elimina una vez que ningún worker la usa.

**Tech Stack:** Igual que fases anteriores — Nuxt 4, TypeScript, Vitest, pnpm, `@huggingface/transformers`.

## Global Constraints

- Package manager: pnpm only.
- Commits: sin co-author, mensajes en español, siempre en `main` (`CLAUDE.md`).
- Los tres workers no tienen test unitario directo (requieren navegador real) — se verifican por lectura de código.
- `pnpm dlx nuxi typecheck` debe seguir pasando limpio tras cada tarea.
- Tras cada tarea, correr `pnpm test` completo para confirmar que no hay regresiones (salvo en la Tarea 4, donde el recuento de tests baja en 4 por la eliminación deliberada de `modelDevice.test.ts`).
- `app/utils/modelDevice.ts` solo se elimina en la Tarea 4, **después** de que los tres workers (Tareas 1-3) ya no lo importen — eliminarlo antes rompería la compilación de los workers que aún lo usan.
- Tras completar las cuatro tareas, repetir la verificación manual en navegador para **los tres workers** (no solo Whisper) — ver spec, sección "Testing".

---

### Task 1: Aplicar `device:'auto'` en `whisper.worker.ts`

**Files:**
- Modify: `app/workers/whisper.worker.ts:1-36`

**Interfaces:**
- No consume nada nuevo — deja de consumir `loadWithDeviceFallback`.
- No produce nada nuevo. El protocolo de mensajes (`WhisperWorkerResponse`) no cambia de forma.

Este archivo no tiene test unitario directo (requiere navegador real para `pipeline()`) — su corrección se verifica leyendo el código y con la suite completa + typecheck.

- [ ] **Step 1: Quitar el import de `loadWithDeviceFallback`**

Cambiar (líneas 1-6 actuales):
```ts
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import { getModelRepoId, type WhisperModelSize } from '../utils/whisperModels'
import type { WhisperWorkerRequest, WhisperWorkerResponse, WhisperChunk } from './whisper.types'
import { filterNonSpeechChunks, deriveText } from '../utils/transcriptClean'
import { createProgressAggregator } from '../utils/modelDownloadProgress'
import { loadWithDeviceFallback } from '../utils/modelDevice'
```
por:
```ts
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import { getModelRepoId, type WhisperModelSize } from '../utils/whisperModels'
import type { WhisperWorkerRequest, WhisperWorkerResponse, WhisperChunk } from './whisper.types'
import { filterNonSpeechChunks, deriveText } from '../utils/transcriptClean'
import { createProgressAggregator } from '../utils/modelDownloadProgress'
```

- [ ] **Step 2: Reescribir `getTranscriber`**

Cambiar (líneas 21-36 actuales):
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
por:
```ts
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
```

El resto del archivo (`self.onmessage`, `CHUNK_LENGTH_S`/`STRIDE_LENGTH_S`) no cambia.

- [ ] **Step 3: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan, sin regresiones — este archivo no tiene tests propios)

- [ ] **Step 4: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores. Si el literal `'q8'` para `dtype` no es asignable al tipo esperado por `pipeline()`, comprobar `node_modules/@huggingface/transformers/src/utils/dtypes.js` (`DATA_TYPES.q8 = 'q8'`) antes de inventar un cast — el valor es correcto, solo hace falta confirmar cómo se tipa la opción `dtype` en `PretrainedOptions`.

- [ ] **Step 5: Commit**

```bash
git add app/workers/whisper.worker.ts
git commit -m "Usa device:'auto' en vez de loadWithDeviceFallback en whisper.worker.ts"
```

---

### Task 2: Aplicar `device:'auto'` en `summarizer.worker.ts`

**Files:**
- Modify: `app/workers/summarizer.worker.ts:1-35`

**Interfaces:**
- No consume nada nuevo — deja de consumir `loadWithDeviceFallback`.
- No produce nada nuevo. El protocolo de mensajes no cambia de forma.

Sin test unitario directo — verificado por lectura de código y suite + typecheck.

- [ ] **Step 1: Quitar el import de `loadWithDeviceFallback`**

Cambiar (líneas 1-5 actuales):
```ts
import { pipeline, type TextGenerationPipeline, type TextGenerationOutput, type Message } from '@huggingface/transformers'
import { getLlmModelRepoId, type LlmModelSize } from '../utils/llmModels'
import type { SummarizerWorkerRequest, SummarizerWorkerResponse } from './summarizer.types'
import { createProgressAggregator } from '../utils/modelDownloadProgress'
import { loadWithDeviceFallback } from '../utils/modelDevice'
```
por:
```ts
import { pipeline, type TextGenerationPipeline, type TextGenerationOutput, type Message } from '@huggingface/transformers'
import { getLlmModelRepoId, type LlmModelSize } from '../utils/llmModels'
import type { SummarizerWorkerRequest, SummarizerWorkerResponse } from './summarizer.types'
import { createProgressAggregator } from '../utils/modelDownloadProgress'
```

- [ ] **Step 2: Reescribir `getGenerator`**

Cambiar (líneas 20-35 actuales):
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
por:
```ts
async function getGenerator(modelSize: LlmModelSize) {
  if (generator && loadedModelSize === modelSize) return generator
  post({ type: 'progress', status: 'loading-model' })
  // Heurística usada solo como pista para la UI y para el dtype — la
  // selección real de backend la hace onnxruntime-web internamente vía
  // device:'auto' (ver docs/superpowers/specs/2026-06-24-fix-device-auto-design.md).
  const device = typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm'
  post({ type: 'device', device })

  const onProgress = createProgressAggregator((percent) => post({ type: 'model-download-progress', percent }))

  generator = await pipeline<'text-generation'>(
    'text-generation',
    getLlmModelRepoId(modelSize),
    { device: 'auto', dtype: device === 'wasm' ? 'q8' : undefined, progress_callback: onProgress },
  )
  loadedModelSize = modelSize
  return generator
}
```

El resto del archivo (`self.onmessage`, `SUMMARY_SYSTEM_PROMPT`) no cambia.

- [ ] **Step 3: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan, sin regresiones)

- [ ] **Step 4: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 5: Commit**

```bash
git add app/workers/summarizer.worker.ts
git commit -m "Usa device:'auto' en vez de loadWithDeviceFallback en summarizer.worker.ts"
```

---

### Task 3: Aplicar `device:'auto'` en `speakerSegmentation.worker.ts`

**Files:**
- Modify: `app/workers/speakerSegmentation.worker.ts:1-53`

**Interfaces:**
- No consume nada nuevo — deja de consumir `loadWithDeviceFallback`.
- No produce nada nuevo. El protocolo de mensajes no cambia de forma.

Sin test unitario directo — verificado por lectura de código y suite + typecheck.

- [ ] **Step 1: Quitar el import de `loadWithDeviceFallback`**

Cambiar (líneas 1-10 actuales):
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
por:
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

- [ ] **Step 2: Reescribir `getModelAndProcessor`**

Cambiar (líneas 38-53 actuales):
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
por:
```ts
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
git commit -m "Usa device:'auto' en vez de loadWithDeviceFallback en speakerSegmentation.worker.ts"
```

---

### Task 4: Eliminar `app/utils/modelDevice.ts`

**Files:**
- Delete: `app/utils/modelDevice.ts`
- Delete: `tests/unit/utils/modelDevice.test.ts`

**Interfaces:**
- No consume ni produce nada — esta tarea solo elimina código ya no usado por ninguno de los tres workers (Tareas 1-3, ya completadas).

- [ ] **Step 1: Confirmar que ya no hay ningún import de `modelDevice`**

Run: `grep -rn "modelDevice" app/ tests/`
Expected: sin resultados (ningún archivo de `app/` ni `tests/` referencia ya `modelDevice` o `loadWithDeviceFallback`)

- [ ] **Step 2: Eliminar los dos archivos**

```bash
rm app/utils/modelDevice.ts tests/unit/utils/modelDevice.test.ts
```

- [ ] **Step 3: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (el recuento total de tests baja en 4 respecto a antes de esta tarea — los 4 tests de `modelDevice.test.ts` ya no existen — el resto pasa igual)

- [ ] **Step 4: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 5: Commit**

```bash
git add app/utils/modelDevice.ts tests/unit/utils/modelDevice.test.ts
git commit -m "Elimina modelDevice.ts: no resolvía el problema real, sustituido por device:'auto'"
```

---
