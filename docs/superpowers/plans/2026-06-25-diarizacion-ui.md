# Diarización — fase 4: integración en la UI — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar el backend de diarización (ya implementado) con la UI: botón "Identificar hablantes" y sección de solo lectura que agrupa el texto de Whisper por hablante debajo de la transcripción.

**Architecture:** Nueva función pura `alignChunksWithSpeakers` en `app/utils/speakerTranscriptAlignment.ts` alinea los chunks de Whisper con los segmentos de diarización por solapamiento temporal y agrupa los consecutivos del mismo hablante. Nuevo componente tonto `SpeakerTranscriptView.vue` renderiza los bloques resultantes. `index.vue` conecta `useSpeakerSegmentation` (ya existente), la función de alineación y el componente con un botón manual al estilo "Resumir".

**Tech Stack:** Nuxt 4, Vue 3, TypeScript, Vitest, pnpm, Tailwind CSS.

## Global Constraints

- Package manager: pnpm only.
- Commits sin co-author, mensajes en español, siempre en `main` (`CLAUDE.md`).
- `pnpm dlx nuxi typecheck` debe pasar limpio tras cada tarea. El proyecto usa `noUncheckedIndexedAccess: true` — accesos por índice a arrays tipan como `T | undefined`; los elementos de tupla son la excepción (sus tipos son exactos). Usar `?? valor` o guards donde haga falta, nunca casts para silenciar.
- `pnpm test` completo debe pasar tras cada tarea sin regresiones.
- `lastAudio.value!` es seguro en los handlers de diarización: el botón solo es visible cuando `transcriptionState === 'done'` y el texto no está vacío, condición que implica que el audio fue procesado y `lastAudio` no es null.

---

### Task 1: `speakerTranscriptAlignment.ts` — alineación pura por solapamiento temporal

**Files:**
- Create: `app/utils/speakerTranscriptAlignment.ts`
- Test: `tests/unit/utils/speakerTranscriptAlignment.test.ts`

**Interfaces:**
- Consumes: `WhisperChunk` de `../workers/whisper.types`, `SpeakerSegment` de `../workers/speakerSegmentation.types` (ya existentes).
- Produces:
  ```ts
  export interface AlignedSpeakerBlock {
    globalSpeakerId: number | null
    text: string
  }
  export function alignChunksWithSpeakers(
    chunks: WhisperChunk[],
    segments: SpeakerSegment[],
  ): AlignedSpeakerBlock[]
  ```
  Usadas por la Tarea 2 (`SpeakerTranscriptView.vue`) y la Tarea 3 (`index.vue`).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/unit/utils/speakerTranscriptAlignment.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { alignChunksWithSpeakers } from '../../../app/utils/speakerTranscriptAlignment'
import type { WhisperChunk } from '../../../app/workers/whisper.types'
import type { SpeakerSegment } from '../../../app/workers/speakerSegmentation.types'

const seg = (start: number, end: number, globalSpeakerId: number | null): SpeakerSegment => ({
  windowIndex: 0,
  localSpeakerId: 1,
  start,
  end,
  confidence: 1,
  globalSpeakerId,
})

const chunk = (start: number, end: number | null, text: string): WhisperChunk => ({
  text,
  timestamp: [start, end],
})

describe('alignChunksWithSpeakers', () => {
  it('returns an empty array for empty chunks', () => {
    expect(alignChunksWithSpeakers([], [])).toEqual([])
  })

  it('assigns null when there are no segments', () => {
    expect(alignChunksWithSpeakers([chunk(0, 2, ' hello')], [])).toEqual([
      { globalSpeakerId: null, text: ' hello' },
    ])
  })

  it('ignores segments with null globalSpeakerId', () => {
    expect(alignChunksWithSpeakers([chunk(0, 2, ' hello')], [seg(0, 2, null)])).toEqual([
      { globalSpeakerId: null, text: ' hello' },
    ])
  })

  it('groups all chunks of the same speaker into one block', () => {
    const chunks = [chunk(0, 2, ' hello'), chunk(2, 4, ' world')]
    const segments = [seg(0, 4, 0)]
    expect(alignChunksWithSpeakers(chunks, segments)).toEqual([
      { globalSpeakerId: 0, text: ' hello world' },
    ])
  })

  it('creates separate blocks for alternating speakers', () => {
    const chunks = [chunk(0, 2, ' hello'), chunk(2, 4, ' world')]
    const segments = [seg(0, 2, 0), seg(2, 4, 1)]
    expect(alignChunksWithSpeakers(chunks, segments)).toEqual([
      { globalSpeakerId: 0, text: ' hello' },
      { globalSpeakerId: 1, text: ' world' },
    ])
  })

  it('assigns a chunk to the segment with greater overlap', () => {
    // chunk 1–4: overlap with seg0 [0,2] = 1, overlap with seg1 [2,5] = 2 → seg1 wins
    const chunks = [chunk(1, 4, ' hi')]
    const segments = [seg(0, 2, 0), seg(2, 5, 1)]
    expect(alignChunksWithSpeakers(chunks, segments)).toEqual([
      { globalSpeakerId: 1, text: ' hi' },
    ])
  })

  it('assigns null to a chunk with no positive overlap with any segment', () => {
    // chunk 5–6 does not overlap with seg 0–4
    const chunks = [chunk(5, 6, ' hi')]
    const segments = [seg(0, 4, 0)]
    expect(alignChunksWithSpeakers(chunks, segments)).toEqual([
      { globalSpeakerId: null, text: ' hi' },
    ])
  })

  it('handles a chunk with null timestamp end without crashing', () => {
    // chunkEnd = chunkStart = 1; overlap with seg [0,2] = min(1,2) - max(1,0) = 0, not positive → null
    const chunks = [chunk(1, null, ' hi')]
    const segments = [seg(0, 2, 0)]
    expect(alignChunksWithSpeakers(chunks, segments)).toEqual([
      { globalSpeakerId: null, text: ' hi' },
    ])
  })

  it('merges non-consecutive same-speaker blocks separated by a null block', () => {
    // Two speaker-0 chunks separated by a chunk with no segment → three blocks, not two
    const chunks = [chunk(0, 2, ' A'), chunk(4, 6, ' B'), chunk(8, 10, ' C')]
    const segments = [seg(0, 2, 0), seg(8, 10, 0)]
    expect(alignChunksWithSpeakers(chunks, segments)).toEqual([
      { globalSpeakerId: 0, text: ' A' },
      { globalSpeakerId: null, text: ' B' },
      { globalSpeakerId: 0, text: ' C' },
    ])
  })
})
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `pnpm vitest run tests/unit/utils/speakerTranscriptAlignment.test.ts`
Expected: FAIL — `Cannot find module '../../../app/utils/speakerTranscriptAlignment'`

- [ ] **Step 3: Implementar `speakerTranscriptAlignment.ts`**

Crear `app/utils/speakerTranscriptAlignment.ts`:

```ts
import type { WhisperChunk } from '../workers/whisper.types'
import type { SpeakerSegment } from '../workers/speakerSegmentation.types'

export interface AlignedSpeakerBlock {
  globalSpeakerId: number | null
  text: string
}

export function alignChunksWithSpeakers(
  chunks: WhisperChunk[],
  segments: SpeakerSegment[],
): AlignedSpeakerBlock[] {
  const blocks: AlignedSpeakerBlock[] = []

  for (const chunk of chunks) {
    const [chunkStart, chunkEndOrNull] = chunk.timestamp
    const chunkEnd = chunkEndOrNull ?? chunkStart

    let bestSpeakerId: number | null = null
    let bestOverlap = 0

    for (const segment of segments) {
      if (segment.globalSpeakerId === null) continue
      const overlap = Math.min(chunkEnd, segment.end) - Math.max(chunkStart, segment.start)
      if (overlap > bestOverlap) {
        bestOverlap = overlap
        bestSpeakerId = segment.globalSpeakerId
      }
    }

    const last = blocks[blocks.length - 1]
    if (last !== undefined && last.globalSpeakerId === bestSpeakerId) {
      last.text += chunk.text
    } else {
      blocks.push({ globalSpeakerId: bestSpeakerId, text: chunk.text })
    }
  }

  return blocks
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `pnpm vitest run tests/unit/utils/speakerTranscriptAlignment.test.ts`
Expected: PASS (8/8)

- [ ] **Step 5: Ejecutar la suite completa y tipar**

Run: `pnpm test && pnpm dlx nuxi typecheck`
Expected: PASS, sin errores de tipo

- [ ] **Step 6: Commit**

```bash
git add app/utils/speakerTranscriptAlignment.ts tests/unit/utils/speakerTranscriptAlignment.test.ts
git commit -m "Añade alineación de chunks de transcripción con segmentos de hablante"
```

---

### Task 2: `SpeakerTranscriptView.vue` — componente de solo lectura por hablante

**Files:**
- Create: `app/components/diarization/SpeakerTranscriptView.vue`

**Interfaces:**
- Consumes: `AlignedSpeakerBlock` de `../../utils/speakerTranscriptAlignment` (Task 1).
- Produces: componente Vue `SpeakerTranscriptView` con prop `blocks: AlignedSpeakerBlock[]`, sin eventos emitidos. Usado por la Tarea 3 (`index.vue`).

Sin test unitario — componente visual sin lógica propia.

- [ ] **Step 1: Crear el componente**

Crear `app/components/diarization/SpeakerTranscriptView.vue`:

```vue
<script setup lang="ts">
import type { AlignedSpeakerBlock } from '../../utils/speakerTranscriptAlignment'

defineProps<{
  blocks: AlignedSpeakerBlock[]
}>()
</script>

<template>
  <div class="space-y-4">
    <div v-for="(block, index) in blocks" :key="index" class="space-y-1">
      <p
        v-if="block.globalSpeakerId !== null"
        class="text-sm font-semibold text-gray-700"
      >
        Hablante {{ block.globalSpeakerId + 1 }}
      </p>
      <p class="text-gray-900 whitespace-pre-wrap">{{ block.text }}</p>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Ejecutar la suite completa y tipar**

Run: `pnpm test && pnpm dlx nuxi typecheck`
Expected: PASS, sin errores de tipo

- [ ] **Step 3: Commit**

```bash
git add app/components/diarization/SpeakerTranscriptView.vue
git commit -m "Añade SpeakerTranscriptView para mostrar transcripción por hablante"
```

---

### Task 3: Conectar diarización en `index.vue`

**Files:**
- Modify: `app/pages/index.vue`

**Interfaces:**
- Consumes:
  - `useSpeakerSegmentation` de `../composables/useSpeakerSegmentation` — expone `{ state, segments, errorMessage, downloadProgress, segment, retry }` (Task 2 de las fases anteriores, ya existente).
  - `alignChunksWithSpeakers` + `AlignedSpeakerBlock` de `../utils/speakerTranscriptAlignment` (Task 1 de este plan).
  - `SpeakerTranscriptView` de `../components/diarization/SpeakerTranscriptView.vue` (Task 2 de este plan).
- Produce: nada nuevo para otras tareas — esta es la tarea final.

Sin test unitario directo para `index.vue` — se verifica con typecheck y verificación manual.

- [ ] **Step 1: Actualizar los imports del script**

En `app/pages/index.vue`, cambiar:
```ts
import { ref, watch } from 'vue'
import RecordButton from '../components/recorder/RecordButton.vue'
import RecordingTimer from '../components/recorder/RecordingTimer.vue'
import FileDropzone from '../components/importer/FileDropzone.vue'
import TranscriptEditor from '../components/transcript/TranscriptEditor.vue'
import ExportMenu from '../components/export/ExportMenu.vue'
import ModelSizePicker from '../components/settings/ModelSizePicker.vue'
import LlmModelSizePicker from '../components/settings/LlmModelSizePicker.vue'
import SummaryEditor from '../components/summary/SummaryEditor.vue'
import { useRecorder, type RecorderSource } from '../composables/useRecorder'
import { useFileImport } from '../composables/useFileImport'
import { useModelSelector } from '../composables/useModelSelector'
import { useLlmModelSelector } from '../composables/useLlmModelSelector'
import { useTranscription } from '../composables/useTranscription'
import { useSummarizer } from '../composables/useSummarizer'
import { decodeAudioFile } from '../utils/audio/decodeAudioFile'
```
por:
```ts
import { ref, watch, computed } from 'vue'
import RecordButton from '../components/recorder/RecordButton.vue'
import RecordingTimer from '../components/recorder/RecordingTimer.vue'
import FileDropzone from '../components/importer/FileDropzone.vue'
import TranscriptEditor from '../components/transcript/TranscriptEditor.vue'
import ExportMenu from '../components/export/ExportMenu.vue'
import ModelSizePicker from '../components/settings/ModelSizePicker.vue'
import LlmModelSizePicker from '../components/settings/LlmModelSizePicker.vue'
import SummaryEditor from '../components/summary/SummaryEditor.vue'
import SpeakerTranscriptView from '../components/diarization/SpeakerTranscriptView.vue'
import { useRecorder, type RecorderSource } from '../composables/useRecorder'
import { useFileImport } from '../composables/useFileImport'
import { useModelSelector } from '../composables/useModelSelector'
import { useLlmModelSelector } from '../composables/useLlmModelSelector'
import { useTranscription } from '../composables/useTranscription'
import { useSummarizer } from '../composables/useSummarizer'
import { useSpeakerSegmentation } from '../composables/useSpeakerSegmentation'
import { decodeAudioFile } from '../utils/audio/decodeAudioFile'
import { alignChunksWithSpeakers } from '../utils/speakerTranscriptAlignment'
```

- [ ] **Step 2: Añadir el composable de diarización y el computed**

Tras el bloque `const { modelSize: llmModelSize, setModelSize: setLlmModelSize } = useLlmModelSelector()` añadir (conservando todo lo demás intacto):

```ts
const {
  state: diarizationState,
  segments: diarizationSegments,
  errorMessage: diarizationError,
  downloadProgress: diarizationDownloadProgress,
  segment: segmentAudio,
  retry: retryDiarization,
} = useSpeakerSegmentation()

const speakerBlocks = computed(() =>
  alignChunksWithSpeakers(transcriptionChunks.value, diarizationSegments.value),
)

function handleDiarize() {
  segmentAudio(lastAudio.value!)
}

function handleDiarizeRetry() {
  retryDiarization(lastAudio.value!)
}
```

- [ ] **Step 3: Añadir la sección de diarización en el template**

En el template, tras `<SummaryEditor v-if="summarizerState === 'done'" v-model="editedSummary" />` (y dentro del `<template v-else>`), añadir:

```html
        <div class="flex items-center gap-2">
          <button
            data-testid="diarize-button"
            class="px-4 py-2 rounded font-semibold bg-purple-600 text-white"
            :disabled="diarizationState === 'loading-model' || diarizationState === 'segmenting' || diarizationState === 'identifying-speakers'"
            @click="handleDiarize"
          >
            Identificar hablantes
          </button>
        </div>
        <p v-if="diarizationState === 'loading-model'" data-testid="status-loading-model-diarization">
          Descargando modelo de diarización…
        </p>
        <progress
          v-if="diarizationDownloadProgress !== null"
          data-testid="diarization-download-progress"
          :value="diarizationDownloadProgress"
          max="100"
        />
        <p v-if="diarizationState === 'segmenting'" data-testid="status-segmenting">
          Segmentando audio…
        </p>
        <p v-if="diarizationState === 'identifying-speakers'" data-testid="status-identifying-speakers">
          Identificando hablantes…
        </p>
        <div v-if="diarizationState === 'error'" data-testid="diarization-error">
          <p class="text-red-600">{{ diarizationError ?? 'Ocurrió un error al identificar hablantes.' }}</p>
          <button data-testid="diarize-retry-button" class="underline" @click="handleDiarizeRetry">Reintentar</button>
        </div>
        <SpeakerTranscriptView
          v-if="diarizationState === 'done'"
          data-testid="speaker-transcript-view"
          :blocks="speakerBlocks"
        />
```

El bloque completo del `<template v-else>` resultante (para contexto):

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

        <div class="flex items-center gap-2">
          <button
            data-testid="diarize-button"
            class="px-4 py-2 rounded font-semibold bg-purple-600 text-white"
            :disabled="diarizationState === 'loading-model' || diarizationState === 'segmenting' || diarizationState === 'identifying-speakers'"
            @click="handleDiarize"
          >
            Identificar hablantes
          </button>
        </div>
        <p v-if="diarizationState === 'loading-model'" data-testid="status-loading-model-diarization">
          Descargando modelo de diarización…
        </p>
        <progress
          v-if="diarizationDownloadProgress !== null"
          data-testid="diarization-download-progress"
          :value="diarizationDownloadProgress"
          max="100"
        />
        <p v-if="diarizationState === 'segmenting'" data-testid="status-segmenting">
          Segmentando audio…
        </p>
        <p v-if="diarizationState === 'identifying-speakers'" data-testid="status-identifying-speakers">
          Identificando hablantes…
        </p>
        <div v-if="diarizationState === 'error'" data-testid="diarization-error">
          <p class="text-red-600">{{ diarizationError ?? 'Ocurrió un error al identificar hablantes.' }}</p>
          <button data-testid="diarize-retry-button" class="underline" @click="handleDiarizeRetry">Reintentar</button>
        </div>
        <SpeakerTranscriptView
          v-if="diarizationState === 'done'"
          data-testid="speaker-transcript-view"
          :blocks="speakerBlocks"
        />
      </template>
```

- [ ] **Step 4: Ejecutar la suite completa y tipar**

Run: `pnpm test && pnpm dlx nuxi typecheck`
Expected: PASS, sin errores de tipo

- [ ] **Step 5: Verificación manual en el navegador**

Run: `pnpm dev`

1. Cargar el archivo `peluqueria.mp3` (en la raíz del repo) arrastrándolo a la dropzone.
2. Esperar a que termine la transcripción.
3. Pulsar "Identificar hablantes".
4. Verificar:
   - Aparecen los mensajes de progreso en orden: "Descargando modelo de diarización…", "Segmentando audio…", "Identificando hablantes…".
   - Al terminar aparece la sección con bloques "Hablante 1:", "Hablante 2:", etc.
   - El textarea de transcripción sigue siendo editable.
   - Si hay un solo hablante en el audio, todos los bloques aparecen juntos o sin etiqueta (según el clustering).

- [ ] **Step 6: Commit**

```bash
git add app/pages/index.vue
git commit -m "Conecta diarización en la UI: botón Identificar hablantes y vista por hablante"
```
