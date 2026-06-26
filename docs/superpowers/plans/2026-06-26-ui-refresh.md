# UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar la UI de lista plana en una app con layout de cards, soporte de tema oscuro/claro/auto y polish visual moderno en todos los componentes.

**Architecture:** Nuevo composable `useTheme` + configuración `darkMode: 'class'` en Tailwind; nuevo componente `ThemeToggle`; restructura del template de `index.vue` en secciones con cards; añadir variantes `dark:` y estados `hover:`/`focus:` a todos los componentes existentes. Sin dependencias nuevas ni cambios en lógica de negocio.

**Tech Stack:** Vue 3 + Nuxt 4 + TypeScript + Tailwind CSS 3 (`@nuxtjs/tailwindcss`) + Vitest + `@vue/test-utils`

## Global Constraints

- Sin dependencias npm nuevas
- Sin cambiar ni eliminar ningún `data-testid` existente
- Sin tocar lógica de composables (solo templates y clases)
- Commits en español, sin `Co-Authored-By`
- Rama `main`

---

### Task 1: Tailwind dark mode + composable useTheme

**Files:**
- Create: `tailwind.config.ts` (raíz del proyecto)
- Create: `app/composables/useTheme.ts`
- Create: `tests/unit/composables/useTheme.test.ts`

**Interfaces:**
- Produces:
  - `type Theme = 'auto' | 'light' | 'dark'`
  - `function useTheme(): { theme: Ref<Theme>, setTheme(t: Theme): void, applyTheme(t: Theme): void }`
  - `localStorage` key: `'local-recorder:theme'`

- [ ] **Step 1: Crear `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: [],
} satisfies Config
```

> `content: []` — `@nuxtjs/tailwindcss` gestiona las rutas de contenido automáticamente; solo necesitamos `darkMode`.

- [ ] **Step 2: Escribir los tests de useTheme (deben fallar)**

Crear `tests/unit/composables/useTheme.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTheme } from '../../../app/composables/useTheme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() }),
  })
})

describe('useTheme', () => {
  it('defaults to auto when nothing is stored', () => {
    const { theme } = useTheme()
    expect(theme.value).toBe('auto')
  })

  it('setTheme updates theme ref', () => {
    const { theme, setTheme } = useTheme()
    setTheme('dark')
    expect(theme.value).toBe('dark')
  })

  it('persists theme to localStorage', () => {
    const { setTheme } = useTheme()
    setTheme('dark')
    expect(localStorage.getItem('local-recorder:theme')).toBe('dark')
  })

  it('reads a previously stored theme on init', () => {
    localStorage.setItem('local-recorder:theme', 'dark')
    const { theme } = useTheme()
    expect(theme.value).toBe('dark')
  })

  it('applies dark class when setTheme("dark")', () => {
    const { setTheme } = useTheme()
    setTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes dark class when setTheme("light")', () => {
    document.documentElement.classList.add('dark')
    const { setTheme } = useTheme()
    setTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('applies dark class in auto mode when system is dark', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn() }),
    })
    const { setTheme } = useTheme()
    setTheme('auto')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
```

- [ ] **Step 3: Ejecutar tests para verificar que fallan**

```
pnpm test tests/unit/composables/useTheme.test.ts
```

Esperado: FAIL — `useTheme` no existe.

- [ ] **Step 4: Implementar `app/composables/useTheme.ts`**

```ts
import { ref, watch } from 'vue'

export type Theme = 'auto' | 'light' | 'dark'

const STORAGE_KEY = 'local-recorder:theme'
const DEFAULT_THEME: Theme = 'auto'

export function useTheme() {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  const theme = ref<Theme>((stored as Theme) ?? DEFAULT_THEME)

  function applyTheme(t: Theme) {
    if (typeof document === 'undefined') return
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = t === 'dark' || (t === 'auto' && prefersDark)
    document.documentElement.classList.toggle('dark', isDark)
  }

  applyTheme(theme.value)

  watch(
    theme,
    (t) => {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, t)
      applyTheme(t)
    },
    { flush: 'sync' },
  )

  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (theme.value === 'auto') applyTheme('auto')
    })
  }

  function setTheme(t: Theme) {
    theme.value = t
  }

  return { theme, setTheme, applyTheme }
}
```

- [ ] **Step 5: Ejecutar tests**

```
pnpm test tests/unit/composables/useTheme.test.ts
```

Esperado: 7 tests PASS.

- [ ] **Step 6: Commit**

```
git add tailwind.config.ts app/composables/useTheme.ts tests/unit/composables/useTheme.test.ts
git commit -m "Añade composable useTheme y activa darkMode class en Tailwind"
```

---

### Task 2: ThemeToggle component + inicialización en app.vue

**Files:**
- Create: `app/components/settings/ThemeToggle.vue`
- Create: `tests/unit/components/ThemeToggle.test.ts`
- Modify: `app/app.vue`

**Interfaces:**
- Consumes: `useTheme()` de Task 1 → `{ theme, setTheme }`
- Produces: componente `<ThemeToggle />` sin props, con `data-testid` `theme-option-auto/light/dark`

- [ ] **Step 1: Escribir el test de ThemeToggle (debe fallar)**

Crear `tests/unit/components/ThemeToggle.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ThemeToggle from '../../../app/components/settings/ThemeToggle.vue'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() }),
  })
})

describe('ThemeToggle', () => {
  it('renders the three theme buttons', () => {
    const wrapper = mount(ThemeToggle)
    expect(wrapper.find('[data-testid="theme-option-auto"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="theme-option-light"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="theme-option-dark"]').exists()).toBe(true)
  })

  it('clicking dark adds dark class to documentElement', async () => {
    const wrapper = mount(ThemeToggle)
    await wrapper.find('[data-testid="theme-option-dark"]').trigger('click')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('clicking light removes dark class', async () => {
    document.documentElement.classList.add('dark')
    const wrapper = mount(ThemeToggle)
    await wrapper.find('[data-testid="theme-option-light"]').trigger('click')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
```

- [ ] **Step 2: Ejecutar tests para verificar que fallan**

```
pnpm test tests/unit/components/ThemeToggle.test.ts
```

Esperado: FAIL — `ThemeToggle` no existe.

- [ ] **Step 3: Implementar `app/components/settings/ThemeToggle.vue`**

```vue
<script setup lang="ts">
import { useTheme, type Theme } from '../../composables/useTheme'

const { theme, setTheme } = useTheme()

const options: { value: Theme; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
]
</script>

<template>
  <div class="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs font-medium">
    <button
      v-for="opt in options"
      :key="opt.value"
      :data-testid="`theme-option-${opt.value}`"
      class="px-3 py-1.5 transition-colors"
      :class="
        theme === opt.value
          ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
          : 'bg-white text-gray-500 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
      "
      @click="setTheme(opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>
```

- [ ] **Step 4: Modificar `app/app.vue` para inicializar el tema**

```vue
<script setup lang="ts">
import { useTheme } from './composables/useTheme'
useTheme()
</script>

<template>
  <NuxtPage />
</template>
```

- [ ] **Step 5: Ejecutar tests**

```
pnpm test tests/unit/components/ThemeToggle.test.ts
```

Esperado: 3 tests PASS.

- [ ] **Step 6: Commit**

```
git add app/components/settings/ThemeToggle.vue tests/unit/components/ThemeToggle.test.ts app/app.vue
git commit -m "Añade ThemeToggle e inicializa tema en app.vue"
```

---

### Task 3: Restructura del layout de index.vue

**Files:**
- Modify: `app/pages/index.vue` (solo template, sin cambios en `<script setup>`)

**Interfaces:**
- Consumes: `ThemeToggle` de Task 2
- No cambia ningún `data-testid` existente

- [ ] **Step 1: Ejecutar suite existente para confirmar baseline**

```
pnpm test tests/unit/pages/index.test.ts
```

Esperado: 18 tests PASS.

- [ ] **Step 2: Añadir ThemeToggle al stub de index.test.ts**

En `tests/unit/pages/index.test.ts`, dentro de `mountPage()`, añadir `ThemeToggle: true` al objeto `stubs`:

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
        ThemeToggle: true,
      },
    },
  })
}
```

- [ ] **Step 3: Reemplazar el template de index.vue**

Sustituir todo el bloque `<template>` por:

```vue
<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
    <main class="max-w-3xl mx-auto px-4 py-8 space-y-4">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold tracking-tight">Local Recorder</h1>
        <ThemeToggle />
      </div>

      <!-- Configuración -->
      <section class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
        <h2 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Configuración
        </h2>
        <div class="flex items-center gap-4 flex-wrap">
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600 dark:text-gray-400">Modelo:</span>
            <ModelSizePicker
              :model-value="modelSize"
              :disabled="transcriptionState === 'loading-model' || transcriptionState === 'transcribing'"
              @update:model-value="setModelSize"
            />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600 dark:text-gray-400">Idioma:</span>
            <LanguagePicker
              :model-value="language"
              :disabled="transcriptionState === 'loading-model' || transcriptionState === 'transcribing'"
              @update:model-value="setLanguage"
            />
          </div>
        </div>
      </section>

      <!-- Captura -->
      <section class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm space-y-4">
        <h2 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Captura
        </h2>
        <div class="flex items-center gap-3 flex-wrap">
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
            class="px-4 py-2 rounded-lg font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
            @click="handleRecordStop"
          >
            Detener
          </button>
          <RecordingTimer v-if="recorderState === 'recording'" :seconds="elapsedSeconds" />
        </div>
        <p v-if="recorderError === 'mic-permission-denied'" data-testid="recorder-error" class="text-sm text-red-600 dark:text-red-400">
          No se pudo acceder al micrófono. Revisa los permisos del navegador.
        </p>
        <p v-if="recorderError === 'tab-permission-denied'" data-testid="tab-permission-error" class="text-sm text-red-600 dark:text-red-400">
          No se concedió permiso para compartir la pestaña.
        </p>
        <p v-if="recorderError === 'tab-audio-not-shared'" data-testid="tab-audio-error" class="text-sm text-red-600 dark:text-red-400">
          No se compartió audio. Vuelve a intentarlo y marca "Compartir audio de la pestaña".
        </p>
        <FileDropzone @file-selected="handleFileSelected" @rejected="handleFileRejected" />
        <p v-if="importRejectedReason || importError" data-testid="import-error" class="text-sm text-red-600 dark:text-red-400">
          Formato de archivo no soportado. Prueba con mp3, wav, m4a, mp4 o webm.
        </p>
      </section>

      <!-- Estado de transcripción -->
      <div class="space-y-2 px-1">
        <p v-if="transcriptionDevice === 'wasm'" data-testid="wasm-fallback-notice" class="text-sm text-amber-600 dark:text-amber-400">
          Tu navegador no soporta WebGPU: usando modo compatibilidad (más lento).
        </p>
        <p v-if="transcriptionState === 'loading-model'" data-testid="status-loading-model" class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <svg class="animate-spin h-4 w-4 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Descargando modelo de transcripción…
        </p>
        <div v-if="downloadProgress !== null" class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
          <div
            data-testid="model-download-progress"
            class="bg-indigo-500 h-1.5 rounded-full transition-all"
            :style="{ width: `${downloadProgress}%` }"
          />
        </div>
        <p v-if="transcriptionState === 'transcribing'" data-testid="status-transcribing" class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <svg class="animate-spin h-4 w-4 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Transcribiendo…
        </p>
        <div v-if="transcriptionState === 'error'" data-testid="transcription-error" class="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
          <p>{{ transcriptionError ?? 'Ocurrió un error al transcribir.' }}</p>
          <button data-testid="retry-button" class="underline hover:no-underline" @click="handleRetry">Reintentar</button>
        </div>
      </div>

      <template v-if="transcriptionState === 'done'">
        <p v-if="editedText.trim() === ''" data-testid="no-speech-detected" class="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
          No se detectó voz en el audio.
        </p>
        <template v-else>

          <!-- Transcripción -->
          <section class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm space-y-3">
            <div class="flex items-center justify-between">
              <h2 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Transcripción
              </h2>
              <ExportMenu
                :result="{ text: editedText, chunks: transcriptionChunks }"
                :segments="diarizationState === 'done' ? diarizationSegments : undefined"
              />
            </div>
            <TranscriptEditor v-model="editedText" />
          </section>

          <!-- Acciones -->
          <section class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm space-y-4">

            <!-- Resumir -->
            <div class="space-y-3">
              <div class="flex items-center gap-3 flex-wrap">
                <button
                  data-testid="summarize-button"
                  class="px-4 py-2 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  :disabled="summarizerState === 'loading-model' || summarizerState === 'summarizing'"
                  @click="handleSummarize"
                >
                  Resumir
                </button>
                <div class="flex items-center gap-2">
                  <span class="text-sm text-gray-500 dark:text-gray-400">Modelo:</span>
                  <LlmModelSizePicker
                    :model-value="llmModelSize"
                    :disabled="summarizerState === 'loading-model' || summarizerState === 'summarizing'"
                    @update:model-value="setLlmModelSize"
                  />
                </div>
              </div>
              <p v-if="summarizerState === 'loading-model'" data-testid="status-loading-model-llm" class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <svg class="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Descargando modelo de resumen…
              </p>
              <div v-if="summaryDownloadProgress !== null" class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div
                  data-testid="llm-download-progress"
                  class="bg-blue-500 h-1.5 rounded-full transition-all"
                  :style="{ width: `${summaryDownloadProgress}%` }"
                />
              </div>
              <p v-if="summarizerState === 'summarizing'" data-testid="status-summarizing-llm" class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <svg class="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Generando resumen…
              </p>
              <div v-if="summarizerState === 'error'" data-testid="summarize-error" class="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                <p>{{ summarizerError ?? 'Ocurrió un error al generar el resumen.' }}</p>
                <button data-testid="summarize-retry-button" class="underline hover:no-underline" @click="handleSummarizeRetry">Reintentar</button>
              </div>
              <SummaryEditor v-if="summarizerState === 'done'" v-model="editedSummary" />
            </div>

            <!-- Diarizar -->
            <div class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
              <button
                data-testid="diarize-button"
                class="px-4 py-2 rounded-lg font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="diarizationState === 'loading-model' || diarizationState === 'segmenting' || diarizationState === 'identifying-speakers'"
                @click="handleDiarize"
              >
                Identificar hablantes
              </button>
              <p v-if="diarizationState === 'loading-model'" data-testid="status-loading-model-diarization" class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <svg class="animate-spin h-4 w-4 text-purple-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Descargando modelo de diarización…
              </p>
              <div v-if="diarizationDownloadProgress !== null" class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div
                  data-testid="diarization-download-progress"
                  class="bg-purple-500 h-1.5 rounded-full transition-all"
                  :style="{ width: `${diarizationDownloadProgress}%` }"
                />
              </div>
              <p v-if="diarizationState === 'segmenting'" data-testid="status-segmenting" class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <svg class="animate-spin h-4 w-4 text-purple-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Segmentando audio…
              </p>
              <p v-if="diarizationState === 'identifying-speakers'" data-testid="status-identifying-speakers" class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <svg class="animate-spin h-4 w-4 text-purple-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Identificando hablantes…
              </p>
              <div v-if="diarizationState === 'error'" data-testid="diarization-error" class="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                <p>{{ diarizationError ?? 'Ocurrió un error al identificar hablantes.' }}</p>
                <button data-testid="diarize-retry-button" class="underline hover:no-underline" @click="handleDiarizeRetry">Reintentar</button>
              </div>
              <SpeakerTranscriptView
                v-if="diarizationState === 'done'"
                data-testid="speaker-transcript-view"
                :blocks="speakerBlocks"
              />
            </div>

          </section>

        </template>
      </template>

    </main>
  </div>
</template>
```

Añadir también el import de `ThemeToggle` en `<script setup>`:
```ts
import ThemeToggle from '../components/settings/ThemeToggle.vue'
```

- [ ] **Step 4: Ejecutar suite completa**

```
pnpm test
```

Esperado: 164+ tests PASS (los `data-testid` no cambian).

- [ ] **Step 5: Typecheck**

```
pnpm dlx nuxi typecheck
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```
git add app/pages/index.vue tests/unit/pages/index.test.ts
git commit -m "Restructura index.vue en layout de cards con tema oscuro"
```

---

### Task 4: Polish — RecordButton, FileDropzone, ExportMenu

**Files:**
- Modify: `app/components/recorder/RecordButton.vue`
- Modify: `app/components/importer/FileDropzone.vue`
- Modify: `app/components/export/ExportMenu.vue`

- [ ] **Step 1: Actualizar RecordButton.vue**

```vue
<script setup lang="ts">
import type { RecorderSource } from '../../composables/useRecorder'

defineProps<{ state: 'idle' | 'recording' | 'stopped' | 'error'; source: RecorderSource; label: string }>()
const emit = defineEmits<{ start: [] }>()
</script>

<template>
  <button
    v-if="state !== 'recording'"
    :data-testid="`record-button-${source}`"
    class="px-4 py-2 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    @click="emit('start')"
  >
    {{ label }}
  </button>
</template>
```

- [ ] **Step 2: Actualizar FileDropzone.vue**

```vue
<script setup lang="ts">
const emit = defineEmits<{ 'file-selected': [file: File]; rejected: [reason: string] }>()

function handleFiles(files: FileList | File[] | null) {
  const file = files?.[0]
  if (!file) return
  if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
    emit('rejected', 'unsupported-file-type')
    return
  }
  emit('file-selected', file)
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  handleFiles(event.dataTransfer?.files ?? null)
}

function onChange(event: Event) {
  handleFiles((event.target as HTMLInputElement).files)
}

defineExpose({ onDrop })
</script>

<template>
  <div
    data-testid="file-dropzone"
    class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center bg-gray-50 dark:bg-gray-800/50 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors cursor-pointer"
    @dragover.prevent
    @drop="onDrop"
  >
    <p class="text-sm text-gray-500 dark:text-gray-400">
      Arrastra un archivo de audio o vídeo, o
      <label class="text-indigo-600 dark:text-indigo-400 underline cursor-pointer hover:text-indigo-700 dark:hover:text-indigo-300">
        selecciona uno
        <input type="file" accept="audio/*,video/*" class="hidden" data-testid="file-input" @change="onChange" />
      </label>
    </p>
  </div>
</template>
```

- [ ] **Step 3: Actualizar ExportMenu.vue**

```vue
<script setup lang="ts">
import { toTxt, toSrt, toVtt, toJson, toMarkdown, type TranscriptResult } from '../../utils/transcriptExport'
import type { SpeakerSegment } from '../../workers/speakerSegmentation.types'

const props = defineProps<{
  result: TranscriptResult
  segments?: SpeakerSegment[]
}>()

const formats = [
  { key: 'txt', label: 'TXT', mime: 'text/plain', extension: 'txt', generate: () => toTxt(props.result) },
  { key: 'srt', label: 'SRT', mime: 'text/plain', extension: 'srt', generate: () => toSrt(props.result) },
  { key: 'vtt', label: 'VTT', mime: 'text/vtt', extension: 'vtt', generate: () => toVtt(props.result) },
  { key: 'json', label: 'JSON', mime: 'application/json', extension: 'json', generate: () => toJson(props.result) },
  { key: 'md', label: 'MD', mime: 'text/markdown', extension: 'md', generate: () => toMarkdown(props.result, props.segments) },
] as const

function download(format: (typeof formats)[number]) {
  const content = format.generate()
  const blob = new Blob([content], { type: format.mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `transcript.${format.extension}`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="flex gap-1.5 flex-wrap">
    <button
      v-for="format in formats"
      :key="format.key"
      :data-testid="`export-${format.key}`"
      class="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
      @click="download(format)"
    >
      {{ format.label }}
    </button>
  </div>
</template>
```

- [ ] **Step 4: Ejecutar suite**

```
pnpm test
```

Esperado: todos los tests PASS.

- [ ] **Step 5: Commit**

```
git add app/components/recorder/RecordButton.vue app/components/importer/FileDropzone.vue app/components/export/ExportMenu.vue
git commit -m "Añade dark mode y hover states a RecordButton, FileDropzone y ExportMenu"
```

---

### Task 5: Polish — editores, pickers y SpeakerTranscriptView

**Files:**
- Modify: `app/components/transcript/TranscriptEditor.vue`
- Modify: `app/components/summary/SummaryEditor.vue`
- Modify: `app/components/settings/ModelSizePicker.vue`
- Modify: `app/components/settings/LlmModelSizePicker.vue`
- Modify: `app/components/settings/LanguagePicker.vue`
- Modify: `app/components/diarization/SpeakerTranscriptView.vue`

- [ ] **Step 1: Actualizar TranscriptEditor.vue**

```vue
<script setup lang="ts">
defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <textarea
    class="w-full h-64 p-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
    data-testid="transcript-editor"
    :value="modelValue"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>
```

- [ ] **Step 2: Actualizar SummaryEditor.vue**

```vue
<script setup lang="ts">
defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <textarea
    class="w-full h-64 p-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
    data-testid="summary-editor"
    :value="modelValue"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>
```

- [ ] **Step 3: Actualizar ModelSizePicker.vue**

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
    class="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    :value="modelValue"
    :disabled="disabled"
    @change="onChange"
  >
    <option v-for="size in sizes" :key="size" :value="size">{{ WHISPER_MODELS[size] }}</option>
  </select>
</template>
```

- [ ] **Step 4: Actualizar LlmModelSizePicker.vue**

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
    class="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    :value="modelValue"
    :disabled="disabled"
    @change="onChange"
  >
    <option v-for="size in sizes" :key="size" :value="size">{{ size }}</option>
  </select>
</template>
```

- [ ] **Step 5: Actualizar LanguagePicker.vue**

Reemplazar las clases del `<input>` y del `<ul>` / `<li>`:

- Input: `class="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed w-48 transition-colors"`
- `<ul>`: `class="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg text-sm"`
- `<li>`: `class="cursor-pointer px-2 py-1.5 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"`

El componente completo:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { WHISPER_LANGUAGES, type WhisperLanguageEntry } from '../../utils/whisperLanguages'

const props = withDefaults(defineProps<{ modelValue: string; disabled?: boolean }>(), { disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const query = ref('')

function getNameByCode(code: string): string {
  return WHISPER_LANGUAGES.find((l) => l.code === code)?.name ?? code
}

const filtered = computed(() => {
  if (query.value === '') return WHISPER_LANGUAGES
  const q = query.value.toLowerCase()
  return WHISPER_LANGUAGES.filter(
    (l) => l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q),
  )
})

function onFocus() {
  if (props.disabled) return
  open.value = true
  query.value = ''
}

function onInput(e: Event) {
  query.value = (e.target as HTMLInputElement).value
}

function select(entry: WhisperLanguageEntry) {
  emit('update:modelValue', entry.code)
  open.value = false
  query.value = ''
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    open.value = false
    query.value = ''
  }
}

function onBlur() {
  setTimeout(() => {
    open.value = false
    query.value = ''
  }, 150)
}
</script>

<template>
  <div class="relative">
    <input
      data-testid="language-picker-input"
      type="text"
      class="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed w-48 transition-colors"
      :value="open ? query : getNameByCode(modelValue)"
      :disabled="disabled"
      @focus="onFocus"
      @input="onInput"
      @keydown="onKeydown"
      @blur="onBlur"
    />
    <ul
      v-if="open && filtered.length > 0"
      data-testid="language-picker-dropdown"
      class="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg text-sm"
    >
      <li
        v-for="entry in filtered"
        :key="entry.code"
        :data-testid="`language-option-${entry.code}`"
        class="cursor-pointer px-2 py-1.5 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
        @mousedown.prevent="select(entry)"
      >
        {{ entry.name }}
      </li>
    </ul>
  </div>
</template>
```

- [ ] **Step 6: Actualizar SpeakerTranscriptView.vue**

```vue
<script setup lang="ts">
import type { AlignedSpeakerBlock } from '../../utils/speakerTranscriptAlignment'

defineProps<{ blocks: AlignedSpeakerBlock[] }>()

const SPEAKER_COLORS = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500']

function speakerColor(id: number | null): string {
  return id !== null ? (SPEAKER_COLORS[id] ?? 'bg-gray-500') : 'bg-gray-400'
}
</script>

<template>
  <div class="space-y-4">
    <div v-for="(block, index) in blocks" :key="index" class="flex gap-3">
      <div class="flex-shrink-0 mt-0.5">
        <span
          class="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white"
          :class="speakerColor(block.globalSpeakerId)"
        >
          {{ block.globalSpeakerId !== null ? block.globalSpeakerId + 1 : '?' }}
        </span>
      </div>
      <p class="text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{{ block.text }}</p>
    </div>
  </div>
</template>
```

- [ ] **Step 7: Ejecutar suite completa**

```
pnpm test
```

Esperado: todos los tests PASS.

- [ ] **Step 8: Typecheck**

```
pnpm dlx nuxi typecheck
```

Esperado: sin errores.

- [ ] **Step 9: Commit**

```
git add app/components/transcript/TranscriptEditor.vue app/components/summary/SummaryEditor.vue app/components/settings/ModelSizePicker.vue app/components/settings/LlmModelSizePicker.vue app/components/settings/LanguagePicker.vue app/components/diarization/SpeakerTranscriptView.vue
git commit -m "Añade dark mode y polish visual a editores, pickers y vista de hablantes"
```
