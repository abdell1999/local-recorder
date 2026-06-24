# Diarización — fase 2: segmentación troceada — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar la segmentación de hablantes troceada (ventanas de 10s con paso de 5s) con `onnx-community/pyannote-segmentation-3.0`, produciendo segmentos con identidad *local* por ventana (sin resolver identidad global — eso es la fase 3) y timestamps absolutos dentro de todo el audio.

**Architecture:** Una función pura (`computeWindows`) calcula los offsets de ventana; un worker nuevo (`speakerSegmentation.worker.ts`) carga el modelo y, por cada ventana, llama a `processor.post_process_speaker_diarization` (ya integrado en `@huggingface/transformers`) y ajusta los tiempos a absolutos; un composable (`useSpeakerSegmentation`) envuelve el worker con el mismo patrón de estado/progreso/reintento que `useTranscription`/`useSummarizer`. Esta fase no conecta nada a la UI — la verificación en navegador se hace aparte, fuera de este plan, con un arnés temporal que se descarta al terminar (igual que el spike de la fase 1).

**Tech Stack:** Igual que fases anteriores — Nuxt 4, TypeScript, Vue `<script setup>`, Vitest, pnpm, `@huggingface/transformers` (clases `AutoModelForAudioFrameClassification`/`AutoProcessor`, no `pipeline()` — no existe una tarea genérica de pipeline para esto).

## Global Constraints

- Package manager: pnpm only.
- Commits: sin co-author, mensajes en español, siempre en `main` (`CLAUDE.md`).
- Composables con imports explícitos de `vue`, no auto-imports de Nuxt.
- `speakerSegmentation.worker.ts` no tiene test unitario directo (requiere navegador real para el modelo) — se verifica por lectura de código, igual que `whisper.worker.ts`/`summarizer.worker.ts`.
- `pnpm dlx nuxi typecheck` debe seguir pasando limpio tras cada tarea.
- Tras cada tarea, correr `pnpm test` completo para confirmar que no hay regresiones.
- Modelo exacto a usar: `onnx-community/pyannote-segmentation-3.0`, sample rate 16000Hz, ventana 10s, paso 5s — constantes fijas, sin configuración de usuario.
- Sin extracción de audio/embeddings por segmento, sin resolución de identidad global, sin UI (todo fuera de alcance, ver spec).
- La verificación en navegador de esta fase (spike temporal) **no es una tarea de este plan** — se hace después, directamente por el controlador, igual que el spike de la fase 1 de diarización.

---

### Task 1: `computeWindows`

**Files:**
- Create: `app/utils/audioWindows.ts`
- Test: `tests/unit/utils/audioWindows.test.ts`

**Interfaces:**
- Produces: `interface AudioWindow { start: number; end: number }`; `computeWindows(totalSamples: number, sampleRate: number, windowSeconds: number, stepSeconds: number): AudioWindow[]`. Consumido por la Tarea 2 (`speakerSegmentation.worker.ts`).

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/utils/audioWindows.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeWindows } from '../../../app/utils/audioWindows'

const SAMPLE_RATE = 16000

describe('computeWindows', () => {
  it('returns a single window when the audio is shorter than one window', () => {
    const totalSamples = 3 * SAMPLE_RATE
    expect(computeWindows(totalSamples, SAMPLE_RATE, 10, 5)).toEqual([{ start: 0, end: totalSamples }])
  })

  it('returns a single window when the audio is exactly one window long', () => {
    const totalSamples = 10 * SAMPLE_RATE
    expect(computeWindows(totalSamples, SAMPLE_RATE, 10, 5)).toEqual([{ start: 0, end: totalSamples }])
  })

  it('covers audio that aligns exactly with the step, ending exactly on the last window', () => {
    const totalSamples = 25 * SAMPLE_RATE
    const windows = computeWindows(totalSamples, SAMPLE_RATE, 10, 5)
    expect(windows).toEqual([
      { start: 0, end: 10 * SAMPLE_RATE },
      { start: 5 * SAMPLE_RATE, end: 15 * SAMPLE_RATE },
      { start: 10 * SAMPLE_RATE, end: 20 * SAMPLE_RATE },
      { start: 15 * SAMPLE_RATE, end: 25 * SAMPLE_RATE },
    ])
  })

  it('shortens the final window when the audio does not align exactly with the step', () => {
    const totalSamples = 23 * SAMPLE_RATE
    const windows = computeWindows(totalSamples, SAMPLE_RATE, 10, 5)
    expect(windows).toEqual([
      { start: 0, end: 10 * SAMPLE_RATE },
      { start: 5 * SAMPLE_RATE, end: 15 * SAMPLE_RATE },
      { start: 10 * SAMPLE_RATE, end: 20 * SAMPLE_RATE },
      { start: 15 * SAMPLE_RATE, end: 23 * SAMPLE_RATE },
    ])
  })
})
```

- [ ] **Step 2: Ejecutar el test para confirmar que falla**

Run: `pnpm test -- audioWindows`
Expected: FAIL con "Cannot find module '../../../app/utils/audioWindows'"

- [ ] **Step 3: Implementar `app/utils/audioWindows.ts`**

```ts
export interface AudioWindow {
  start: number
  end: number
}

export function computeWindows(
  totalSamples: number,
  sampleRate: number,
  windowSeconds: number,
  stepSeconds: number,
): AudioWindow[] {
  const windowSamples = Math.round(windowSeconds * sampleRate)
  const stepSamples = Math.round(stepSeconds * sampleRate)

  if (totalSamples <= windowSamples) {
    return [{ start: 0, end: totalSamples }]
  }

  const windows: AudioWindow[] = []
  let start = 0
  while (true) {
    const end = Math.min(start + windowSamples, totalSamples)
    windows.push({ start, end })
    if (end >= totalSamples) break
    start += stepSamples
  }
  return windows
}
```

- [ ] **Step 4: Ejecutar el test para confirmar que pasa**

Run: `pnpm test -- audioWindows`
Expected: PASS (4 tests passed)

- [ ] **Step 5: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 6: Commit**

```bash
git add app/utils/audioWindows.ts tests/unit/utils/audioWindows.test.ts
git commit -m "Añade computeWindows para trocear audio en ventanas con solape"
```

---

### Task 2: Protocolo y worker de segmentación

**Files:**
- Create: `app/workers/speakerSegmentation.types.ts`
- Create: `app/workers/speakerSegmentation.worker.ts`

**Interfaces:**
- Consumes: `computeWindows` de `app/utils/audioWindows.ts` (Tarea 1); `createProgressAggregator` de `app/utils/modelDownloadProgress.ts` (ya existe, de la fase de resumen LLM).
- Produces: protocolo `SpeakerSegmentationWorkerRequest`/`SpeakerSegmentationWorkerResponse` y el tipo `LocalSpeakerSegment`, y el archivo de worker en `app/workers/speakerSegmentation.worker.ts` (referenciado por ruta desde la Tarea 3).
- Ninguno de los dos archivos tiene test unitario directo (el modelo requiere navegador real) — se verifican por lectura de código.

- [ ] **Step 1: Implementar `app/workers/speakerSegmentation.types.ts`**

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

- [ ] **Step 2: Implementar `app/workers/speakerSegmentation.worker.ts`**

```ts
import { AutoModelForAudioFrameClassification, AutoProcessor } from '@huggingface/transformers'
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

let model: Awaited<ReturnType<typeof AutoModelForAudioFrameClassification.from_pretrained>> | null = null
let processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null = null

function post(message: SpeakerSegmentationWorkerResponse) {
  ;(self as unknown as Worker).postMessage(message)
}

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
      const [windowSegments] = processor.post_process_speaker_diarization(logits, windowAudio.length)
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
```

Nota: `windows.entries()` se usa en vez de indexar `windows[i]` para evitar el
mismo problema de `noUncheckedIndexedAccess` que ya se encontró al
implementar `summarizer.worker.ts` en la fase de resumen LLM — con
`.entries()` TypeScript sabe que cada par `[windowIndex, window]` existe,
sin necesitar comprobaciones adicionales.

- [ ] **Step 3: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores. Si `AutoModelForAudioFrameClassification` no se
resuelve como tipo/valor importable desde `@huggingface/transformers`,
comprobar que `node_modules/@huggingface/transformers/types/models.d.ts`
lo exporta (línea ~4196) antes de inventar un tipo local.

- [ ] **Step 4: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan — ninguno ejercita estos dos archivos
nuevos directamente, así que el recuento de tests no cambia)

- [ ] **Step 5: Commit**

```bash
git add app/workers/speakerSegmentation.types.ts app/workers/speakerSegmentation.worker.ts
git commit -m "Añade worker de segmentación de hablantes troceada (pyannote-segmentation-3.0)"
```

---

### Task 3: Composable `useSpeakerSegmentation`

**Files:**
- Create: `app/composables/useSpeakerSegmentation.ts`
- Test: `tests/unit/composables/useSpeakerSegmentation.test.ts`

**Interfaces:**
- Consumes: tipos `LocalSpeakerSegment`/`SpeakerSegmentationWorkerResponse` de `app/workers/speakerSegmentation.types.ts` (Tarea 2); el archivo `app/workers/speakerSegmentation.worker.ts` (Tarea 2) por ruta, para el worker por defecto.
- Produces: `useSpeakerSegmentation(createWorker?): { state: Ref<SpeakerSegmentationState>; segments: Ref<LocalSpeakerSegment[]>; errorMessage: Ref<string|null>; device: Ref<'webgpu'|'wasm'|null>; downloadProgress: Ref<number|null>; segment(audio: Float32Array): void; retry(audio: Float32Array): void }`. Tipo exportado `MinimalSegmentationWorker`. Sin consumidores todavía (la fase 4, fuera de este plan, lo conectará a la UI).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/unit/composables/useSpeakerSegmentation.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { useSpeakerSegmentation, type MinimalSegmentationWorker } from '../../../app/composables/useSpeakerSegmentation'

function createFakeWorker() {
  const worker: MinimalSegmentationWorker = {
    postMessage: vi.fn(),
    onmessage: null,
    onerror: null,
    terminate: vi.fn(),
  }
  return worker
}

describe('useSpeakerSegmentation', () => {
  it('moves to loading-model and posts a segment message', () => {
    const worker = createFakeWorker()
    const { state, segment } = useSpeakerSegmentation(() => worker)

    segment(new Float32Array([0.1]))

    expect(state.value).toBe('loading-model')
    expect(worker.postMessage).toHaveBeenCalledWith(
      { type: 'segment', audio: expect.any(Float32Array) },
      expect.any(Array),
    )
  })

  it('clones the audio buffer before posting so the original stays usable afterwards', () => {
    const worker = createFakeWorker()
    const { segment } = useSpeakerSegmentation(() => worker)
    const original = new Float32Array([0.1, 0.2, 0.3])

    segment(original)

    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    const [message, transferList] = (worker.postMessage as ReturnType<typeof vi.fn>).mock.calls[0] as [
      { audio: Float32Array },
      Transferable[],
    ]
    expect(message.audio).not.toBe(original)
    expect(Array.from(message.audio)).toEqual(Array.from(original))
    expect(transferList).toEqual([message.audio.buffer])
  })

  it('reflects progress and result messages from the worker', () => {
    const worker = createFakeWorker()
    const { state, segments, segment } = useSpeakerSegmentation(() => worker)
    segment(new Float32Array([0.1]))

    worker.onmessage?.({ data: { type: 'progress', status: 'segmenting' } } as MessageEvent)
    expect(state.value).toBe('segmenting')

    const resultSegments = [{ windowIndex: 0, localSpeakerId: 1, start: 0, end: 2, confidence: 0.9 }]
    worker.onmessage?.({ data: { type: 'result', segments: resultSegments } } as MessageEvent)
    expect(state.value).toBe('done')
    expect(segments.value).toEqual(resultSegments)
  })

  it('reflects the chosen device when the worker reports it', () => {
    const worker = createFakeWorker()
    const { device, segment } = useSpeakerSegmentation(() => worker)
    segment(new Float32Array([0.1]))

    worker.onmessage?.({ data: { type: 'device', device: 'wasm' } } as MessageEvent)

    expect(device.value).toBe('wasm')
  })

  it('reflects error messages from the worker', () => {
    const worker = createFakeWorker()
    const { state, errorMessage, segment } = useSpeakerSegmentation(() => worker)
    segment(new Float32Array([0.1]))

    worker.onmessage?.({ data: { type: 'error', message: 'boom' } } as MessageEvent)

    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('boom')
  })

  it('treats a worker crash as an error', () => {
    const worker = createFakeWorker()
    const { state, errorMessage, segment } = useSpeakerSegmentation(() => worker)
    segment(new Float32Array([0.1]))

    worker.onerror?.(new Event('error') as ErrorEvent)

    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('worker-crashed')
  })

  it('resets download progress when the worker crashes mid-download', () => {
    const worker = createFakeWorker()
    const { downloadProgress, segment } = useSpeakerSegmentation(() => worker)
    segment(new Float32Array([0.1]))
    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 55 } } as MessageEvent)
    expect(downloadProgress.value).toBe(55)

    worker.onerror?.(new Event('error') as ErrorEvent)

    expect(downloadProgress.value).toBeNull()
  })

  it('retry terminates the old worker and creates a new one', () => {
    const firstWorker = createFakeWorker()
    const secondWorker = createFakeWorker()
    const factory = vi.fn().mockReturnValueOnce(firstWorker).mockReturnValueOnce(secondWorker)
    const { segment, retry } = useSpeakerSegmentation(factory)
    segment(new Float32Array([0.1]))

    retry(new Float32Array([0.1]))

    expect(firstWorker.terminate).toHaveBeenCalled()
    expect(secondWorker.postMessage).toHaveBeenCalled()
  })

  it('reflects model download progress messages from the worker', () => {
    const worker = createFakeWorker()
    const { downloadProgress, segment } = useSpeakerSegmentation(() => worker)
    segment(new Float32Array([0.1]))

    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 42 } } as MessageEvent)

    expect(downloadProgress.value).toBe(42)
  })

  it('resets download progress once segmenting starts', () => {
    const worker = createFakeWorker()
    const { downloadProgress, state, segment } = useSpeakerSegmentation(() => worker)
    segment(new Float32Array([0.1]))
    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 80 } } as MessageEvent)
    expect(downloadProgress.value).toBe(80)

    worker.onmessage?.({ data: { type: 'progress', status: 'segmenting' } } as MessageEvent)

    expect(state.value).toBe('segmenting')
    expect(downloadProgress.value).toBeNull()
  })

  it('resets download progress when the worker reports an error', () => {
    const worker = createFakeWorker()
    const { downloadProgress, segment } = useSpeakerSegmentation(() => worker)
    segment(new Float32Array([0.1]))
    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 30 } } as MessageEvent)

    worker.onmessage?.({ data: { type: 'error', message: 'boom' } } as MessageEvent)

    expect(downloadProgress.value).toBeNull()
  })
})
```

- [ ] **Step 2: Ejecutar los tests para confirmar que fallan**

Run: `pnpm test -- useSpeakerSegmentation`
Expected: FAIL con "Cannot find module '../../../app/composables/useSpeakerSegmentation'"

- [ ] **Step 3: Implementar `app/composables/useSpeakerSegmentation.ts`**

```ts
import { ref, shallowRef } from 'vue'
import type { LocalSpeakerSegment, SpeakerSegmentationWorkerResponse } from '../workers/speakerSegmentation.types'

export type SpeakerSegmentationState = 'idle' | 'loading-model' | 'segmenting' | 'done' | 'error'

export interface MinimalSegmentationWorker {
  postMessage: (message: unknown, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent<SpeakerSegmentationWorkerResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  terminate: () => void
}

function createDefaultWorker(): MinimalSegmentationWorker {
  return new Worker(new URL('../workers/speakerSegmentation.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as MinimalSegmentationWorker
}

export function useSpeakerSegmentation(createWorker: () => MinimalSegmentationWorker = createDefaultWorker) {
  const state = ref<SpeakerSegmentationState>('idle')
  const segments = shallowRef<LocalSpeakerSegment[]>([])
  const errorMessage = ref<string | null>(null)
  const device = ref<'webgpu' | 'wasm' | null>(null)
  const downloadProgress = ref<number | null>(null)
  let worker: MinimalSegmentationWorker | null = null

  function ensureWorker(): MinimalSegmentationWorker {
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
        segments.value = message.segments
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

  function segment(audio: Float32Array) {
    errorMessage.value = null
    state.value = 'loading-model'
    const transferable = audio.slice()
    ensureWorker().postMessage({ type: 'segment', audio: transferable }, [transferable.buffer])
  }

  function retry(audio: Float32Array) {
    worker?.terminate()
    worker = null
    segment(audio)
  }

  return { state, segments, errorMessage, device, downloadProgress, segment, retry }
}
```

- [ ] **Step 4: Ejecutar los tests para confirmar que pasan**

Run: `pnpm test -- useSpeakerSegmentation`
Expected: PASS (11 tests passed)

- [ ] **Step 5: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan, sin regresiones)

- [ ] **Step 6: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 7: Commit**

```bash
git add app/composables/useSpeakerSegmentation.ts tests/unit/composables/useSpeakerSegmentation.test.ts
git commit -m "Añade composable useSpeakerSegmentation"
```

---
