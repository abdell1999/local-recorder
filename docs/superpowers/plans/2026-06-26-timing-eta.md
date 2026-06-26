# Timing y ETA de Transcripción — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar tiempo transcurrido durante la transcripción, ETA basado en segmentos reales de Whisper, y duración total al finalizar.

**Architecture:** El worker usa `WhisperTextStreamer.on_chunk_end` para contar segmentos transcritos y postea mensajes `chunk-progress`. `useTranscription` arranca un timer al recibir `transcription-start`, calcula ETA a partir del ratio elapsed/segmentos, y expone `elapsedSeconds`, `eta`, `transcriptionDuration`, `chunkProgress`. `index.vue` muestra estos valores en la UI con `formatElapsed`.

**Tech Stack:** Vue 3 + TypeScript, Vitest, `@huggingface/transformers` v3.8.1 (`WhisperTextStreamer`), `vi.useFakeTimers()`

## Global Constraints

- Sin dependencias npm nuevas
- `WhisperTextStreamer` es API pública de `@huggingface/transformers` — no es un hack
- `formatElapsed` ya existe en `app/utils/formatElapsed.ts` — reutilizar sin modificar
- Commits en español, sin `Co-Authored-By`
- Rama `main`, nunca crear branches salvo petición explícita

---

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `app/workers/whisper.types.ts` | Añadir `TranscriptionStartMessage`, `ChunkProgressMessage` |
| `app/workers/whisper.worker.ts` | Importar `WhisperTextStreamer`, postar nuevos mensajes |
| `app/composables/useTranscription.ts` | Timer + ETA + nuevos refs + manejar nuevos mensajes |
| `tests/unit/composables/useTranscription.test.ts` | Tests para timing |
| `app/pages/index.vue` | UI: elapsed, ETA, chunk progress bar, duration badge |
| `tests/unit/pages/index.test.ts` | Tests para nuevos elementos UI |

---

## Task 1: Tipos y Worker

**Files:**
- Modify: `app/workers/whisper.types.ts`
- Modify: `app/workers/whisper.worker.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `TranscriptionStartMessage { type: 'transcription-start'; audioDuration: number; totalChunks: number }`
  - `ChunkProgressMessage { type: 'chunk-progress'; done: number; total: number }`
  - Ambas añadidas a `WhisperWorkerResponse`

- [ ] **Step 1: Añadir tipos a `whisper.types.ts`**

Reemplazar el bloque `WhisperWorkerResponse` con:

```ts
import type { WhisperModelSize } from '../utils/whisperModels'

export interface WhisperChunk {
  text: string
  timestamp: [number, number | null]
}

export interface WhisperTranscribeRequest {
  type: 'transcribe'
  audio: Float32Array
  modelSize: WhisperModelSize
  language: string
}

export interface WhisperProgressMessage {
  type: 'progress'
  status: 'loading-model' | 'transcribing'
}

export interface WhisperDeviceMessage {
  type: 'device'
  device: 'webgpu' | 'wasm'
}

export interface WhisperResultMessage {
  type: 'result'
  text: string
  chunks: WhisperChunk[]
}

export interface WhisperErrorMessage {
  type: 'error'
  message: string
}

export interface WhisperModelProgressMessage {
  type: 'model-download-progress'
  percent: number
}

export interface TranscriptionStartMessage {
  type: 'transcription-start'
  audioDuration: number
  totalChunks: number
}

export interface ChunkProgressMessage {
  type: 'chunk-progress'
  done: number
  total: number
}

export type WhisperWorkerRequest = WhisperTranscribeRequest
export type WhisperWorkerResponse =
  | WhisperProgressMessage
  | WhisperDeviceMessage
  | WhisperModelProgressMessage
  | WhisperResultMessage
  | WhisperErrorMessage
  | TranscriptionStartMessage
  | ChunkProgressMessage
```

- [ ] **Step 2: Modificar `whisper.worker.ts`**

Reemplazar el archivo completo con:

```ts
import { pipeline, WhisperTextStreamer, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
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

// Estimación de segmentos Whisper por chunk de audio (30s). Cada chunk genera
// entre 5 y 12 segmentos dependiendo de la densidad del habla.
const SEGMENTS_PER_AUDIO_CHUNK = 8

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
    const totalSegments = totalChunks * SEGMENTS_PER_AUDIO_CHUNK
    post({ type: 'transcription-start', audioDuration: audioDurationSeconds, totalChunks })

    let segmentsDone = 0
    const streamer = new WhisperTextStreamer((asr as any).tokenizer, {
      skip_prompt: true,
      callback_function: () => {},
      on_chunk_end: () => {
        segmentsDone = Math.min(segmentsDone + 1, totalSegments - 1)
        post({ type: 'chunk-progress', done: segmentsDone, total: totalSegments })
      },
    })

    const output = await asr(audio, {
      return_timestamps: true,
      chunk_length_s: CHUNK_LENGTH_S,
      stride_length_s: STRIDE_LENGTH_S,
      ...(language !== 'auto' ? { language } : {}),
      streamer,
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
```

- [ ] **Step 3: Verificar tipos con typecheck y pasar suite completa**

```bash
npm test
```

Expected: ≥174 tests PASS, 0 failures. (El worker no tiene tests unitarios directos — se verifica via composable en Task 2.)

- [ ] **Step 4: Commit**

```bash
git add app/workers/whisper.types.ts app/workers/whisper.worker.ts
git commit -m "Añade mensajes transcription-start y chunk-progress al worker de Whisper"
```

---

## Task 2: Composable `useTranscription` — Timer, ETA y duración

**Files:**
- Modify: `app/composables/useTranscription.ts`
- Modify: `tests/unit/composables/useTranscription.test.ts`

**Interfaces:**
- Consumes: `TranscriptionStartMessage`, `ChunkProgressMessage` (de Task 1)
- Produces (nuevos en el return del composable):
  - `elapsedSeconds: Ref<number>` — segundos transcurridos desde que empezó la transcripción
  - `eta: Ref<number | null>` — segundos estimados restantes (null hasta tener datos)
  - `transcriptionDuration: Ref<number | null>` — segundos totales al terminar
  - `chunkProgress: Ref<{ done: number; total: number } | null>` — progreso de segmentos

- [ ] **Step 1: Escribir tests que fallan**

Añadir al final de `tests/unit/composables/useTranscription.test.ts`, después del último `it(...)` y antes del cierre `})`:

```ts
  describe('timing', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('starts elapsed timer when transcription-start message arrives', () => {
      const worker = createFakeWorker()
      const { elapsedSeconds, transcribe } = useTranscription(() => worker)
      transcribe(new Float32Array([0.1]), 'small')

      worker.onmessage?.({ data: { type: 'transcription-start', audioDuration: 60, totalChunks: 3 } } as MessageEvent)
      vi.advanceTimersByTime(5000)

      expect(elapsedSeconds.value).toBe(5)
    })

    it('computes ETA from chunk-progress when elapsed > 0', () => {
      const worker = createFakeWorker()
      const { eta, transcribe } = useTranscription(() => worker)
      transcribe(new Float32Array([0.1]), 'small')

      worker.onmessage?.({ data: { type: 'transcription-start', audioDuration: 60, totalChunks: 3 } } as MessageEvent)
      vi.advanceTimersByTime(10000)

      worker.onmessage?.({ data: { type: 'chunk-progress', done: 2, total: 8 } } as MessageEvent)
      // 10s elapsed, 2/8 done → 5s per segment, 6 remaining → ETA = 30s
      expect(eta.value).toBe(30)
    })

    it('stores chunkProgress when chunk-progress message arrives', () => {
      const worker = createFakeWorker()
      const { chunkProgress, transcribe } = useTranscription(() => worker)
      transcribe(new Float32Array([0.1]), 'small')

      worker.onmessage?.({ data: { type: 'transcription-start', audioDuration: 10, totalChunks: 1 } } as MessageEvent)
      worker.onmessage?.({ data: { type: 'chunk-progress', done: 3, total: 8 } } as MessageEvent)

      expect(chunkProgress.value).toEqual({ done: 3, total: 8 })
    })

    it('saves transcriptionDuration and stops timer when result arrives', () => {
      const worker = createFakeWorker()
      const { transcriptionDuration, elapsedSeconds, transcribe } = useTranscription(() => worker)
      transcribe(new Float32Array([0.1]), 'small')

      worker.onmessage?.({ data: { type: 'transcription-start', audioDuration: 60, totalChunks: 3 } } as MessageEvent)
      vi.advanceTimersByTime(45000)

      worker.onmessage?.({ data: { type: 'result', text: 'hola', chunks: [] } } as MessageEvent)
      expect(transcriptionDuration.value).toBe(45)

      // Timer should be stopped — advancing time no longer increments elapsed
      vi.advanceTimersByTime(5000)
      expect(elapsedSeconds.value).toBe(45)
    })

    it('stops timer and clears eta/chunkProgress on result', () => {
      const worker = createFakeWorker()
      const { eta, chunkProgress, transcribe } = useTranscription(() => worker)
      transcribe(new Float32Array([0.1]), 'small')

      worker.onmessage?.({ data: { type: 'transcription-start', audioDuration: 30, totalChunks: 2 } } as MessageEvent)
      vi.advanceTimersByTime(5000)
      worker.onmessage?.({ data: { type: 'chunk-progress', done: 2, total: 8 } } as MessageEvent)
      expect(eta.value).not.toBeNull()
      expect(chunkProgress.value).not.toBeNull()

      worker.onmessage?.({ data: { type: 'result', text: 'ok', chunks: [] } } as MessageEvent)
      expect(eta.value).toBeNull()
      expect(chunkProgress.value).toBeNull()
    })

    it('stops timer on worker error', () => {
      const worker = createFakeWorker()
      const { elapsedSeconds, transcribe } = useTranscription(() => worker)
      transcribe(new Float32Array([0.1]), 'small')

      worker.onmessage?.({ data: { type: 'transcription-start', audioDuration: 60, totalChunks: 3 } } as MessageEvent)
      vi.advanceTimersByTime(10000)

      worker.onmessage?.({ data: { type: 'error', message: 'boom' } } as MessageEvent)
      vi.advanceTimersByTime(5000)
      expect(elapsedSeconds.value).toBe(10)
    })

    it('stops timer on worker crash', () => {
      const worker = createFakeWorker()
      const { elapsedSeconds, transcribe } = useTranscription(() => worker)
      transcribe(new Float32Array([0.1]), 'small')

      worker.onmessage?.({ data: { type: 'transcription-start', audioDuration: 60, totalChunks: 3 } } as MessageEvent)
      vi.advanceTimersByTime(8000)

      worker.onerror?.(new Event('error') as ErrorEvent)
      vi.advanceTimersByTime(5000)
      expect(elapsedSeconds.value).toBe(8)
    })

    it('resets timing state when a new transcription starts', () => {
      const worker = createFakeWorker()
      const { elapsedSeconds, eta, transcriptionDuration, chunkProgress, transcribe } = useTranscription(() => worker)
      transcribe(new Float32Array([0.1]), 'small')

      worker.onmessage?.({ data: { type: 'transcription-start', audioDuration: 10, totalChunks: 1 } } as MessageEvent)
      vi.advanceTimersByTime(5000)
      worker.onmessage?.({ data: { type: 'chunk-progress', done: 2, total: 8 } } as MessageEvent)
      worker.onmessage?.({ data: { type: 'result', text: 'hi', chunks: [] } } as MessageEvent)
      expect(transcriptionDuration.value).toBe(5)

      transcribe(new Float32Array([0.1]), 'small')
      expect(elapsedSeconds.value).toBe(0)
      expect(eta.value).toBeNull()
      expect(transcriptionDuration.value).toBeNull()
      expect(chunkProgress.value).toBeNull()
    })
  })
```

También añadir `beforeEach` al inicio del describe de `timing`:
(ya está incluido arriba)

- [ ] **Step 2: Verificar que los tests fallan**

```bash
npm test -- tests/unit/composables/useTranscription.test.ts
```

Expected: 8 nuevos tests FAIL con errores como `TypeError: Cannot read properties of undefined (reading 'value')` o similar (elapsedSeconds, eta, etc. no existen aún).

- [ ] **Step 3: Implementar el composable**

Reemplazar `app/composables/useTranscription.ts` con:

```ts
import { ref, shallowRef } from 'vue'
import type { WhisperModelSize } from '../utils/whisperModels'
import type { WhisperWorkerResponse, WhisperChunk } from '../workers/whisper.types'

export type TranscriptionState = 'idle' | 'loading-model' | 'transcribing' | 'done' | 'error'

export interface MinimalWorker {
  postMessage: (message: unknown, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent<WhisperWorkerResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  terminate: () => void
}

function createDefaultWorker(): MinimalWorker {
  return new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as MinimalWorker
}

export function useTranscription(createWorker: () => MinimalWorker = createDefaultWorker) {
  const state = ref<TranscriptionState>('idle')
  const text = ref('')
  const chunks = shallowRef<WhisperChunk[]>([])
  const errorMessage = ref<string | null>(null)
  const device = ref<'webgpu' | 'wasm' | null>(null)
  const downloadProgress = ref<number | null>(null)
  const elapsedSeconds = ref<number>(0)
  const eta = ref<number | null>(null)
  const transcriptionDuration = ref<number | null>(null)
  const chunkProgress = ref<{ done: number; total: number } | null>(null)
  let worker: MinimalWorker | null = null
  let timerHandle: ReturnType<typeof setInterval> | null = null

  function stopTimer() {
    if (timerHandle !== null) {
      clearInterval(timerHandle)
      timerHandle = null
    }
  }

  function ensureWorker(): MinimalWorker {
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
      } else if (message.type === 'transcription-start') {
        timerHandle = setInterval(() => { elapsedSeconds.value++ }, 1000)
      } else if (message.type === 'chunk-progress') {
        chunkProgress.value = { done: message.done, total: message.total }
        if (message.done > 0 && elapsedSeconds.value > 0) {
          const secondsPerSegment = elapsedSeconds.value / message.done
          eta.value = Math.round(secondsPerSegment * (message.total - message.done))
        }
      } else if (message.type === 'result') {
        stopTimer()
        transcriptionDuration.value = elapsedSeconds.value
        text.value = message.text
        chunks.value = message.chunks
        state.value = 'done'
        downloadProgress.value = null
        eta.value = null
        chunkProgress.value = null
      } else if (message.type === 'error') {
        stopTimer()
        state.value = 'error'
        errorMessage.value = message.message
        downloadProgress.value = null
      }
    }
    worker.onerror = () => {
      stopTimer()
      state.value = 'error'
      errorMessage.value = 'worker-crashed'
      downloadProgress.value = null
    }
    return worker
  }

  function transcribe(audio: Float32Array, modelSize: WhisperModelSize, language = 'auto') {
    stopTimer()
    elapsedSeconds.value = 0
    eta.value = null
    transcriptionDuration.value = null
    chunkProgress.value = null
    errorMessage.value = null
    state.value = 'loading-model'
    const transferable = audio.slice()
    ensureWorker().postMessage(
      { type: 'transcribe', audio: transferable, modelSize, language },
      [transferable.buffer],
    )
  }

  function retry(audio: Float32Array, modelSize: WhisperModelSize, language = 'auto') {
    worker?.terminate()
    worker = null
    transcribe(audio, modelSize, language)
  }

  return {
    state,
    text,
    chunks,
    errorMessage,
    device,
    downloadProgress,
    elapsedSeconds,
    eta,
    transcriptionDuration,
    chunkProgress,
    transcribe,
    retry,
  }
}
```

- [ ] **Step 4: Verificar que todos los tests pasan**

```bash
npm test -- tests/unit/composables/useTranscription.test.ts
```

Expected: todos los tests PASS (12 existentes + 8 nuevos = 20 tests).

- [ ] **Step 5: Pasar suite completa**

```bash
npm test
```

Expected: ≥182 tests PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add app/composables/useTranscription.ts tests/unit/composables/useTranscription.test.ts
git commit -m "Añade timer de transcripción, ETA y duración a useTranscription"
```

---

## Task 3: UI — Elapsed, ETA, chunk progress bar y duration badge

**Files:**
- Modify: `app/pages/index.vue`
- Modify: `tests/unit/pages/index.test.ts`

**Interfaces:**
- Consumes: `elapsedSeconds`, `eta`, `transcriptionDuration`, `chunkProgress` del composable (Task 2)
- Consumes: `formatElapsed` de `app/utils/formatElapsed.ts` (ya existe, no tocar)

- [ ] **Step 1: Actualizar el mock de useTranscription en index.test.ts**

En `tests/unit/pages/index.test.ts`, añadir cuatro `ref` nuevos junto a los existentes (después de `const downloadProgress = ref...`):

```ts
const transcriptionElapsed = ref(0)
const transcriptionEta = ref<number | null>(null)
const transcriptionDurationRef = ref<number | null>(null)
const chunkProgressRef = ref<{ done: number; total: number } | null>(null)
```

Actualizar el mock de `useTranscription` para incluirlos:

```ts
vi.mock('../../../app/composables/useTranscription', () => ({
  useTranscription: () => ({
    state: transcriptionState,
    text: transcriptionText,
    chunks: transcriptionChunks,
    errorMessage: transcriptionError,
    device: transcriptionDevice,
    downloadProgress,
    elapsedSeconds: transcriptionElapsed,
    eta: transcriptionEta,
    transcriptionDuration: transcriptionDurationRef,
    chunkProgress: chunkProgressRef,
    transcribe,
    retry,
  }),
}))
```

En el `beforeEach`, añadir los resets:

```ts
transcriptionElapsed.value = 0
transcriptionEta.value = null
transcriptionDurationRef.value = null
chunkProgressRef.value = null
```

- [ ] **Step 2: Escribir tests que fallan**

Añadir al `describe('index page', ...)` en `tests/unit/pages/index.test.ts`:

```ts
  it('shows elapsed time in transcribing status', async () => {
    const wrapper = mountPage()
    transcriptionElapsed.value = 42
    transcriptionState.value = 'transcribing'
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-testid="status-transcribing"]').text()).toContain('00:42')
  })

  it('shows ETA when available during transcription', async () => {
    const wrapper = mountPage()
    transcriptionState.value = 'transcribing'
    transcriptionElapsed.value = 10
    transcriptionEta.value = 30
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-testid="status-transcribing"]').text()).toContain('00:30')
  })

  it('shows chunk progress bar when chunkProgress is set', async () => {
    const wrapper = mountPage()
    transcriptionState.value = 'transcribing'
    chunkProgressRef.value = { done: 3, total: 8 }
    await wrapper.vm.$nextTick()

    const bar = wrapper.get('[data-testid="chunk-progress"]')
    expect(bar.element.getAttribute('style')).toContain('37.5%')
  })

  it('hides chunk progress bar when chunkProgress is null', async () => {
    const wrapper = mountPage()
    transcriptionState.value = 'transcribing'
    chunkProgressRef.value = null
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="chunk-progress"]').exists()).toBe(false)
  })

  it('shows duration badge after transcription completes', async () => {
    transcriptionText.value = 'texto reconocido'
    const wrapper = mountPage()
    transcriptionState.value = 'done'
    transcriptionDurationRef.value = 83
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-testid="transcription-duration"]').text()).toContain('01:23')
  })

  it('hides duration badge when transcriptionDuration is null', async () => {
    transcriptionText.value = 'texto reconocido'
    const wrapper = mountPage()
    transcriptionState.value = 'done'
    transcriptionDurationRef.value = null
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="transcription-duration"]').exists()).toBe(false)
  })
```

- [ ] **Step 3: Verificar que los nuevos tests fallan**

```bash
npm test -- tests/unit/pages/index.test.ts
```

Expected: 6 nuevos tests FAIL (los elementos no existen aún en la UI).

- [ ] **Step 4: Actualizar `index.vue` — script setup**

En el `<script setup lang="ts">` de `app/pages/index.vue`:

**Añadir import de `formatElapsed`** (después de `import { decodeAudioFile ... }`):

```ts
import { formatElapsed } from '../utils/formatElapsed'
```

**Actualizar la destructuring de `useTranscription()`** para añadir los cuatro nuevos valores (con alias `transcriptionElapsed` para evitar conflicto con `elapsedSeconds` del recording timer):

```ts
const {
  state: transcriptionState,
  text: transcriptionText,
  chunks: transcriptionChunks,
  errorMessage: transcriptionError,
  device: transcriptionDevice,
  downloadProgress,
  elapsedSeconds: transcriptionElapsed,
  eta: transcriptionEta,
  transcriptionDuration,
  chunkProgress,
  transcribe,
  retry,
} = useTranscription()
```

- [ ] **Step 5: Actualizar `index.vue` — template (estado transcribiendo)**

Localizar en el template:

```html
        <p v-if="transcriptionState === 'transcribing'" data-testid="status-transcribing" class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <svg class="animate-spin h-4 w-4 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Transcribiendo…
        </p>
```

Reemplazar con:

```html
        <p v-if="transcriptionState === 'transcribing'" data-testid="status-transcribing" class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <svg class="animate-spin h-4 w-4 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Transcribiendo… {{ formatElapsed(transcriptionElapsed) }}<span v-if="transcriptionEta !== null"> · ETA ~{{ formatElapsed(transcriptionEta) }}</span>
        </p>
        <div v-if="chunkProgress !== null" class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
          <div
            data-testid="chunk-progress"
            class="bg-indigo-500 h-1.5 rounded-full transition-all"
            :style="{ width: `${(chunkProgress.done / chunkProgress.total) * 100}%` }"
          />
        </div>
```

- [ ] **Step 6: Actualizar `index.vue` — template (header de la card Transcripción)**

Localizar en el template:

```html
            <div class="flex items-center justify-between">
              <h2 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Transcripción
              </h2>
              <ExportMenu
```

Reemplazar con:

```html
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <h2 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Transcripción
                </h2>
                <span
                  v-if="transcriptionDuration !== null"
                  data-testid="transcription-duration"
                  class="text-xs text-gray-400 dark:text-gray-500"
                >
                  Completado en {{ formatElapsed(transcriptionDuration) }}
                </span>
              </div>
              <ExportMenu
```

- [ ] **Step 7: Verificar que todos los tests pasan**

```bash
npm test -- tests/unit/pages/index.test.ts
```

Expected: todos los tests PASS (21 existentes + 6 nuevos = 27 tests).

- [ ] **Step 8: Pasar suite completa**

```bash
npm test
```

Expected: ≥188 tests PASS, 0 failures.

- [ ] **Step 9: Commit**

```bash
git add app/pages/index.vue tests/unit/pages/index.test.ts
git commit -m "Añade UI de elapsed, ETA, chunk progress y duración de transcripción"
```
