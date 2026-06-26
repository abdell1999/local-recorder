# Selector de idioma para transcripción — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un picker de idioma con búsqueda que permita forzar el idioma de transcripción de Whisper o dejarlo en auto-detect.

**Architecture:** Cuatro capas independientes: datos + composable (Task 1), componente combobox (Task 2), plumbing hacia el worker (Task 3), wiring en index.vue (Task 4). El parámetro `language` fluye como `string` ISO 639-1 desde el composable hasta el pipeline de Whisper; cuando es `'auto'` no se pasa al pipeline.

**Tech Stack:** Nuxt 4, Vue 3, TypeScript, Vitest, pnpm.

## Global Constraints

- Package manager: pnpm only.
- Commits sin co-author, mensajes en español, siempre en `main` (`CLAUDE.md`).
- `pnpm dlx nuxi typecheck` debe pasar limpio tras cada tarea.
- `pnpm test` completo debe pasar sin regresiones tras cada tarea.
- `noUncheckedIndexedAccess: true` — guards explícitos en accesos a array, nunca casts.

---

### Task 1: Datos e idioma seleccionado

**Files:**
- Create: `app/utils/whisperLanguages.ts`
- Create: `app/composables/useLanguageSelector.ts`
- Test: `tests/unit/utils/whisperLanguages.test.ts`
- Test: `tests/unit/composables/useLanguageSelector.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // app/utils/whisperLanguages.ts
  export interface WhisperLanguageEntry { code: string; name: string }
  export const WHISPER_LANGUAGES: WhisperLanguageEntry[]

  // app/composables/useLanguageSelector.ts
  export function useLanguageSelector(): {
    language: Ref<string>
    setLanguage: (lang: string) => void
  }
  ```
  Usados por Task 2 (`LanguagePicker.vue`) y Task 4 (`index.vue`).

- [ ] **Step 1: Añadir los tests de `whisperLanguages` que fallan**

Crear `tests/unit/utils/whisperLanguages.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { WHISPER_LANGUAGES } from '../../../app/utils/whisperLanguages'

describe('whisperLanguages', () => {
  it('first entry is auto-detect', () => {
    const first = WHISPER_LANGUAGES[0]
    expect(first).toEqual({ code: 'auto', name: 'Auto-detectar' })
  })

  it('all entries have non-empty code and name', () => {
    for (const entry of WHISPER_LANGUAGES) {
      expect(entry.code.length).toBeGreaterThan(0)
      expect(entry.name.length).toBeGreaterThan(0)
    }
  })

  it('has no duplicate codes', () => {
    const codes = WHISPER_LANGUAGES.map((l) => l.code)
    expect(codes.length).toBe(new Set(codes).size)
  })

  it('contains Spanish and English', () => {
    const codes = WHISPER_LANGUAGES.map((l) => l.code)
    expect(codes).toContain('es')
    expect(codes).toContain('en')
  })
})
```

- [ ] **Step 2: Ejecutar tests y verificar que fallan**

Run: `pnpm vitest run tests/unit/utils/whisperLanguages.test.ts`
Expected: FAIL — `Cannot find module '../../../app/utils/whisperLanguages'`

- [ ] **Step 3: Crear `app/utils/whisperLanguages.ts`**

```ts
export interface WhisperLanguageEntry {
  code: string
  name: string
}

export const WHISPER_LANGUAGES: WhisperLanguageEntry[] = [
  { code: 'auto', name: 'Auto-detectar' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'am', name: 'አማርኛ' },
  { code: 'ar', name: 'العربية' },
  { code: 'as', name: 'অসমীয়া' },
  { code: 'az', name: 'Azərbaycanca' },
  { code: 'ba', name: 'Башҡортса' },
  { code: 'be', name: 'Беларуская' },
  { code: 'bg', name: 'Български' },
  { code: 'bn', name: 'বাংলা' },
  { code: 'bo', name: 'བོད་ཡིག' },
  { code: 'br', name: 'Brezhoneg' },
  { code: 'bs', name: 'Bosanski' },
  { code: 'ca', name: 'Català' },
  { code: 'cs', name: 'Čeština' },
  { code: 'cy', name: 'Cymraeg' },
  { code: 'da', name: 'Dansk' },
  { code: 'de', name: 'Deutsch' },
  { code: 'el', name: 'Ελληνικά' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'et', name: 'Eesti' },
  { code: 'eu', name: 'Euskara' },
  { code: 'fa', name: 'فارسی' },
  { code: 'fi', name: 'Suomi' },
  { code: 'fo', name: 'Føroyskt' },
  { code: 'fr', name: 'Français' },
  { code: 'gl', name: 'Galego' },
  { code: 'gu', name: 'ગુજરાતી' },
  { code: 'ha', name: 'Hausa' },
  { code: 'haw', name: 'ʻŌlelo Hawaiʻi' },
  { code: 'he', name: 'עברית' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'hr', name: 'Hrvatski' },
  { code: 'ht', name: 'Kreyòl ayisyen' },
  { code: 'hu', name: 'Magyar' },
  { code: 'hy', name: 'Հայերեն' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'is', name: 'Íslenska' },
  { code: 'it', name: 'Italiano' },
  { code: 'ja', name: '日本語' },
  { code: 'jw', name: 'Basa Jawa' },
  { code: 'ka', name: 'ქართული' },
  { code: 'kk', name: 'Қазақша' },
  { code: 'km', name: 'ខ្មែរ' },
  { code: 'kn', name: 'ಕನ್ನಡ' },
  { code: 'ko', name: '한국어' },
  { code: 'la', name: 'Latina' },
  { code: 'lb', name: 'Lëtzebuergesch' },
  { code: 'ln', name: 'Lingála' },
  { code: 'lo', name: 'ລາວ' },
  { code: 'lt', name: 'Lietuvių' },
  { code: 'lv', name: 'Latviešu' },
  { code: 'mg', name: 'Malagasy' },
  { code: 'mi', name: 'Te reo Māori' },
  { code: 'mk', name: 'Македонски' },
  { code: 'ml', name: 'മലയാളം' },
  { code: 'mn', name: 'Монгол' },
  { code: 'mr', name: 'मराठी' },
  { code: 'ms', name: 'Bahasa Melayu' },
  { code: 'mt', name: 'Malti' },
  { code: 'my', name: 'မြန်မာဘာသာ' },
  { code: 'ne', name: 'नेपाली' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'nn', name: 'Nynorsk' },
  { code: 'no', name: 'Norsk' },
  { code: 'oc', name: 'Occitan' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ' },
  { code: 'pl', name: 'Polski' },
  { code: 'ps', name: 'پښتو' },
  { code: 'pt', name: 'Português' },
  { code: 'ro', name: 'Română' },
  { code: 'ru', name: 'Русский' },
  { code: 'sa', name: 'संस्कृतम्' },
  { code: 'sd', name: 'سنڌي' },
  { code: 'si', name: 'සිංහල' },
  { code: 'sk', name: 'Slovenčina' },
  { code: 'sl', name: 'Slovenščina' },
  { code: 'sn', name: 'ChiShona' },
  { code: 'so', name: 'Soomaali' },
  { code: 'sq', name: 'Shqip' },
  { code: 'sr', name: 'Српски' },
  { code: 'su', name: 'Basa Sunda' },
  { code: 'sv', name: 'Svenska' },
  { code: 'sw', name: 'Kiswahili' },
  { code: 'ta', name: 'தமிழ்' },
  { code: 'te', name: 'తెలుగు' },
  { code: 'tg', name: 'Тоҷикӣ' },
  { code: 'th', name: 'ภาษาไทย' },
  { code: 'tk', name: 'Türkmen' },
  { code: 'tl', name: 'Tagalog' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'tt', name: 'Татарча' },
  { code: 'uk', name: 'Українська' },
  { code: 'ur', name: 'اردو' },
  { code: 'uz', name: "O'zbek" },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'yi', name: 'ייִדיש' },
  { code: 'yo', name: 'Yorùbá' },
  { code: 'zh', name: '中文' },
  { code: 'zu', name: 'IsiZulu' },
]
```

- [ ] **Step 4: Añadir los tests de `useLanguageSelector` que fallan**

Crear `tests/unit/composables/useLanguageSelector.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useLanguageSelector } from '../../../app/composables/useLanguageSelector'

beforeEach(() => {
  localStorage.clear()
})

describe('useLanguageSelector', () => {
  it('defaults to auto when nothing is stored', () => {
    const { language } = useLanguageSelector()
    expect(language.value).toBe('auto')
  })

  it('persists the chosen language to localStorage', () => {
    const { language, setLanguage } = useLanguageSelector()
    setLanguage('es')
    expect(language.value).toBe('es')
    expect(localStorage.getItem('local-recorder:language')).toBe('es')
  })

  it('reads a previously stored language on init', () => {
    localStorage.setItem('local-recorder:language', 'fr')
    const { language } = useLanguageSelector()
    expect(language.value).toBe('fr')
  })
})
```

- [ ] **Step 5: Crear `app/composables/useLanguageSelector.ts`**

```ts
import { ref, watch } from 'vue'

const STORAGE_KEY = 'local-recorder:language'
const DEFAULT_LANGUAGE = 'auto'

export function useLanguageSelector() {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  const language = ref<string>(stored ?? DEFAULT_LANGUAGE)

  watch(
    language,
    (value) => {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, value)
    },
    { flush: 'sync' },
  )

  function setLanguage(lang: string) {
    language.value = lang
  }

  return { language, setLanguage }
}
```

- [ ] **Step 6: Ejecutar ambos archivos de test y verificar que pasan**

Run: `pnpm vitest run tests/unit/utils/whisperLanguages.test.ts tests/unit/composables/useLanguageSelector.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 7: Suite completa + typecheck**

Run: `pnpm test && pnpm dlx nuxi typecheck`
Expected: PASS sin errores

- [ ] **Step 8: Commit**

```bash
git add app/utils/whisperLanguages.ts app/composables/useLanguageSelector.ts tests/unit/utils/whisperLanguages.test.ts tests/unit/composables/useLanguageSelector.test.ts
git commit -m "Añade lista de idiomas de Whisper y composable de selección de idioma"
```

---

### Task 2: Combobox `LanguagePicker.vue`

**Files:**
- Create: `app/components/settings/LanguagePicker.vue`
- Test: `tests/unit/components/LanguagePicker.test.ts`

**Interfaces:**
- Consumes: `WHISPER_LANGUAGES`, `WhisperLanguageEntry` de `../../utils/whisperLanguages` (Task 1).
- Produces:
  ```ts
  // props: { modelValue: string; disabled?: boolean }
  // emits: 'update:modelValue': [value: string]
  // data-testid: "language-picker-input", "language-picker-dropdown", "language-option-{code}"
  ```
  Usado por Task 4 (`index.vue`).

- [ ] **Step 1: Añadir los tests que fallan**

Crear `tests/unit/components/LanguagePicker.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LanguagePicker from '../../../app/components/settings/LanguagePicker.vue'

describe('LanguagePicker', () => {
  it('displays the name of the selected language in the input', () => {
    const wrapper = mount(LanguagePicker, { props: { modelValue: 'auto' } })
    const input = wrapper.get<HTMLInputElement>('[data-testid="language-picker-input"]')
    expect(input.element.value).toBe('Auto-detectar')
  })

  it('displays the correct name for a non-auto language', () => {
    const wrapper = mount(LanguagePicker, { props: { modelValue: 'es' } })
    const input = wrapper.get<HTMLInputElement>('[data-testid="language-picker-input"]')
    expect(input.element.value).toBe('Español')
  })

  it('opens dropdown on focus', async () => {
    const wrapper = mount(LanguagePicker, { props: { modelValue: 'auto' } })
    expect(wrapper.find('[data-testid="language-picker-dropdown"]').exists()).toBe(false)
    await wrapper.get('[data-testid="language-picker-input"]').trigger('focus')
    expect(wrapper.find('[data-testid="language-picker-dropdown"]').exists()).toBe(true)
  })

  it('filters the list when typing', async () => {
    const wrapper = mount(LanguagePicker, { props: { modelValue: 'auto' } })
    await wrapper.get('[data-testid="language-picker-input"]').trigger('focus')
    const input = wrapper.get('[data-testid="language-picker-input"]')
    await input.setValue('español')
    await input.trigger('input')
    const options = wrapper.findAll('[data-testid^="language-option-"]')
    expect(options.length).toBe(1)
    expect(options[0]?.element.getAttribute('data-testid')).toBe('language-option-es')
  })

  it('emits update:modelValue with the code when an option is clicked', async () => {
    const wrapper = mount(LanguagePicker, { props: { modelValue: 'auto' } })
    await wrapper.get('[data-testid="language-picker-input"]').trigger('focus')
    await wrapper.get('[data-testid="language-option-es"]').trigger('mousedown')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['es'])
  })

  it('closes the dropdown after selecting an option', async () => {
    const wrapper = mount(LanguagePicker, { props: { modelValue: 'auto' } })
    await wrapper.get('[data-testid="language-picker-input"]').trigger('focus')
    await wrapper.get('[data-testid="language-option-es"]').trigger('mousedown')
    expect(wrapper.find('[data-testid="language-picker-dropdown"]').exists()).toBe(false)
  })

  it('closes the dropdown on Escape without emitting', async () => {
    const wrapper = mount(LanguagePicker, { props: { modelValue: 'auto' } })
    await wrapper.get('[data-testid="language-picker-input"]').trigger('focus')
    expect(wrapper.find('[data-testid="language-picker-dropdown"]').exists()).toBe(true)
    await wrapper.get('[data-testid="language-picker-input"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-testid="language-picker-dropdown"]').exists()).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('is disabled when the disabled prop is true', () => {
    const wrapper = mount(LanguagePicker, { props: { modelValue: 'auto', disabled: true } })
    expect(wrapper.get<HTMLInputElement>('[data-testid="language-picker-input"]').element.disabled).toBe(true)
  })
})
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `pnpm vitest run tests/unit/components/LanguagePicker.test.ts`
Expected: FAIL — `Cannot find module '../../../app/components/settings/LanguagePicker.vue'`

- [ ] **Step 3: Crear `app/components/settings/LanguagePicker.vue`**

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
      class="border rounded px-2 py-1 text-sm w-48"
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
      class="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded border bg-white shadow text-sm"
    >
      <li
        v-for="entry in filtered"
        :key="entry.code"
        :data-testid="`language-option-${entry.code}`"
        class="cursor-pointer px-2 py-1 hover:bg-gray-100"
        @mousedown.prevent="select(entry)"
      >
        {{ entry.name }}
      </li>
    </ul>
  </div>
</template>
```

Nota clave: `@mousedown.prevent` en cada `<li>` evita que el blur del input se dispare antes de que se registre la selección. Esto es el patrón estándar para comboboxes sin dependencias externas.

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `pnpm vitest run tests/unit/components/LanguagePicker.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Suite completa + typecheck**

Run: `pnpm test && pnpm dlx nuxi typecheck`
Expected: PASS sin errores

- [ ] **Step 6: Commit**

```bash
git add app/components/settings/LanguagePicker.vue tests/unit/components/LanguagePicker.test.ts
git commit -m "Añade LanguagePicker: combobox con búsqueda para seleccionar idioma"
```

---

### Task 3: Propagación de `language` al worker de Whisper

**Files:**
- Modify: `app/workers/whisper.types.ts`
- Modify: `app/workers/whisper.worker.ts`
- Modify: `app/composables/useTranscription.ts`
- Modify: `tests/unit/composables/useTranscription.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores (plumbing puro).
- Produces:
  ```ts
  // useTranscription.ts — firmas actualizadas
  function transcribe(audio: Float32Array, modelSize: WhisperModelSize, language?: string): void
  function retry(audio: Float32Array, modelSize: WhisperModelSize, language?: string): void
  // language por defecto = 'auto'; callers existentes sin language siguen compilando
  ```
  Usado por Task 4 (`index.vue`).

- [ ] **Step 1: Actualizar `whisper.types.ts` — añadir `language`**

En `app/workers/whisper.types.ts`, cambiar `WhisperTranscribeRequest`:

```ts
export interface WhisperTranscribeRequest {
  type: 'transcribe'
  audio: Float32Array
  modelSize: WhisperModelSize
  language: string
}
```

- [ ] **Step 2: Actualizar `whisper.worker.ts` — leer y propagar `language`**

Cambiar `self.onmessage` para extraer `language` y pasarlo al pipeline cuando no sea `'auto'`:

```ts
self.onmessage = async (event: MessageEvent<WhisperWorkerRequest>) => {
  const { audio, modelSize, language } = event.data
  try {
    const asr = await getTranscriber(modelSize)
    post({ type: 'progress', status: 'transcribing' })
    const output = await asr(audio, {
      return_timestamps: true,
      chunk_length_s: CHUNK_LENGTH_S,
      stride_length_s: STRIDE_LENGTH_S,
      ...(language !== 'auto' ? { language } : {}),
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

- [ ] **Step 3: Actualizar `useTranscription.ts` — añadir `language` con default**

```ts
function transcribe(audio: Float32Array, modelSize: WhisperModelSize, language = 'auto') {
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
```

- [ ] **Step 4: Actualizar `tests/unit/composables/useTranscription.test.ts`**

Los tests que comprueban el mensaje exacto de `postMessage` necesitan incluir `language`. Hay dos tests afectados:

**Test "moves to loading-model and posts a transcribe message"** — cambiar la aserción:
```ts
expect(worker.postMessage).toHaveBeenCalledWith(
  { type: 'transcribe', audio: expect.any(Float32Array), modelSize: 'small', language: 'auto' },
  expect.any(Array),
)
```

**Test "clones the audio buffer before posting so the original stays usable"** — el mensaje tiene `language`, pero este test solo comprueba `message.audio`, no el mensaje completo. Sin cambios necesarios en la aserción (sigue funcionando).

Además, añadir un nuevo test al final del `describe`:

```ts
it('passes the specified language to the worker', () => {
  const worker = createFakeWorker()
  const { transcribe } = useTranscription(() => worker)
  transcribe(new Float32Array([0.1]), 'small', 'es')
  expect(worker.postMessage).toHaveBeenCalledWith(
    { type: 'transcribe', audio: expect.any(Float32Array), modelSize: 'small', language: 'es' },
    expect.any(Array),
  )
})
```

- [ ] **Step 5: Ejecutar la suite y verificar que pasa**

Run: `pnpm test && pnpm dlx nuxi typecheck`
Expected: PASS (12 tests en `useTranscription.test.ts` incluyendo el nuevo)

- [ ] **Step 6: Commit**

```bash
git add app/workers/whisper.types.ts app/workers/whisper.worker.ts app/composables/useTranscription.ts tests/unit/composables/useTranscription.test.ts
git commit -m "Propaga parámetro language al worker de Whisper"
```

---

### Task 4: Wiring en `index.vue`

**Files:**
- Modify: `app/pages/index.vue`

**Interfaces:**
- Consumes:
  - `useLanguageSelector` de `../composables/useLanguageSelector` (Task 1)
  - `LanguagePicker` de `../components/settings/LanguagePicker.vue` (Task 2)
  - `transcribe(audio, modelSize, language)` y `retry(audio, modelSize, language)` de `useTranscription` (Task 3)
- Produce: nada para otras tareas — es el wiring final.

- [ ] **Step 1: Añadir imports en `index.vue`**

En el bloque `<script setup>`, añadir junto a los otros imports:

```ts
import LanguagePicker from '../components/settings/LanguagePicker.vue'
import { useLanguageSelector } from '../composables/useLanguageSelector'
```

- [ ] **Step 2: Desestructurar el composable**

Añadir junto a los otros `useXxx()` calls en el script:

```ts
const { language, setLanguage } = useLanguageSelector()
```

- [ ] **Step 3: Añadir `language.value` a todas las llamadas a `transcribe` y `retry`**

En `handleRecordStop` (actualmente `transcribe(pcm, modelSize.value)`):
```ts
transcribe(pcm, modelSize.value, language.value)
```

En `handleFileSelected` (actualmente `transcribe(pcm, modelSize.value)`):
```ts
transcribe(pcm, modelSize.value, language.value)
```

En `handleRetry` (actualmente `retry(lastAudio.value, modelSize.value)`):
```ts
if (lastAudio.value) retry(lastAudio.value, modelSize.value, language.value)
```

- [ ] **Step 4: Añadir `<LanguagePicker>` en el template**

Cambiar la sección del selector de modelo (actualmente una `<div class="flex items-center gap-2">`) para incluir el picker de idioma en la misma fila:

```html
<div class="flex items-center gap-2 flex-wrap">
  <span class="text-sm text-gray-600">Modelo:</span>
  <ModelSizePicker
    :model-value="modelSize"
    :disabled="transcriptionState === 'loading-model' || transcriptionState === 'transcribing'"
    @update:model-value="setModelSize"
  />
  <span class="text-sm text-gray-600">Idioma:</span>
  <LanguagePicker
    :model-value="language"
    :disabled="transcriptionState === 'loading-model' || transcriptionState === 'transcribing'"
    @update:model-value="setLanguage"
  />
</div>
```

- [ ] **Step 5: Suite completa + typecheck**

Run: `pnpm test && pnpm dlx nuxi typecheck`
Expected: PASS sin regresiones

Si algún test de `index.test.ts` falla porque el mock del worker ahora espera `language` en el mensaje, añadir `language: 'auto'` a la aserción del mensaje en ese test.

- [ ] **Step 6: Verificación manual**

Run: `pnpm dev`

1. El picker de idioma aparece junto al de modelo, mostrando "Auto-detectar".
2. Escribir "esp" → la lista filtra a "Español".
3. Seleccionar "Español" → el input muestra "Español" y la preferencia se guarda (recargar la página lo recuerda).
4. Cargar un audio en español → la transcripción sale en español.
5. Cambiar a "Auto-detectar" → Whisper detecta automáticamente.

- [ ] **Step 7: Commit**

```bash
git add app/pages/index.vue
git commit -m "Conecta selector de idioma en la UI de transcripción"
```
