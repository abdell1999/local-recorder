# Diarización — fase 3: embeddings + clustering — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Asignar identidad global de hablante (`globalSpeakerId`) consistente en todo el audio, extrayendo un embedding de voz por segmento individual (no solapado) y agrupándolos por similitud de coseno.

**Architecture:** `speakerSegmentation.worker.ts` (ya existente, fase 2) se extiende para cargar también `onnx-community/wespeaker-voxceleb-resnet34-LM`, extraer un embedding por cada segmento con `localSpeakerId` 1-3, y asignar `globalSpeakerId` mediante una función pura de clustering voraz por similitud de coseno (`app/utils/speakerClustering.ts`, nueva). Los segmentos sin voz (0) o con solape (4-6) quedan con `globalSpeakerId: null`.

**Tech Stack:** Igual que fases anteriores — Nuxt 4, TypeScript, Vitest, pnpm, `@huggingface/transformers`.

## Global Constraints

- Package manager: pnpm only.
- Commits: sin co-author, mensajes en español, siempre en `main` (`CLAUDE.md`).
- `pnpm dlx nuxi typecheck` debe seguir pasando limpio tras cada tarea. El proyecto usa `noUncheckedIndexedAccess: true` — cualquier acceso por índice a un array/typed array (`arr[i]`) tipa como `T | undefined`; usar `?? valor` o un guard explícito, nunca un cast para silenciarlo.
- Tras cada tarea, correr `pnpm test` completo para confirmar que no hay regresiones (el recuento de tests SUBE en cada tarea por los tests nuevos, nunca baja).
- `speakerSegmentation.worker.ts` no tiene test unitario directo (requiere navegador real para los modelos) — se verifica por lectura de código.
- Segmentos con `localSpeakerId` 0 (sin voz) o 4-6 (solape) NUNCA reciben `globalSpeakerId` distinto de `null` — no se les calcula embedding.
- El umbral de similitud (`SPEAKER_SIMILARITY_THRESHOLD = 0.5`) es una constante de "mejor esfuerzo" sin calibrar con audio real — no inventar lógica adicional para "mejorarlo", úsese tal cual.
- Tras completar las tres tareas, repetir la verificación manual en navegador (spike temporal) — ver spec, sección "Testing". El nombre exacto de la clave de salida del modelo de embeddings (`last_hidden_state`) viene de una verificación anterior en este mismo proyecto; si en la verificación manual resulta ser otro nombre, usar `console.log(Object.keys(output))` para encontrar el correcto y corregir el código antes de cerrar la fase.

---

### Task 1: `app/utils/speakerClustering.ts` — clustering puro por similitud de coseno

**Files:**
- Create: `app/utils/speakerClustering.ts`
- Test: `tests/unit/utils/speakerClustering.test.ts`

**Interfaces:**
- Produces: `cosineSimilarity(a: Float32Array, b: Float32Array): number` y
  `clusterEmbeddings(embeddings: Float32Array[], threshold: number): number[]`
  — ambas usadas por la Tarea 2 (`speakerSegmentation.worker.ts`).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/unit/utils/speakerClustering.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { cosineSimilarity, clusterEmbeddings } from '../../../app/utils/speakerClustering'

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([1, 0, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(1)
  })

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([0, 1, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(0)
  })

  it('returns -1 for opposite vectors', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([-1, 0, 0])
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1)
  })
})

describe('clusterEmbeddings', () => {
  it('returns an empty array for no embeddings', () => {
    expect(clusterEmbeddings([], 0.5)).toEqual([])
  })

  it('assigns a single embedding to cluster 0', () => {
    const embeddings = [new Float32Array([1, 0, 0])]
    expect(clusterEmbeddings(embeddings, 0.5)).toEqual([0])
  })

  it('groups two very similar embeddings into the same cluster', () => {
    const embeddings = [new Float32Array([1, 0, 0]), new Float32Array([0.9, 0.1, 0])]
    expect(clusterEmbeddings(embeddings, 0.5)).toEqual([0, 0])
  })

  it('splits two very different (orthogonal) embeddings into separate clusters', () => {
    const embeddings = [new Float32Array([1, 0, 0]), new Float32Array([0, 1, 0])]
    expect(clusterEmbeddings(embeddings, 0.5)).toEqual([0, 1])
  })

  it('reuses an earlier cluster when a later embedding matches it, even with a different one in between', () => {
    const embeddings = [
      new Float32Array([1, 0, 0]),
      new Float32Array([0, 1, 0]),
      new Float32Array([0.95, 0.05, 0]),
    ]
    expect(clusterEmbeddings(embeddings, 0.5)).toEqual([0, 1, 0])
  })
})
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `pnpm vitest run tests/unit/utils/speakerClustering.test.ts`
Expected: FAIL — `Cannot find module '../../../app/utils/speakerClustering'`

- [ ] **Step 3: Implementar `speakerClustering.ts`**

Crear `app/utils/speakerClustering.ts`:
```ts
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let normA = 0
  let normB = 0
  a.forEach((valueA, i) => {
    const valueB = b[i] ?? 0
    dot += valueA * valueB
    normA += valueA * valueA
    normB += valueB * valueB
  })
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

interface Centroid {
  sum: Float32Array
  count: number
}

function centroidMean(centroid: Centroid): Float32Array {
  return centroid.sum.map((value) => value / centroid.count)
}

export function clusterEmbeddings(embeddings: Float32Array[], threshold: number): number[] {
  const centroids: Centroid[] = []
  const assignments: number[] = []

  for (const embedding of embeddings) {
    let bestIndex = -1
    let bestSimilarity = -Infinity
    centroids.forEach((centroid, index) => {
      const similarity = cosineSimilarity(embedding, centroidMean(centroid))
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity
        bestIndex = index
      }
    })

    const matchedCentroid = bestIndex === -1 ? undefined : centroids[bestIndex]
    if (matchedCentroid && bestSimilarity >= threshold) {
      embedding.forEach((value, i) => {
        matchedCentroid.sum[i] = (matchedCentroid.sum[i] ?? 0) + value
      })
      matchedCentroid.count += 1
      assignments.push(bestIndex)
    } else {
      centroids.push({ sum: Float32Array.from(embedding), count: 1 })
      assignments.push(centroids.length - 1)
    }
  }

  return assignments
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `pnpm vitest run tests/unit/utils/speakerClustering.test.ts`
Expected: PASS (9/9)

- [ ] **Step 5: Ejecutar la suite completa y tipar**

Run: `pnpm test && pnpm dlx nuxi typecheck`
Expected: PASS, sin errores de tipo

- [ ] **Step 6: Commit**

```bash
git add app/utils/speakerClustering.ts tests/unit/utils/speakerClustering.test.ts
git commit -m "Añade clustering de embeddings de hablante por similitud de coseno"
```

---

### Task 2: Extender `speakerSegmentation.worker.ts` con embeddings + clustering

**Files:**
- Modify: `app/workers/speakerSegmentation.types.ts`
- Modify: `app/workers/speakerSegmentation.worker.ts`

**Interfaces:**
- Consumes: `cosineSimilarity`/`clusterEmbeddings` de la Tarea 1 (`../utils/speakerClustering`).
- Produces: tipo `SpeakerSegment` (extiende `LocalSpeakerSegment` con
  `globalSpeakerId: number | null`) y el nuevo valor de estado
  `'identifying-speakers'`, ambos consumidos por la Tarea 3
  (`useSpeakerSegmentation.ts`).

Este worker no tiene test unitario directo (requiere navegador real para
los modelos) — su corrección se verifica leyendo el código, con la suite
completa y con el typecheck.

- [ ] **Step 1: Actualizar `speakerSegmentation.types.ts`**

Cambiar (archivo completo actual):
```ts
export interface SegmentRequest {
  type: 'segment'
  audio: Float32Array
}

export interface SegmentationProgressMessage {
  type: 'progress'
  status: 'loading-model' | 'segmenting'
}

export interface SegmentationDeviceMessage {
  type: 'device'
  device: 'webgpu' | 'wasm'
}

export interface SegmentationModelProgressMessage {
  type: 'model-download-progress'
  percent: number
}

export interface LocalSpeakerSegment {
  windowIndex: number
  localSpeakerId: number
  start: number
  end: number
  confidence: number
}

export interface SegmentationResultMessage {
  type: 'result'
  segments: LocalSpeakerSegment[]
}

export interface SegmentationErrorMessage {
  type: 'error'
  message: string
}

export type SpeakerSegmentationWorkerRequest = SegmentRequest
export type SpeakerSegmentationWorkerResponse =
  | SegmentationProgressMessage
  | SegmentationDeviceMessage
  | SegmentationModelProgressMessage
  | SegmentationResultMessage
  | SegmentationErrorMessage
```
por:
```ts
export interface SegmentRequest {
  type: 'segment'
  audio: Float32Array
}

export interface SegmentationProgressMessage {
  type: 'progress'
  status: 'loading-model' | 'segmenting' | 'identifying-speakers'
}

export interface SegmentationDeviceMessage {
  type: 'device'
  device: 'webgpu' | 'wasm'
}

export interface SegmentationModelProgressMessage {
  type: 'model-download-progress'
  percent: number
}

export interface LocalSpeakerSegment {
  windowIndex: number
  localSpeakerId: number
  start: number
  end: number
  confidence: number
}

export interface SpeakerSegment extends LocalSpeakerSegment {
  globalSpeakerId: number | null
}

export interface SegmentationResultMessage {
  type: 'result'
  segments: SpeakerSegment[]
}

export interface SegmentationErrorMessage {
  type: 'error'
  message: string
}

export type SpeakerSegmentationWorkerRequest = SegmentRequest
export type SpeakerSegmentationWorkerResponse =
  | SegmentationProgressMessage
  | SegmentationDeviceMessage
  | SegmentationModelProgressMessage
  | SegmentationResultMessage
  | SegmentationErrorMessage
```

- [ ] **Step 2: Actualizar imports y constantes en `speakerSegmentation.worker.ts`**

Cambiar (líneas 1-14 actuales):
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

const MODEL_ID = 'onnx-community/pyannote-segmentation-3.0'
const SAMPLE_RATE = 16000
const WINDOW_SECONDS = 10
const STEP_SECONDS = 5
```
por:
```ts
import { AutoModel, AutoModelForAudioFrameClassification, AutoProcessor } from '@huggingface/transformers'
import type { Tensor } from '@huggingface/transformers'
import { computeWindows } from '../utils/audioWindows'
import { createProgressAggregator } from '../utils/modelDownloadProgress'
import { clusterEmbeddings } from '../utils/speakerClustering'
import type {
  SpeakerSegmentationWorkerRequest,
  SpeakerSegmentationWorkerResponse,
  LocalSpeakerSegment,
  SpeakerSegment,
} from './speakerSegmentation.types'

const MODEL_ID = 'onnx-community/pyannote-segmentation-3.0'
const EMBEDDING_MODEL_ID = 'onnx-community/wespeaker-voxceleb-resnet34-LM'
const SAMPLE_RATE = 16000
const WINDOW_SECONDS = 10
const STEP_SECONDS = 5
const SPEAKER_SIMILARITY_THRESHOLD = 0.5
```

- [ ] **Step 3: Añadir el estado y la función de carga del modelo de embeddings**

Tras la declaración existente de `let model` / `let processor` (líneas
30-31 actuales), añadir:
```ts
let embeddingModel: Awaited<ReturnType<typeof AutoModel.from_pretrained>> | null = null
let embeddingProcessor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null = null
```

Tras la función `getModelAndProcessor` existente (no se modifica), añadir
una nueva función:
```ts
async function getEmbeddingModelAndProcessor() {
  if (embeddingModel && embeddingProcessor) return { embeddingModel, embeddingProcessor }
  const device = typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm'
  const onProgress = createProgressAggregator((percent) => post({ type: 'model-download-progress', percent }))

  embeddingModel = await AutoModel.from_pretrained(EMBEDDING_MODEL_ID, {
    device: 'auto',
    dtype: device === 'wasm' ? 'q8' : undefined,
    progress_callback: onProgress,
  })
  embeddingProcessor = await AutoProcessor.from_pretrained(EMBEDDING_MODEL_ID)
  return { embeddingModel, embeddingProcessor }
}
```
Nota: esta función NO vuelve a postear `{type: 'device', device}` — ya se
posteó una vez al cargar el modelo de segmentación, y sería redundante
repetirlo con (previsiblemente) el mismo valor.

- [ ] **Step 4: Extender `self.onmessage` con la extracción de embeddings y el clustering**

Cambiar (cuerpo del `try` actual, justo antes de `post({ type: 'result', segments })`):
```ts
    post({ type: 'result', segments })
  } catch (error) {
```
por:
```ts
    const individualSegments = segments
      .map((segment, index) => ({ segment, index }))
      .filter(({ segment }) => segment.localSpeakerId >= 1 && segment.localSpeakerId <= 3)
    const globalIdByIndex = new Map<number, number>()

    if (individualSegments.length > 0) {
      post({ type: 'progress', status: 'identifying-speakers' })
      const { embeddingModel, embeddingProcessor } = await getEmbeddingModelAndProcessor()

      const embeddings: Float32Array[] = []
      for (const { segment } of individualSegments) {
        const startSample = Math.round(segment.start * SAMPLE_RATE)
        const endSample = Math.round(segment.end * SAMPLE_RATE)
        const segmentAudio = audio.subarray(startSample, endSample)
        const inputs = await embeddingProcessor(segmentAudio)
        const { last_hidden_state } = await embeddingModel(inputs)
        embeddings.push(Float32Array.from(last_hidden_state.data))
      }

      const clusterIds = clusterEmbeddings(embeddings, SPEAKER_SIMILARITY_THRESHOLD)
      individualSegments.forEach(({ index }, i) => {
        const clusterId = clusterIds[i]
        if (clusterId !== undefined) globalIdByIndex.set(index, clusterId)
      })
    }

    const resultSegments: SpeakerSegment[] = segments.map((segment, index) => ({
      ...segment,
      globalSpeakerId: globalIdByIndex.get(index) ?? null,
    }))

    post({ type: 'result', segments: resultSegments })
  } catch (error) {
```

El resto del archivo (cálculo de `segments` en el bucle de ventanas,
`getModelAndProcessor`, el tipo local `PyAnnoteSpeakerDiarizationProcessor`)
no cambia.

- [ ] **Step 5: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan, sin regresiones — este worker no
tiene tests propios; el aumento de tests viene de la Tarea 1)

- [ ] **Step 6: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores. Si `embeddingModel(inputs)` o
`last_hidden_state.data` no tipan limpiamente, comprobar que
`AutoModel.from_pretrained(...)` devuelve un modelo cuyo método de
llamada está tipado como `Promise<any>` en
`node_modules/@huggingface/transformers/types/models.d.ts` (confirmado
durante el diseño de esta fase) — no debería requerir ningún cast nuevo.

- [ ] **Step 7: Commit**

```bash
git add app/workers/speakerSegmentation.types.ts app/workers/speakerSegmentation.worker.ts
git commit -m "Añade extracción de embeddings y clustering a speakerSegmentation.worker.ts"
```

---

### Task 3: Actualizar `useSpeakerSegmentation` con `SpeakerSegment` y el nuevo estado

**Files:**
- Modify: `app/composables/useSpeakerSegmentation.ts`
- Modify: `tests/unit/composables/useSpeakerSegmentation.test.ts`

**Interfaces:**
- Consumes: tipo `SpeakerSegment` y el valor de estado
  `'identifying-speakers'` de la Tarea 2
  (`../workers/speakerSegmentation.types`).
- No produce nada nuevo para otras tareas — esta fase termina aquí (la
  fase 4, UI, queda sin diseñar).

- [ ] **Step 1: Actualizar el fixture existente para que typecheckee con la nueva forma**

En `tests/unit/composables/useSpeakerSegmentation.test.ts`, cambiar (test
"reflects progress and result messages from the worker"):
```ts
    const resultSegments = [{ windowIndex: 0, localSpeakerId: 1, start: 0, end: 2, confidence: 0.9 }]
```
por:
```ts
    const resultSegments = [{ windowIndex: 0, localSpeakerId: 1, start: 0, end: 2, confidence: 0.9, globalSpeakerId: 0 }]
```

- [ ] **Step 2: Añadir el test del nuevo estado**

En el mismo archivo, añadir tras el test "reflects progress and result
messages from the worker":
```ts
  it('reflects the identifying-speakers status from the worker', () => {
    const worker = createFakeWorker()
    const { state, segment } = useSpeakerSegmentation(() => worker)
    segment(new Float32Array([0.1]))

    worker.onmessage?.({ data: { type: 'progress', status: 'identifying-speakers' } } as MessageEvent)

    expect(state.value).toBe('identifying-speakers')
  })
```

- [ ] **Step 3: Ejecutar los tests y verificar que el nuevo test falla por tipos (no por lógica)**

Run: `pnpm vitest run tests/unit/composables/useSpeakerSegmentation.test.ts`
Expected: los tests en tiempo de ejecución PASAN igual (el composable ya
acepta cualquier string de estado sin lógica adicional) — este paso
confirma que el comportamiento en tiempo de ejecución no necesita cambios
todavía; el siguiente paso corrige los TIPOS.

- [ ] **Step 4: Actualizar `useSpeakerSegmentation.ts`**

Cambiar (líneas 1-4 actuales):
```ts
import { ref, shallowRef } from 'vue'
import type { LocalSpeakerSegment, SpeakerSegmentationWorkerResponse } from '../workers/speakerSegmentation.types'

export type SpeakerSegmentationState = 'idle' | 'loading-model' | 'segmenting' | 'done' | 'error'
```
por:
```ts
import { ref, shallowRef } from 'vue'
import type { SpeakerSegment, SpeakerSegmentationWorkerResponse } from '../workers/speakerSegmentation.types'

export type SpeakerSegmentationState = 'idle' | 'loading-model' | 'segmenting' | 'identifying-speakers' | 'done' | 'error'
```

Cambiar (línea 21 actual):
```ts
  const segments = shallowRef<LocalSpeakerSegment[]>([])
```
por:
```ts
  const segments = shallowRef<SpeakerSegment[]>([])
```

El resto del archivo no cambia.

- [ ] **Step 5: Ejecutar la suite completa y tipar**

Run: `pnpm test && pnpm dlx nuxi typecheck`
Expected: PASS (un test más que antes de esta tarea), sin errores de tipo

- [ ] **Step 6: Commit**

```bash
git add app/composables/useSpeakerSegmentation.ts tests/unit/composables/useSpeakerSegmentation.test.ts
git commit -m "Expone globalSpeakerId y el estado identifying-speakers en useSpeakerSegmentation"
```

---
