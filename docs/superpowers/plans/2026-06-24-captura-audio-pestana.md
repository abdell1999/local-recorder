# Captura de audio de pestaña — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir la captura de audio de una pestaña del navegador (vía `getDisplayMedia`) como segunda fuente de grabación, alternativa al micrófono, sin mezcla simultánea.

**Architecture:** `useRecorder.start()` pasa a aceptar un parámetro `source: 'microphone' | 'tab'`; internamente dos funciones privadas (`getMicrophoneStream`/`getTabStream`) adquieren el `MediaStream` según la fuente, y comparten el resto de la lógica (`MediaRecorder`, `chunks`, `stop()`) sin duplicación. `RecordButton.vue` pasa a recibir `source`/`label` como props y solo se renderiza fuera de `'recording'`; `index.vue` monta dos instancias (una por fuente) más un botón "Detener" propio y dos mensajes de error nuevos.

**Tech Stack:** Igual que fases anteriores — Nuxt 4, TypeScript, Vue `<script setup>`, Tailwind CSS, Vitest + `@vue/test-utils` + happy-dom, pnpm.

## Global Constraints

- Package manager: pnpm only.
- Styling: Tailwind CSS, sin librería de componentes.
- Commits: sin co-author, mensajes en español, siempre en `main` (`CLAUDE.md`).
- Composables/componentes con imports explícitos de `vue`, no auto-imports de Nuxt.
- `pnpm dlx nuxi typecheck` debe seguir pasando limpio tras cada tarea.
- Tras cada tarea, correr `pnpm test` completo para confirmar que no hay regresiones.
- Sin mezcla simultánea micrófono+pestaña (fuera de alcance, ver spec).
- Sin detección previa de soporte de `getDisplayMedia` (fuera de alcance, ver spec).

---

### Task 1: `useRecorder` con fuente seleccionable

**Files:**
- Modify: `app/composables/useRecorder.ts`
- Modify: `tests/unit/composables/useRecorder.test.ts`

**Interfaces:**
- Consumes: nada nuevo — usa `navigator.mediaDevices.getUserMedia` (ya existente) y `navigator.mediaDevices.getDisplayMedia` (nuevo).
- Produces: nuevo tipo exportado `RecorderSource = 'microphone' | 'tab'`; `start(source: RecorderSource = 'microphone'): Promise<void>` (antes `start(): Promise<void>`, sin parámetro). `errorMessage` puede tomar ahora también los valores `'tab-permission-denied'` y `'tab-audio-not-shared'`, además del ya existente `'mic-permission-denied'`. Consumido por las Tareas 2 y 3 (vía `index.vue`).

- [ ] **Step 1: Escribir los tests que fallan**

En `tests/unit/composables/useRecorder.test.ts`, añadir al final del `describe('useRecorder', ...)`, antes del cierre:

```ts

  it('starts recording from a shared tab and stops its video track', async () => {
    const audioTrack = { stop: vi.fn() }
    const videoTrack = { stop: vi.fn() }
    const fakeStream = {
      getTracks: () => [audioTrack, videoTrack],
      getAudioTracks: () => [audioTrack],
      getVideoTracks: () => [videoTrack],
    } as unknown as MediaStream
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(fakeStream) } })

    const { state, start } = useRecorder()
    await start('tab')

    expect(state.value).toBe('recording')
    expect(videoTrack.stop).toHaveBeenCalled()
  })

  it('sets an error state when the shared tab has no audio track', async () => {
    const videoTrack = { stop: vi.fn() }
    const fakeStream = {
      getTracks: () => [videoTrack],
      getAudioTracks: () => [],
      getVideoTracks: () => [videoTrack],
    } as unknown as MediaStream
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(fakeStream) } })

    const { state, errorMessage, start } = useRecorder()
    await start('tab')

    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('tab-audio-not-shared')
    expect(videoTrack.stop).toHaveBeenCalled()
  })

  it('sets an error state when the tab share picker is cancelled', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getDisplayMedia: vi.fn().mockRejectedValue(new Error('cancelled')) },
    })

    const { state, errorMessage, start } = useRecorder()
    await start('tab')

    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('tab-permission-denied')
  })
```

- [ ] **Step 2: Ejecutar los tests para confirmar que fallan**

Run: `pnpm test -- useRecorder`
Expected: FAIL — los tres tests nuevos fallan porque `start('tab')` todavía ignora cualquier argumento y siempre intenta `getUserMedia` (no `getDisplayMedia`), así que `errorMessage.value` termina siendo `'mic-permission-denied'` en vez de los valores esperados.

- [ ] **Step 3: Reescribir `app/composables/useRecorder.ts`**

Reemplazar el contenido completo del archivo por:

```ts
import { ref } from 'vue'

export type RecorderState = 'idle' | 'recording' | 'stopped' | 'error'
export type RecorderSource = 'microphone' | 'tab'

export function useRecorder() {
  const state = ref<RecorderState>('idle')
  const errorMessage = ref<string | null>(null)
  let mediaRecorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let stream: MediaStream | null = null

  async function getMicrophoneStream(): Promise<MediaStream | null> {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      state.value = 'error'
      errorMessage.value = 'mic-permission-denied'
      return null
    }
  }

  async function getTabStream(): Promise<MediaStream | null> {
    let tabStream: MediaStream
    try {
      tabStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    } catch {
      state.value = 'error'
      errorMessage.value = 'tab-permission-denied'
      return null
    }
    tabStream.getVideoTracks().forEach((track) => track.stop())
    if (tabStream.getAudioTracks().length === 0) {
      state.value = 'error'
      errorMessage.value = 'tab-audio-not-shared'
      return null
    }
    return tabStream
  }

  async function start(source: RecorderSource = 'microphone') {
    errorMessage.value = null
    chunks = []
    stream = source === 'tab' ? await getTabStream() : await getMicrophoneStream()
    if (!stream) return

    mediaRecorder = new MediaRecorder(stream)
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    mediaRecorder.start()
    state.value = 'recording'
  }

  function stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!mediaRecorder) {
        resolve(new Blob())
        return
      }
      mediaRecorder.onstop = () => {
        state.value = 'stopped'
        stream?.getTracks().forEach((track) => track.stop())
        resolve(new Blob(chunks, { type: 'audio/webm' }))
      }
      mediaRecorder.stop()
    })
  }

  return { state, errorMessage, start, stop }
}
```

Nota: cuando `getTabStream` detecta que no hay pistas de audio, las pistas de
vídeo ya se detuvieron en la línea anterior (`tabStream.getVideoTracks().forEach(...)`)
y no hay ninguna pista de audio que detener — no queda nada pendiente de
limpiar en ese camino.

- [ ] **Step 4: Ejecutar los tests para confirmar que pasan**

Run: `pnpm test -- useRecorder`
Expected: PASS (6 tests passed) — los 3 tests existentes de micrófono siguen pasando sin modificación (usan `start()` sin argumento, que sigue por defecto en `'microphone'`).

- [ ] **Step 5: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan, sin regresiones)

- [ ] **Step 6: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 7: Commit**

```bash
git add app/composables/useRecorder.ts tests/unit/composables/useRecorder.test.ts
git commit -m "Añade captura de audio de pestaña a useRecorder"
```

---

### Task 2: `RecordButton` con `source`/`label`

**Files:**
- Modify: `app/components/recorder/RecordButton.vue`
- Modify: `tests/unit/components/RecordButton.test.ts`

**Interfaces:**
- Consumes: nada de la Tarea 1 directamente (este componente no llama a `useRecorder`).
- Produces: nuevas props `source: 'microphone' | 'tab'`, `label: string` (sustituye el texto fijo `'Grabar'`); ya no emite `stop` (solo `start`); ya no se renderiza cuando `state === 'recording'`; `data-testid` pasa a ser `` `record-button-${source}` `` en vez del fijo `'record-button'`. Consumido por la Tarea 3 (`index.vue`), que monta dos instancias.

- [ ] **Step 1: Escribir los tests que fallan**

Reemplazar el contenido completo de `tests/unit/components/RecordButton.test.ts` por:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RecordButton from '../../../app/components/recorder/RecordButton.vue'

describe('RecordButton', () => {
  it('shows the given label and emits start when clicked', async () => {
    const wrapper = mount(RecordButton, { props: { state: 'idle', source: 'microphone', label: 'Grabar micrófono' } })
    expect(wrapper.text()).toContain('Grabar micrófono')
    await wrapper.get('[data-testid="record-button-microphone"]').trigger('click')
    expect(wrapper.emitted('start')).toHaveLength(1)
  })

  it('uses a distinct data-testid per source', () => {
    const wrapper = mount(RecordButton, { props: { state: 'idle', source: 'tab', label: 'Grabar pestaña' } })
    expect(wrapper.find('[data-testid="record-button-tab"]').exists()).toBe(true)
  })

  it('renders nothing while recording', () => {
    const wrapper = mount(RecordButton, { props: { state: 'recording', source: 'microphone', label: 'Grabar micrófono' } })
    expect(wrapper.find('[data-testid="record-button-microphone"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Ejecutar los tests para confirmar que fallan**

Run: `pnpm test -- RecordButton`
Expected: FAIL — el componente actual no acepta las props `source`/`label` (TypeScript las rechazará en tiempo de test/build, o en runtime el texto seguirá siendo `'Grabar'` fijo) y sigue renderizando un botón con `data-testid="record-button"` también en estado `'recording'`.

- [ ] **Step 3: Reescribir `app/components/recorder/RecordButton.vue`**

Reemplazar el contenido completo del archivo por:

```vue
<script setup lang="ts">
defineProps<{ state: 'idle' | 'recording' | 'stopped' | 'error'; source: 'microphone' | 'tab'; label: string }>()
const emit = defineEmits<{ start: [] }>()
</script>

<template>
  <button
    v-if="state !== 'recording'"
    :data-testid="`record-button-${source}`"
    class="px-4 py-2 rounded font-semibold bg-blue-600 text-white"
    @click="emit('start')"
  >
    {{ label }}
  </button>
</template>
```

- [ ] **Step 4: Ejecutar los tests para confirmar que pasan**

Run: `pnpm test -- RecordButton`
Expected: PASS (3 tests passed)

- [ ] **Step 5: Ejecutar la suite completa**

Run: `pnpm test`
Expected: FAIL en `tests/unit/pages/index.test.ts` — esperado en este punto, porque `index.vue` todavía monta `<RecordButton :state="recorderState" @start="handleRecordStart" @stop="handleRecordStop" />` sin las props `source`/`label` que el componente ahora exige. Esto se corrige en la Tarea 3. No corregir `index.vue` en esta tarea.

- [ ] **Step 6: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: errores de tipado esperados en `app/pages/index.vue` (props `source`/`label` faltantes) — mismo motivo que el Step 5, se corrige en la Tarea 3.

- [ ] **Step 7: Commit**

```bash
git add app/components/recorder/RecordButton.vue tests/unit/components/RecordButton.test.ts
git commit -m "Añade props source/label a RecordButton y oculta el botón mientras grabar"
```

---

### Task 3: Conectar las dos fuentes en `index.vue`

**Files:**
- Modify: `app/pages/index.vue`
- Modify: `tests/unit/pages/index.test.ts`

**Interfaces:**
- Consumes: `start(source: RecorderSource)` de `useRecorder` (Tarea 1); `RecordButton` con props `source`/`label`, evento `start` sin payload (Tarea 2).
- No produce nada nuevo para tareas posteriores — esta tarea es la integración final del plan.

- [ ] **Step 1: Escribir los tests que fallan**

En `tests/unit/pages/index.test.ts`, añadir el import de `RecordButton` junto a los demás:

```ts
import RecordButton from '../../../app/components/recorder/RecordButton.vue'
```

Quitar `RecordButton: true` del objeto `stubs` dentro de `mountPage()` — ya no se puede stubear genéricamente porque ahora se necesita inspeccionar sus props/eventos con `findAllComponents`. El resto de `stubs` (`RecordingTimer`, `TranscriptEditor`, `ExportMenu`, `ModelSizePicker`) no cambia.

Antes:
```ts
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
Después:
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

Añadir al final del `describe('index page', ...)`, antes del cierre:

```ts

  it('renders one RecordButton per source with the right labels', () => {
    const wrapper = mountPage()
    const buttons = wrapper.findAllComponents(RecordButton)
    expect(buttons).toHaveLength(2)
    expect(buttons[0]?.props()).toMatchObject({ source: 'microphone', label: 'Grabar micrófono' })
    expect(buttons[1]?.props()).toMatchObject({ source: 'tab', label: 'Grabar pestaña' })
  })

  it('starts recording with the right source when each RecordButton emits start', async () => {
    const wrapper = mountPage()
    const buttons = wrapper.findAllComponents(RecordButton)

    await buttons[1]?.vm.$emit('start')
    expect(startRecording).toHaveBeenCalledWith('tab')

    await buttons[0]?.vm.$emit('start')
    expect(startRecording).toHaveBeenCalledWith('microphone')
  })

  it('shows the stop button only while recording', async () => {
    const wrapper = mountPage()
    expect(wrapper.find('[data-testid="stop-button"]').exists()).toBe(false)

    recorderState.value = 'recording'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="stop-button"]').exists()).toBe(true)

    await wrapper.get('[data-testid="stop-button"]').trigger('click')
    expect(stopRecording).toHaveBeenCalled()
  })

  it('shows tab-specific error messages and hides the microphone one', async () => {
    recorderError.value = 'tab-permission-denied'
    const wrapper = mountPage()
    expect(wrapper.find('[data-testid="tab-permission-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="recorder-error"]').exists()).toBe(false)

    recorderError.value = 'tab-audio-not-shared'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="tab-audio-error"]').exists()).toBe(true)
  })
```

- [ ] **Step 2: Ejecutar los tests para confirmar que fallan**

Run: `pnpm test -- index`
Expected: FAIL — `index.vue` todavía monta un único `RecordButton` sin `source`/`label`, no tiene `data-testid="stop-button"`, y su único mensaje de error (`recorder-error`) se muestra para cualquier `recorderError` truthy, no solo `'mic-permission-denied'`.

- [ ] **Step 3: Modificar `app/pages/index.vue`**

Cambiar la función `handleRecordStart`:
```ts
async function handleRecordStart() {
  await startRecording()
  if (recorderState.value !== 'recording') return
  elapsedSeconds.value = 0
  timerInterval = setInterval(() => {
    elapsedSeconds.value += 1
  }, 1000)
}
```
por:
```ts
async function handleRecordStart(source: 'microphone' | 'tab') {
  await startRecording(source)
  if (recorderState.value !== 'recording') return
  elapsedSeconds.value = 0
  timerInterval = setInterval(() => {
    elapsedSeconds.value += 1
  }, 1000)
}
```

Cambiar en el template:
```html
    <section class="flex items-center gap-4">
      <RecordButton :state="recorderState" @start="handleRecordStart" @stop="handleRecordStop" />
      <RecordingTimer v-if="recorderState === 'recording'" :seconds="elapsedSeconds" />
    </section>
    <p v-if="recorderError" data-testid="recorder-error" class="text-red-600">
      No se pudo acceder al micrófono. Revisa los permisos del navegador.
    </p>
```
por:
```html
    <section class="flex items-center gap-4">
      <RecordButton
        source="microphone"
        label="Grabar micrófono"
        :state="recorderState"
        @start="handleRecordStart('microphone')"
      />
      <RecordButton
        source="tab"
        label="Grabar pestaña"
        :state="recorderState"
        @start="handleRecordStart('tab')"
      />
      <button
        v-if="recorderState === 'recording'"
        data-testid="stop-button"
        class="px-4 py-2 rounded font-semibold bg-red-600 text-white"
        @click="handleRecordStop"
      >
        Detener
      </button>
      <RecordingTimer v-if="recorderState === 'recording'" :seconds="elapsedSeconds" />
    </section>
    <p v-if="recorderError === 'mic-permission-denied'" data-testid="recorder-error" class="text-red-600">
      No se pudo acceder al micrófono. Revisa los permisos del navegador.
    </p>
    <p v-if="recorderError === 'tab-permission-denied'" data-testid="tab-permission-error" class="text-red-600">
      No se concedió permiso para compartir la pestaña.
    </p>
    <p v-if="recorderError === 'tab-audio-not-shared'" data-testid="tab-audio-error" class="text-red-600">
      No se compartió audio. Vuelve a intentarlo y marca "Compartir audio de la pestaña".
    </p>
```

- [ ] **Step 4: Ejecutar los tests para confirmar que pasan**

Run: `pnpm test -- index`
Expected: PASS (12 tests passed)

- [ ] **Step 5: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan, sin regresiones — esto también confirma que el Step 5 pendiente de la Tarea 2 queda resuelto)

- [ ] **Step 6: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores (esto también confirma que el Step 6 pendiente de la Tarea 2 queda resuelto)

- [ ] **Step 7: Actualizar el test E2E de grabación**

`tests/e2e/transcription-flow.spec.ts` tiene un test que usa el antiguo
`data-testid="record-button"` fijo, tanto para iniciar como para detener la
grabación (el botón antiguo alternaba entre "Grabar"/"Detener" con un solo
testid). Con este cambio, iniciar usa el testid específico de fuente, y
detener usa el nuevo botón "Detener" independiente.

Cambiar (líneas 85-94 actuales):
```ts
test('grava desde el micrófono, transcribe (worker mockeado) y exporta SRT', async ({ page }) => {
  await page.goto('/')
  // Espera a que termine la hidratación de Vue (ver comentario del primer test).
  await page.waitForLoadState('networkidle')
  await page.getByTestId('record-button').click()
  await expect(page.getByTestId('recording-timer')).toBeVisible()
  await page.waitForTimeout(1200)
  await page.getByTestId('record-button').click()

  await expect(page.getByTestId('transcript-editor')).toHaveValue('hola mundo de prueba', { timeout: 5000 })
```
por:
```ts
test('grava desde el micrófono, transcribe (worker mockeado) y exporta SRT', async ({ page }) => {
  await page.goto('/')
  // Espera a que termine la hidratación de Vue (ver comentario del primer test).
  await page.waitForLoadState('networkidle')
  await page.getByTestId('record-button-microphone').click()
  await expect(page.getByTestId('recording-timer')).toBeVisible()
  await page.waitForTimeout(1200)
  await page.getByTestId('stop-button').click()

  await expect(page.getByTestId('transcript-editor')).toHaveValue('hola mundo de prueba', { timeout: 5000 })
```

- [ ] **Step 8: Ejecutar la suite E2E**

Run: `pnpm test:e2e`
Expected: PASS (4 tests passed)

- [ ] **Step 9: Commit**

```bash
git add app/pages/index.vue tests/unit/pages/index.test.ts tests/e2e/transcription-flow.spec.ts
git commit -m "Conecta la captura de audio de pestaña en la página principal"
```

---
