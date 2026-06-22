# Fase 2: cierre de gaps de Fase 1 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los tres hallazgos "Important" dejados pendientes al final de Fase 1: selector de modelo Whisper en la UI, barra de progreso durante la descarga del modelo, y buffer de audio clonado+transferido al worker en vez de structured-clone implícito.

**Architecture:** Extiende el protocolo de mensajes del worker (`WhisperWorkerResponse`) con un nuevo tipo `model-download-progress`; el worker agrega el `progress_callback` de transformers.js (por archivo) en un único porcentaje global y lo postea solo cuando cambia. `useTranscription` expone ese porcentaje como un nuevo ref y cambia cómo posiciona el audio en el worker (clona antes de transferir). `index.vue` añade un `<select>` de modelo y una barra `<progress>`, ambos conectados a estado ya existente o ligeramente extendido.

**Tech Stack:** Igual que Fase 1 — Nuxt 4, TypeScript, Vue `<script setup>`, Tailwind CSS, Vitest + `@vue/test-utils` + happy-dom, pnpm.

## Global Constraints

- Package manager: pnpm only.
- Styling: Tailwind CSS, sin librería de componentes.
- Commits: sin co-author, mensajes en español, siempre en `main` (`CLAUDE.md`).
- Composables/componentes con imports explícitos de `vue`, no auto-imports de Nuxt — para que se puedan testear con Vitest + happy-dom sin el runtime completo de Nuxt.
- `whisper.worker.ts` no tiene test unitario directo (requiere navegador real para `pipeline`), igual que en Fase 1 — su corrección se verifica leyendo el código y, si aplica, manualmente en navegador.
- `pnpm dlx nuxi typecheck` debe seguir pasando limpio tras cada tarea que toque `whisper.worker.ts`, `whisper.types.ts` o `useTranscription.ts`.
- Tras cada tarea, correr `pnpm test` completo para confirmar que no hay regresiones (no solo el archivo de test recién tocado).

---

### Task 1: Componente `ModelSizePicker`

**Files:**
- Create: `app/components/settings/ModelSizePicker.vue`
- Test: `tests/unit/components/ModelSizePicker.test.ts`

**Interfaces:**
- Consumes: `WHISPER_MODELS`, `WhisperModelSize` desde `app/utils/whisperModels.ts` (ya existe, de Fase 1).
- Produces: componente con prop `modelValue: WhisperModelSize`, prop opcional `disabled?: boolean` (por defecto `false`), emite `update:modelValue: [value: WhisperModelSize]`. Compatible con `v-model`. Consumido por la Tarea 2.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/components/ModelSizePicker.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ModelSizePicker from '../../../app/components/settings/ModelSizePicker.vue'

describe('ModelSizePicker', () => {
  it('renders the four supported model sizes as options', () => {
    const wrapper = mount(ModelSizePicker, { props: { modelValue: 'small' } })
    const options = wrapper.findAll('option')
    expect(options.map((o) => o.element.value)).toEqual(['tiny', 'base', 'small', 'medium'])
  })

  it('emits update:modelValue when the selection changes', async () => {
    const wrapper = mount(ModelSizePicker, { props: { modelValue: 'small' } })
    await wrapper.get('[data-testid="model-size-picker"]').setValue('medium')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['medium'])
  })

  it('disables the select when the disabled prop is true', () => {
    const wrapper = mount(ModelSizePicker, { props: { modelValue: 'small', disabled: true } })
    expect(wrapper.get<HTMLSelectElement>('[data-testid="model-size-picker"]').element.disabled).toBe(true)
  })

  it('is enabled by default', () => {
    const wrapper = mount(ModelSizePicker, { props: { modelValue: 'small' } })
    expect(wrapper.get<HTMLSelectElement>('[data-testid="model-size-picker"]').element.disabled).toBe(false)
  })
})
```

- [ ] **Step 2: Ejecutar el test para confirmar que falla**

Run: `pnpm test -- ModelSizePicker`
Expected: FAIL con "Cannot find module '../../../app/components/settings/ModelSizePicker.vue'"

- [ ] **Step 3: Implementar `app/components/settings/ModelSizePicker.vue`**

```vue
<script setup lang="ts">
import { WHISPER_MODELS, type WhisperModelSize } from '../../utils/whisperModels'

withDefaults(defineProps<{ modelValue: WhisperModelSize; disabled?: boolean }>(), { disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: WhisperModelSize] }>()

const sizes = Object.keys(WHISPER_MODELS) as WhisperModelSize[]

function onChange(event: Event) {
  emit('update:modelValue', (event.target as HTMLSelectElement).value as WhisperModelSize)
}
</script>

<template>
  <select
    data-testid="model-size-picker"
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

Run: `pnpm test -- ModelSizePicker`
Expected: PASS (4 tests passed)

- [ ] **Step 5: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 6: Commit**

```bash
git add app/components/settings/ModelSizePicker.vue tests/unit/components/ModelSizePicker.test.ts
git commit -m "Añade componente ModelSizePicker"
```

---

### Task 2: Conectar `ModelSizePicker` en `index.vue`

**Files:**
- Modify: `app/pages/index.vue`
- Modify: `tests/unit/pages/index.test.ts`

**Interfaces:**
- Consumes: `ModelSizePicker` (Tarea 1), `setModelSize` de `useModelSelector` (ya existe desde Fase 1, hoy sin usar).
- No produce nada nuevo para tareas posteriores — esta tarea es solo integración en la página.

- [ ] **Step 1: Escribir el test que falla**

En `tests/unit/pages/index.test.ts`, modificar el mock de `useModelSelector` para usar un spy con nombre en vez de uno inline (necesario para poder verificar las llamadas), añadir el import de `ModelSizePicker`, añadir el stub a `mountPage`, y añadir los dos tests nuevos.

Reemplazar:
```ts
vi.mock('../../../app/composables/useModelSelector', () => ({
  useModelSelector: () => ({ modelSize, setModelSize: vi.fn() }),
}))
```
por:
```ts
const setModelSize = vi.fn()

vi.mock('../../../app/composables/useModelSelector', () => ({
  useModelSelector: () => ({ modelSize, setModelSize }),
}))
```

Reemplazar:
```ts
import IndexPage from '../../../app/pages/index.vue'
import FileDropzone from '../../../app/components/importer/FileDropzone.vue'

function mountPage() {
  return mount(IndexPage, {
    global: {
      stubs: { RecordButton: true, RecordingTimer: true, TranscriptEditor: true, ExportMenu: true },
    },
  })
}
```
por:
```ts
import IndexPage from '../../../app/pages/index.vue'
import FileDropzone from '../../../app/components/importer/FileDropzone.vue'
import ModelSizePicker from '../../../app/components/settings/ModelSizePicker.vue'

function mountPage() {
  return mount(IndexPage, {
    global: {
      stubs: {
        RecordButton: true,
        RecordingTimer: true,
        TranscriptEditor: true,
        ExportMenu: true,
        ModelSizePicker: true,
      },
    },
  })
}
```

Añadir `setModelSize.mockClear()` no es necesario porque `vi.clearAllMocks()` en `beforeEach` ya limpia todos los `vi.fn()` del módulo, `setModelSize` incluido.

Añadir al final del `describe('index page', ...)`, antes del cierre:
```ts

  it('disables the model size picker while a transcription is loading or running', async () => {
    const wrapper = mountPage()
    expect(wrapper.findComponent(ModelSizePicker).props('disabled')).toBe(false)

    transcriptionState.value = 'loading-model'
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(ModelSizePicker).props('disabled')).toBe(true)

    transcriptionState.value = 'transcribing'
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(ModelSizePicker).props('disabled')).toBe(true)

    transcriptionState.value = 'done'
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(ModelSizePicker).props('disabled')).toBe(false)
  })

  it('calls setModelSize when the model size picker emits a new value', async () => {
    const wrapper = mountPage()
    await wrapper.findComponent(ModelSizePicker).vm.$emit('update:modelValue', 'medium')
    expect(setModelSize).toHaveBeenCalledWith('medium')
  })
```

- [ ] **Step 2: Ejecutar los tests para confirmar que fallan**

Run: `pnpm test -- index`
Expected: FAIL — `wrapper.findComponent(ModelSizePicker)` no encuentra el componente porque `index.vue` todavía no lo importa ni renderiza.

- [ ] **Step 3: Modificar `app/pages/index.vue`**

Añadir el import junto a los demás componentes:
```ts
import ModelSizePicker from '../components/settings/ModelSizePicker.vue'
```

Cambiar:
```ts
const { modelSize } = useModelSelector()
```
por:
```ts
const { modelSize, setModelSize } = useModelSelector()
```

Añadir en el template, justo debajo del `<h1>` y antes de la sección de grabación:
```html
<div class="flex items-center gap-2">
  <span class="text-sm text-gray-600">Modelo:</span>
  <ModelSizePicker
    :model-value="modelSize"
    :disabled="transcriptionState === 'loading-model' || transcriptionState === 'transcribing'"
    @update:model-value="setModelSize"
  />
</div>
```

- [ ] **Step 4: Ejecutar los tests para confirmar que pasan**

Run: `pnpm test -- index`
Expected: PASS (7 tests passed)

- [ ] **Step 5: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan, sin regresiones)

- [ ] **Step 6: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 7: Commit**

```bash
git add app/pages/index.vue tests/unit/pages/index.test.ts
git commit -m "Conecta el selector de tamaño de modelo en la página principal"
```

---

### Task 3: Progreso de descarga del modelo — protocolo, worker y `useTranscription`

**Files:**
- Modify: `app/workers/whisper.types.ts`
- Modify: `app/workers/whisper.worker.ts`
- Modify: `app/composables/useTranscription.ts`
- Modify: `tests/unit/composables/useTranscription.test.ts`

**Interfaces:**
- Produces: nuevo miembro de la unión `WhisperWorkerResponse`: `WhisperModelProgressMessage { type: 'model-download-progress', percent: number }`. `useTranscription` expone un nuevo ref `downloadProgress: Ref<number | null>`, consumido por la Tarea 4.
- `whisper.worker.ts` no tiene test unitario directo (ver Global Constraints) — su corrección se revisa leyendo el código.

- [ ] **Step 1: Escribir los tests que fallan para `useTranscription`**

En `tests/unit/composables/useTranscription.test.ts`, añadir al final del `describe('useTranscription', ...)`, antes del cierre:

```ts

  it('reflects model download progress messages from the worker', () => {
    const worker = createFakeWorker()
    const { downloadProgress, transcribe } = useTranscription(() => worker)
    transcribe(new Float32Array([0.1]), 'small')

    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 42 } } as MessageEvent)

    expect(downloadProgress.value).toBe(42)
  })

  it('resets download progress once transcription starts', () => {
    const worker = createFakeWorker()
    const { downloadProgress, state, transcribe } = useTranscription(() => worker)
    transcribe(new Float32Array([0.1]), 'small')
    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 80 } } as MessageEvent)
    expect(downloadProgress.value).toBe(80)

    worker.onmessage?.({ data: { type: 'progress', status: 'transcribing' } } as MessageEvent)

    expect(state.value).toBe('transcribing')
    expect(downloadProgress.value).toBeNull()
  })

  it('resets download progress when the worker reports an error', () => {
    const worker = createFakeWorker()
    const { downloadProgress, transcribe } = useTranscription(() => worker)
    transcribe(new Float32Array([0.1]), 'small')
    worker.onmessage?.({ data: { type: 'model-download-progress', percent: 30 } } as MessageEvent)

    worker.onmessage?.({ data: { type: 'error', message: 'boom' } } as MessageEvent)

    expect(downloadProgress.value).toBeNull()
  })
```

- [ ] **Step 2: Ejecutar los tests para confirmar que fallan**

Run: `pnpm test -- useTranscription`
Expected: FAIL — `downloadProgress` no existe en el valor devuelto por `useTranscription`, y el mensaje `model-download-progress` no es un tipo válido todavía.

- [ ] **Step 3: Extender `app/workers/whisper.types.ts`**

Añadir antes de `export type WhisperWorkerRequest = ...`:
```ts
export interface WhisperModelProgressMessage {
  type: 'model-download-progress'
  percent: number
}
```

Cambiar:
```ts
export type WhisperWorkerResponse =
  | WhisperProgressMessage
  | WhisperDeviceMessage
  | WhisperResultMessage
  | WhisperErrorMessage
```
por:
```ts
export type WhisperWorkerResponse =
  | WhisperProgressMessage
  | WhisperDeviceMessage
  | WhisperModelProgressMessage
  | WhisperResultMessage
  | WhisperErrorMessage
```

- [ ] **Step 4: Extender `app/composables/useTranscription.ts`**

Los imports de `app/composables/useTranscription.ts` no cambian en este paso.
Dentro de `useTranscription`, añadir el nuevo ref junto a los demás:
```ts
  const device = ref<'webgpu' | 'wasm' | null>(null)
  const downloadProgress = ref<number | null>(null)
```

Reemplazar el cuerpo de `worker.onmessage` por:
```ts
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
        text.value = message.text
        chunks.value = message.chunks
        state.value = 'done'
        downloadProgress.value = null
      } else if (message.type === 'error') {
        state.value = 'error'
        errorMessage.value = message.message
        downloadProgress.value = null
      }
    }
```

Cambiar el `return` final:
```ts
  return { state, text, chunks, errorMessage, device, downloadProgress, transcribe, retry }
```

- [ ] **Step 5: Ejecutar los tests para confirmar que pasan**

Run: `pnpm test -- useTranscription`
Expected: PASS (9 tests passed)

- [ ] **Step 6: Implementar la agregación de progreso en `app/workers/whisper.worker.ts`**

Cambiar el import inicial:
```ts
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
```
por:
```ts
import { pipeline, type AutomaticSpeechRecognitionPipeline, type ProgressInfo } from '@huggingface/transformers'
```

Reemplazar `getTranscriber` completo:
```ts
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

- [ ] **Step 7: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan, sin regresiones)

- [ ] **Step 8: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores. Si `ProgressInfo` no se resuelve como tipo importable desde `@huggingface/transformers`, verificar `node_modules/@huggingface/transformers/types/transformers.d.ts` (debe re-exportar `configs.js`, que a su vez re-exporta `ProgressInfo`/`ProgressCallback` desde `utils/core.js`) — no inventar un tipo local sin antes confirmar que el re-export realmente falta.

- [ ] **Step 9: Commit**

```bash
git add app/workers/whisper.types.ts app/workers/whisper.worker.ts app/composables/useTranscription.ts tests/unit/composables/useTranscription.test.ts
git commit -m "Añade progreso de descarga del modelo al protocolo del worker y a useTranscription"
```

---

### Task 4: Barra de progreso de descarga en `index.vue`

**Files:**
- Modify: `app/pages/index.vue`
- Modify: `tests/unit/pages/index.test.ts`

**Interfaces:**
- Consumes: `downloadProgress` de `useTranscription` (Tarea 3).
- No produce nada nuevo para tareas posteriores.

- [ ] **Step 1: Escribir el test que falla**

En `tests/unit/pages/index.test.ts`, añadir el ref junto a los demás del bloque de refs compartidos:
```ts
const transcriptionDevice = ref<'webgpu' | 'wasm' | null>(null)
const downloadProgress = ref<number | null>(null)
```

Añadir `downloadProgress` al objeto devuelto por el mock de `useTranscription`:
```ts
vi.mock('../../../app/composables/useTranscription', () => ({
  useTranscription: () => ({
    state: transcriptionState,
    text: transcriptionText,
    chunks: transcriptionChunks,
    errorMessage: transcriptionError,
    device: transcriptionDevice,
    downloadProgress,
    transcribe,
    retry,
  }),
}))
```

Añadir el reseteo en `beforeEach`:
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

Añadir al final del `describe('index page', ...)`, antes del cierre:
```ts

  it('shows a progress bar while the model downloads', async () => {
    const wrapper = mountPage()
    expect(wrapper.find('[data-testid="model-download-progress"]').exists()).toBe(false)

    downloadProgress.value = 42
    await wrapper.vm.$nextTick()

    const bar = wrapper.get<HTMLProgressElement>('[data-testid="model-download-progress"]')
    expect(bar.element.value).toBe(42)
  })
```

- [ ] **Step 2: Ejecutar el test para confirmar que falla**

Run: `pnpm test -- index`
Expected: FAIL — `[data-testid="model-download-progress"]` no existe en el DOM todavía.

- [ ] **Step 3: Modificar `app/pages/index.vue`**

Cambiar:
```ts
const {
  state: transcriptionState,
  text: transcriptionText,
  chunks: transcriptionChunks,
  errorMessage: transcriptionError,
  device: transcriptionDevice,
  transcribe,
  retry,
} = useTranscription()
```
por:
```ts
const {
  state: transcriptionState,
  text: transcriptionText,
  chunks: transcriptionChunks,
  errorMessage: transcriptionError,
  device: transcriptionDevice,
  downloadProgress,
  transcribe,
  retry,
} = useTranscription()
```

Cambiar:
```html
    <p v-if="transcriptionState === 'loading-model'" data-testid="status-loading-model">Descargando modelo de transcripción…</p>
```
por:
```html
    <p v-if="transcriptionState === 'loading-model'" data-testid="status-loading-model">Descargando modelo de transcripción…</p>
    <progress
      v-if="downloadProgress !== null"
      data-testid="model-download-progress"
      :value="downloadProgress"
      max="100"
    />
```

- [ ] **Step 4: Ejecutar los tests para confirmar que pasan**

Run: `pnpm test -- index`
Expected: PASS (8 tests passed)

- [ ] **Step 5: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan, sin regresiones)

- [ ] **Step 6: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 7: Commit**

```bash
git add app/pages/index.vue tests/unit/pages/index.test.ts
git commit -m "Añade barra de progreso de descarga del modelo en la página principal"
```

---

### Task 5: Clonar y transferir el buffer de audio al worker

**Files:**
- Modify: `app/composables/useTranscription.ts`
- Modify: `tests/unit/composables/useTranscription.test.ts`

**Interfaces:**
- No cambia la firma pública de `transcribe`/`retry` (`(audio: Float32Array, modelSize: WhisperModelSize) => void`); cambia únicamente cómo `transcribe` envía el audio al worker internamente.

- [ ] **Step 1: Actualizar el test existente y escribir el nuevo test que falla**

En `tests/unit/composables/useTranscription.test.ts`, el primer test (`'moves to loading-model and posts a transcribe message'`) deja de ser válido porque `postMessage` pasará a recibir un segundo argumento (la lista de transferencia). Reemplazarlo:

```ts
  it('moves to loading-model and posts a transcribe message', () => {
    const worker = createFakeWorker()
    const { state, transcribe } = useTranscription(() => worker)

    transcribe(new Float32Array([0.1]), 'small')

    expect(state.value).toBe('loading-model')
    expect(worker.postMessage).toHaveBeenCalledWith(
      { type: 'transcribe', audio: expect.any(Float32Array), modelSize: 'small' },
      expect.any(Array),
    )
  })
```

Añadir, justo después de ese test:
```ts

  it('clones the audio buffer before posting so the original stays usable for a future retry', () => {
    const worker = createFakeWorker()
    const { transcribe } = useTranscription(() => worker)
    const original = new Float32Array([0.1, 0.2, 0.3])

    transcribe(original, 'small')

    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    const [message, transferList] = (worker.postMessage as ReturnType<typeof vi.fn>).mock.calls[0] as [
      { audio: Float32Array },
      Transferable[],
    ]
    expect(message.audio).not.toBe(original)
    expect(Array.from(message.audio)).toEqual([0.1, 0.2, 0.3])
    expect(transferList).toEqual([message.audio.buffer])
  })
```

- [ ] **Step 2: Ejecutar los tests para confirmar que fallan**

Run: `pnpm test -- useTranscription`
Expected: FAIL — el primer test falla porque `postMessage` todavía se llama con un solo argumento; el nuevo test falla porque `message.audio` todavía es el mismo objeto que `original` (no hay clonado).

- [ ] **Step 3: Extender `MinimalWorker` y actualizar `transcribe` en `app/composables/useTranscription.ts`**

Cambiar:
```ts
export interface MinimalWorker {
  postMessage: (message: unknown) => void
  onmessage: ((event: MessageEvent<WhisperWorkerResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  terminate: () => void
}
```
por:
```ts
export interface MinimalWorker {
  postMessage: (message: unknown, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent<WhisperWorkerResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  terminate: () => void
}
```

Cambiar:
```ts
  function transcribe(audio: Float32Array, modelSize: WhisperModelSize) {
    errorMessage.value = null
    state.value = 'loading-model'
    ensureWorker().postMessage({ type: 'transcribe', audio, modelSize })
  }
```
por:
```ts
  function transcribe(audio: Float32Array, modelSize: WhisperModelSize) {
    errorMessage.value = null
    state.value = 'loading-model'
    const transferable = audio.slice()
    ensureWorker().postMessage({ type: 'transcribe', audio: transferable, modelSize }, [transferable.buffer])
  }
```

- [ ] **Step 4: Ejecutar los tests para confirmar que pasan**

Run: `pnpm test -- useTranscription`
Expected: PASS (10 tests passed)

- [ ] **Step 5: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan, sin regresiones)

- [ ] **Step 6: Ejecutar la suite E2E**

Run: `pnpm test:e2e`
Expected: PASS (4 tests passed) — el `FakeWhisperWorker` de `tests/e2e/transcription-flow.spec.ts` solo lee `message.type` en `postMessage(message)`; un segundo argumento de transferencia no le afecta, así que no requiere cambios.

- [ ] **Step 7: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 8: Commit**

```bash
git add app/composables/useTranscription.ts tests/unit/composables/useTranscription.test.ts
git commit -m "Clona y transfiere el buffer de audio al worker en vez de copiarlo implícitamente"
```

---
