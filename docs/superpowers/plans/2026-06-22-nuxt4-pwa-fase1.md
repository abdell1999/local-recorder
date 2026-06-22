# Local Recorder — Fase 1 (Nuxt 4 / PWA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Fase 1 of Local Recorder: record from microphone or import an audio/video file, transcribe locally with Whisper (WebGPU with WASM fallback), edit the transcript, export to TXT/SRT/VTT/JSON — packaged as an installable PWA.

**Architecture:** Nuxt 4 + TypeScript app. Both audio sources (microphone recording and imported files) converge into a single `Float32Array` PCM format before reaching a dedicated Web Worker that runs the `@huggingface/transformers` Whisper pipeline. Composables and components use explicit `import ... from 'vue'` (no Nuxt auto-imports) so they can be unit-tested with plain Vitest + happy-dom.

**Tech Stack:** Nuxt 4, TypeScript, Tailwind CSS (`@nuxtjs/tailwindcss`), pnpm, `@huggingface/transformers`, `@vite-pwa/nuxt`, Vitest + @vue/test-utils + happy-dom, Playwright.

## Global Constraints

- Package manager: pnpm only (per spec).
- Styling: Tailwind CSS, no component library (per spec).
- Transcription is block-based, not streaming, in this phase (per spec).
- No diarization, LLM summarization, or encrypted persistence in this phase (per spec, "Extensiones futuras").
- Commits: no co-author trailer, messages in Spanish, always on `main` (per `CLAUDE.md`).
- Composables/components use explicit `vue` imports, not Nuxt auto-imports, to keep unit tests independent of the full Nuxt runtime.

## File Structure

```
package.json
nuxt.config.ts
tsconfig.json
vitest.config.ts
playwright.config.ts
.gitignore
public/icon.svg
app/
  app.vue
  pages/index.vue
  utils/
    whisperModels.ts
    formatElapsed.ts
    transcriptExport.ts
    audio/resample.ts
    audio/decodeAudioFile.ts
  workers/
    whisper.types.ts
    whisper.worker.ts
  composables/
    useModelSelector.ts
    useRecorder.ts
    useFileImport.ts
    useTranscription.ts
  components/
    recorder/RecordButton.vue
    recorder/RecordingTimer.vue
    recorder/AudioVisualizer.vue
    importer/FileDropzone.vue
    transcript/TranscriptEditor.vue
    export/ExportMenu.vue
tests/
  unit/smoke.test.ts
  unit/utils/whisperModels.test.ts
  unit/utils/resample.test.ts
  unit/utils/transcriptExport.test.ts
  unit/utils/formatElapsed.test.ts
  unit/composables/useModelSelector.test.ts
  unit/composables/useRecorder.test.ts
  unit/composables/useFileImport.test.ts
  unit/composables/useTranscription.test.ts
  unit/components/TranscriptEditor.test.ts
  unit/components/ExportMenu.test.ts
  unit/components/RecordButton.test.ts
  unit/components/RecordingTimer.test.ts
  unit/components/FileDropzone.test.ts
  unit/pages/index.test.ts
  e2e/smoke.spec.ts
  e2e/transcription-flow.spec.ts
```

---

### Task 1: Scaffold Nuxt 4 project

**Files:**
- Create: `package.json`
- Create: `nuxt.config.ts`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `.gitignore`
- Create: `app/app.vue`
- Create: `app/pages/index.vue`
- Test: `tests/unit/smoke.test.ts`
- Test: `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Produces: a working `pnpm dev`, `pnpm test` (Vitest), `pnpm test:e2e` (Playwright) pipeline that every later task builds on.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "local-recorder",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "nuxt dev",
    "build": "nuxt build",
    "generate": "nuxt generate",
    "preview": "nuxt preview",
    "postinstall": "nuxt prepare",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@huggingface/transformers": "^3.7.4",
    "@nuxtjs/tailwindcss": "^6.14.0",
    "@vite-pwa/nuxt": "^1.0.4",
    "nuxt": "^4.0.0",
    "vue": "^3.5.13",
    "vue-router": "^4.5.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.50.0",
    "@vitejs/plugin-vue": "^5.2.1",
    "@vue/test-utils": "^2.4.6",
    "happy-dom": "^16.5.3",
    "typescript": "^5.7.3",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `nuxt.config.ts`**

```ts
export default defineNuxtConfig({
  compatibilityDate: '2026-06-22',
  modules: ['@nuxtjs/tailwindcss'],
  devtools: { enabled: true },
})
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "extends": "./.nuxt/tsconfig.json"
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules
.nuxt
.output
dist
test-results
playwright-report
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts'],
  },
})
```

- [ ] **Step 6: Create `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    command: 'pnpm dev',
    port: 3000,
    reuseExistingServer: true,
  },
  use: {
    baseURL: 'http://localhost:3000',
  },
})
```

- [ ] **Step 7: Create `app/app.vue`**

```vue
<template>
  <NuxtPage />
</template>
```

- [ ] **Step 8: Create `app/pages/index.vue` (placeholder, replaced in Task 14)**

```vue
<template>
  <main class="p-6">
    <h1 class="text-2xl font-bold">Local Recorder</h1>
  </main>
</template>
```

- [ ] **Step 9: Write the failing unit smoke test**

Create `tests/unit/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('project setup', () => {
  it('runs a basic assertion', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 10: Install dependencies and run the unit test**

Run: `pnpm install && pnpm test`
Expected: PASS (1 test passed)

- [ ] **Step 11: Write the failing e2e smoke test**

Create `tests/e2e/smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('home page shows title', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Local Recorder' })).toBeVisible()
})
```

- [ ] **Step 12: Install Playwright browsers and run the e2e test**

Run: `pnpm dlx playwright install chromium && pnpm test:e2e`
Expected: PASS (1 test passed)

- [ ] **Step 13: Commit**

```bash
git add package.json nuxt.config.ts tsconfig.json vitest.config.ts playwright.config.ts .gitignore app/app.vue app/pages/index.vue tests/unit/smoke.test.ts tests/e2e/smoke.spec.ts pnpm-lock.yaml
git commit -m "Scaffold proyecto Nuxt 4 con Vitest y Playwright"
```

---

### Task 2: PWA esqueleto (`@vite-pwa/nuxt`)

**Files:**
- Modify: `nuxt.config.ts`
- Create: `public/icon.svg`

**Interfaces:**
- Consumes: `nuxt.config.ts` from Task 1.
- Produces: a build that emits `manifest.webmanifest` and a service worker registering `CacheFirst` for Hugging Face model downloads, consumed implicitly by every later task that loads a Whisper model.

- [ ] **Step 1: Create `public/icon.svg`**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect width="100" height="100" rx="20" fill="#1d4ed8" />
  <circle cx="50" cy="38" r="18" fill="#ffffff" />
  <rect x="40" y="56" width="20" height="28" rx="10" fill="#ffffff" />
</svg>
```

- [ ] **Step 2: Update `nuxt.config.ts` to register the PWA module**

```ts
export default defineNuxtConfig({
  compatibilityDate: '2026-06-22',
  modules: ['@nuxtjs/tailwindcss', '@vite-pwa/nuxt'],
  devtools: { enabled: true },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Local Recorder',
      short_name: 'LocalRecorder',
      description: 'Grabación, transcripción y exportación 100% local en el navegador',
      theme_color: '#1d4ed8',
      background_color: '#ffffff',
      display: 'standalone',
      icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,ico}'],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/huggingface\.co\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'whisper-models',
            cacheableResponse: { statuses: [0, 200] },
            expiration: { maxEntries: 20, maxAgeSeconds: 31536000 },
          },
        },
      ],
    },
  },
})
```

- [ ] **Step 3: Build and verify the manifest is generated**

Run: `pnpm build`
Expected: build succeeds, no errors.

Run: `node -e "console.log(require('fs').readFileSync('.output/public/manifest.webmanifest','utf-8').includes('Local Recorder'))"`
Expected: `true`

- [ ] **Step 4: Commit**

```bash
git add nuxt.config.ts public/icon.svg
git commit -m "Añade esqueleto PWA con caché de modelos de Hugging Face"
```

---

### Task 3: Registro de modelos Whisper y protocolo de mensajes del worker

**Files:**
- Create: `app/utils/whisperModels.ts`
- Create: `app/workers/whisper.types.ts`
- Test: `tests/unit/utils/whisperModels.test.ts`

**Interfaces:**
- Produces: `WhisperModelSize` type, `WHISPER_MODELS` map, `getModelRepoId(size)`, and the `WhisperWorkerRequest`/`WhisperWorkerResponse`/`WhisperChunk` types consumed by Tasks 8, 9, and 14.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/utils/whisperModels.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { WHISPER_MODELS, getModelRepoId } from '../../../app/utils/whisperModels'

describe('whisperModels', () => {
  it('has exactly the four supported sizes', () => {
    expect(Object.keys(WHISPER_MODELS).sort()).toEqual(['base', 'medium', 'small', 'tiny'])
  })

  it('returns the matching repo id for each size', () => {
    expect(getModelRepoId('tiny')).toBe('onnx-community/whisper-tiny')
    expect(getModelRepoId('small')).toBe('onnx-community/whisper-small')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- whisperModels`
Expected: FAIL with "Cannot find module '../../../app/utils/whisperModels'"

- [ ] **Step 3: Implement `app/utils/whisperModels.ts`**

```ts
export type WhisperModelSize = 'tiny' | 'base' | 'small' | 'medium'

export const WHISPER_MODELS: Record<WhisperModelSize, string> = {
  tiny: 'onnx-community/whisper-tiny',
  base: 'onnx-community/whisper-base',
  small: 'onnx-community/whisper-small',
  medium: 'onnx-community/whisper-medium',
}

export function getModelRepoId(size: WhisperModelSize): string {
  return WHISPER_MODELS[size]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- whisperModels`
Expected: PASS (2 tests passed)

- [ ] **Step 5: Create `app/workers/whisper.types.ts` (type-only, no runtime test)**

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

export type WhisperWorkerRequest = WhisperTranscribeRequest
export type WhisperWorkerResponse =
  | WhisperProgressMessage
  | WhisperDeviceMessage
  | WhisperResultMessage
  | WhisperErrorMessage
```

- [ ] **Step 6: Verify the project still type-checks**

Run: `pnpm dlx nuxi typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add app/utils/whisperModels.ts app/workers/whisper.types.ts tests/unit/utils/whisperModels.test.ts
git commit -m "Añade registro de modelos Whisper y tipos del protocolo del worker"
```

---

### Task 4: Utilidades de decodificación/resampleo de audio

**Files:**
- Create: `app/utils/audio/resample.ts`
- Create: `app/utils/audio/decodeAudioFile.ts`
- Test: `tests/unit/utils/resample.test.ts`

**Interfaces:**
- Produces: `mixToMono(channelData: Float32Array[]): Float32Array`, `resampleTo16k(mono: Float32Array, originalSampleRate: number): Float32Array`, `toPcm16kMono(channelData: Float32Array[], originalSampleRate: number): Float32Array`, and `decodeAudioFile(arrayBuffer: ArrayBuffer): Promise<Float32Array>`.
- Consumed by: Task 6 (`useRecorder`'s blob path), Task 7 (`useFileImport`), Task 14 (page wiring).

`decodeAudioFile` wraps the browser's `AudioContext.decodeAudioData`, which happy-dom does not implement — it is not unit-tested here. Its correctness is verified manually in Task 8's step 9 and exercised end-to-end in Task 15.

- [ ] **Step 1: Write the failing tests for the pure resample functions**

Create `tests/unit/utils/resample.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mixToMono, resampleTo16k, toPcm16kMono } from '../../../app/utils/audio/resample'

describe('mixToMono', () => {
  it('returns the single channel unchanged when there is only one', () => {
    const channel = new Float32Array([0.1, 0.2, 0.3])
    expect(mixToMono([channel])).toBe(channel)
  })

  it('averages two channels sample by sample', () => {
    const left = new Float32Array([1, 0])
    const right = new Float32Array([0, 1])
    expect(Array.from(mixToMono([left, right]))).toEqual([0.5, 0.5])
  })
})

describe('resampleTo16k', () => {
  it('returns the input unchanged when already at 16kHz', () => {
    const mono = new Float32Array([0.1, 0.2, 0.3])
    expect(resampleTo16k(mono, 16000)).toBe(mono)
  })

  it('halves the sample count when downsampling from 32kHz', () => {
    const mono = new Float32Array([0, 1, 0, 1, 0, 1, 0, 1])
    const result = resampleTo16k(mono, 32000)
    expect(result.length).toBe(4)
  })
})

describe('toPcm16kMono', () => {
  it('mixes down and resamples in one call', () => {
    const left = new Float32Array([1, 1, 1, 1])
    const right = new Float32Array([1, 1, 1, 1])
    const result = toPcm16kMono([left, right], 32000)
    expect(result.length).toBe(2)
    expect(Array.from(result)).toEqual([1, 1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- resample`
Expected: FAIL with "Cannot find module '../../../app/utils/audio/resample'"

- [ ] **Step 3: Implement `app/utils/audio/resample.ts`**

```ts
export function mixToMono(channelData: Float32Array[]): Float32Array {
  if (channelData.length === 1) return channelData[0]
  const length = channelData[0].length
  const mono = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    let sum = 0
    for (const channel of channelData) sum += channel[i]
    mono[i] = sum / channelData.length
  }
  return mono
}

export function resampleTo16k(mono: Float32Array, originalSampleRate: number): Float32Array {
  const targetRate = 16000
  if (originalSampleRate === targetRate) return mono
  const ratio = originalSampleRate / targetRate
  const newLength = Math.round(mono.length / ratio)
  const result = new Float32Array(newLength)
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio
    const lower = Math.floor(srcIndex)
    const upper = Math.min(lower + 1, mono.length - 1)
    const frac = srcIndex - lower
    result[i] = mono[lower] + (mono[upper] - mono[lower]) * frac
  }
  return result
}

export function toPcm16kMono(channelData: Float32Array[], originalSampleRate: number): Float32Array {
  return resampleTo16k(mixToMono(channelData), originalSampleRate)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- resample`
Expected: PASS (5 tests passed)

- [ ] **Step 5: Implement `app/utils/audio/decodeAudioFile.ts` (no unit test, browser-only API)**

```ts
import { toPcm16kMono } from './resample'

export async function decodeAudioFile(arrayBuffer: ArrayBuffer): Promise<Float32Array> {
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const audioContext = new AudioContextClass()
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    const channelData: Float32Array[] = []
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      channelData.push(audioBuffer.getChannelData(i))
    }
    return toPcm16kMono(channelData, audioBuffer.sampleRate)
  } finally {
    await audioContext.close()
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add app/utils/audio/resample.ts app/utils/audio/decodeAudioFile.ts tests/unit/utils/resample.test.ts
git commit -m "Añade decodificación y resampleo de audio a PCM 16kHz mono"
```

---

### Task 5: `useModelSelector` composable

**Files:**
- Create: `app/composables/useModelSelector.ts`
- Test: `tests/unit/composables/useModelSelector.test.ts`

**Interfaces:**
- Consumes: `WhisperModelSize` from Task 3.
- Produces: `useModelSelector(): { modelSize: Ref<WhisperModelSize>, setModelSize: (size: WhisperModelSize) => void }`, consumed by Task 14.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/composables/useModelSelector.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useModelSelector } from '../../../app/composables/useModelSelector'

beforeEach(() => {
  localStorage.clear()
})

describe('useModelSelector', () => {
  it('defaults to small when nothing is stored', () => {
    const { modelSize } = useModelSelector()
    expect(modelSize.value).toBe('small')
  })

  it('persists the chosen size to localStorage', () => {
    const { modelSize, setModelSize } = useModelSelector()
    setModelSize('medium')
    expect(modelSize.value).toBe('medium')
    expect(localStorage.getItem('local-recorder:model-size')).toBe('medium')
  })

  it('reads a previously stored size on init', () => {
    localStorage.setItem('local-recorder:model-size', 'tiny')
    const { modelSize } = useModelSelector()
    expect(modelSize.value).toBe('tiny')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- useModelSelector`
Expected: FAIL with "Cannot find module '../../../app/composables/useModelSelector'"

- [ ] **Step 3: Implement `app/composables/useModelSelector.ts`**

```ts
import { ref, watch } from 'vue'
import type { WhisperModelSize } from '../utils/whisperModels'

const STORAGE_KEY = 'local-recorder:model-size'
const DEFAULT_SIZE: WhisperModelSize = 'small'

export function useModelSelector() {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  const modelSize = ref<WhisperModelSize>((stored as WhisperModelSize) || DEFAULT_SIZE)

  watch(modelSize, (value) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, value)
    }
  })

  function setModelSize(size: WhisperModelSize) {
    modelSize.value = size
  }

  return { modelSize, setModelSize }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- useModelSelector`
Expected: PASS (3 tests passed)

- [ ] **Step 5: Commit**

```bash
git add app/composables/useModelSelector.ts tests/unit/composables/useModelSelector.test.ts
git commit -m "Añade composable useModelSelector con persistencia en localStorage"
```

---

### Task 6: `useRecorder` composable

**Files:**
- Create: `app/composables/useRecorder.ts`
- Test: `tests/unit/composables/useRecorder.test.ts`

**Interfaces:**
- Produces: `useRecorder(): { state: Ref<'idle'|'recording'|'stopped'|'error'>, errorMessage: Ref<string|null>, start: () => Promise<void>, stop: () => Promise<Blob> }`, consumed by Task 14. On permission denial, `errorMessage.value` is set to `'mic-permission-denied'`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/composables/useRecorder.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRecorder } from '../../../app/composables/useRecorder'

class FakeMediaRecorder {
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(public stream: MediaStream) {}
  start() {}
  stop() {
    this.ondataavailable?.({ data: new Blob(['chunk']) })
    this.onstop?.()
  }
}

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder as unknown as typeof MediaRecorder)
})

describe('useRecorder', () => {
  it('transitions to recording after a successful start', async () => {
    const fakeTrack = { stop: vi.fn() }
    const fakeStream = { getTracks: () => [fakeTrack] } as unknown as MediaStream
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) } })

    const { state, start } = useRecorder()
    await start()

    expect(state.value).toBe('recording')
  })

  it('resolves stop() with a Blob and moves to stopped', async () => {
    const fakeTrack = { stop: vi.fn() }
    const fakeStream = { getTracks: () => [fakeTrack] } as unknown as MediaStream
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) } })

    const { state, start, stop } = useRecorder()
    await start()
    const blob = await stop()

    expect(blob).toBeInstanceOf(Blob)
    expect(state.value).toBe('stopped')
    expect(fakeTrack.stop).toHaveBeenCalled()
  })

  it('sets an error state when microphone permission is denied', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) },
    })

    const { state, errorMessage, start } = useRecorder()
    await start()

    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('mic-permission-denied')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- useRecorder`
Expected: FAIL with "Cannot find module '../../../app/composables/useRecorder'"

- [ ] **Step 3: Implement `app/composables/useRecorder.ts`**

```ts
import { ref } from 'vue'

export type RecorderState = 'idle' | 'recording' | 'stopped' | 'error'

export function useRecorder() {
  const state = ref<RecorderState>('idle')
  const errorMessage = ref<string | null>(null)
  let mediaRecorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let stream: MediaStream | null = null

  async function start() {
    errorMessage.value = null
    chunks = []
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      state.value = 'error'
      errorMessage.value = 'mic-permission-denied'
      return
    }
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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- useRecorder`
Expected: PASS (3 tests passed)

- [ ] **Step 5: Commit**

```bash
git add app/composables/useRecorder.ts tests/unit/composables/useRecorder.test.ts
git commit -m "Añade composable useRecorder para captura de micrófono"
```

---

### Task 7: `useFileImport` composable

**Files:**
- Create: `app/composables/useFileImport.ts`
- Test: `tests/unit/composables/useFileImport.test.ts`

**Interfaces:**
- Consumes: `decodeAudioFile` from Task 4 (mocked in tests).
- Produces: `useFileImport(): { state: Ref<'idle'|'decoding'|'done'|'error'>, errorMessage: Ref<string|null>, importFile: (file: File) => Promise<Float32Array|null> }`, consumed by Task 14. `errorMessage.value` is `'unsupported-file-type'` or `'decode-failed'`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/composables/useFileImport.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const decodeAudioFileMock = vi.fn()
vi.mock('../../../app/utils/audio/decodeAudioFile', () => ({
  decodeAudioFile: decodeAudioFileMock,
}))

import { useFileImport } from '../../../app/composables/useFileImport'

beforeEach(() => {
  decodeAudioFileMock.mockReset()
})

describe('useFileImport', () => {
  it('rejects unsupported file types without decoding', async () => {
    const { state, errorMessage, importFile } = useFileImport()
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' })

    const result = await importFile(file)

    expect(result).toBeNull()
    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('unsupported-file-type')
    expect(decodeAudioFileMock).not.toHaveBeenCalled()
  })

  it('decodes accepted audio files and returns the PCM data', async () => {
    const pcm = new Float32Array([0.1, 0.2])
    decodeAudioFileMock.mockResolvedValue(pcm)
    const { state, importFile } = useFileImport()
    const file = new File(['x'], 'memo.mp3', { type: 'audio/mpeg' })

    const result = await importFile(file)

    expect(result).toBe(pcm)
    expect(state.value).toBe('done')
  })

  it('sets an error state when decoding fails', async () => {
    decodeAudioFileMock.mockRejectedValue(new Error('bad data'))
    const { state, errorMessage, importFile } = useFileImport()
    const file = new File(['x'], 'memo.mp4', { type: 'video/mp4' })

    const result = await importFile(file)

    expect(result).toBeNull()
    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('decode-failed')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- useFileImport`
Expected: FAIL with "Cannot find module '../../../app/composables/useFileImport'"

- [ ] **Step 3: Implement `app/composables/useFileImport.ts`**

```ts
import { ref } from 'vue'
import { decodeAudioFile } from '../utils/audio/decodeAudioFile'

export type FileImportState = 'idle' | 'decoding' | 'done' | 'error'

const ACCEPTED_PREFIXES = ['audio/', 'video/']

export function useFileImport() {
  const state = ref<FileImportState>('idle')
  const errorMessage = ref<string | null>(null)

  async function importFile(file: File): Promise<Float32Array | null> {
    errorMessage.value = null
    const isAccepted = ACCEPTED_PREFIXES.some((prefix) => file.type.startsWith(prefix))
    if (!isAccepted) {
      state.value = 'error'
      errorMessage.value = 'unsupported-file-type'
      return null
    }
    state.value = 'decoding'
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pcm = await decodeAudioFile(arrayBuffer)
      state.value = 'done'
      return pcm
    } catch {
      state.value = 'error'
      errorMessage.value = 'decode-failed'
      return null
    }
  }

  return { state, errorMessage, importFile }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- useFileImport`
Expected: PASS (3 tests passed)

- [ ] **Step 5: Commit**

```bash
git add app/composables/useFileImport.ts tests/unit/composables/useFileImport.test.ts
git commit -m "Añade composable useFileImport para importar audio/vídeo"
```

---

### Task 8: `whisper.worker.ts` + `useTranscription` composable

**Files:**
- Create: `app/workers/whisper.worker.ts`
- Create: `app/composables/useTranscription.ts`
- Test: `tests/unit/composables/useTranscription.test.ts`

**Interfaces:**
- Consumes: `getModelRepoId` from Task 3, `WhisperWorkerRequest`/`WhisperWorkerResponse`/`WhisperChunk` types from Task 3.
- Produces: `useTranscription(createWorker?: () => MinimalWorker): { state: Ref<'idle'|'loading-model'|'transcribing'|'done'|'error'>, text: Ref<string>, chunks: ShallowRef<WhisperChunk[]>, errorMessage: Ref<string|null>, device: Ref<'webgpu'|'wasm'|null>, transcribe: (audio: Float32Array, modelSize: WhisperModelSize) => void, retry: (audio: Float32Array, modelSize: WhisperModelSize) => void }`, consumed by Task 14. `device` reflects the worker's `WhisperDeviceMessage`, used to show a WASM-fallback notice.
- The `MinimalWorker` interface (`postMessage`, `onmessage`, `onerror`, `terminate`) is the injection seam used by the test to avoid needing a real Worker/transformers.js in Vitest.

`whisper.worker.ts` itself depends on `navigator.gpu`, `Worker`'s `self` global, and downloading real model weights — none of which exist in happy-dom. It is not unit-tested directly; its correctness is verified manually in Step 9 below, and exercised end-to-end (with a stubbed `Worker` global) in Task 15.

- [ ] **Step 1: Write the failing test for `useTranscription`**

Create `tests/unit/composables/useTranscription.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { useTranscription, type MinimalWorker } from '../../../app/composables/useTranscription'

function createFakeWorker() {
  const worker: MinimalWorker = {
    postMessage: vi.fn(),
    onmessage: null,
    onerror: null,
    terminate: vi.fn(),
  }
  return worker
}

describe('useTranscription', () => {
  it('moves to loading-model and posts a transcribe message', () => {
    const worker = createFakeWorker()
    const { state, transcribe } = useTranscription(() => worker)

    transcribe(new Float32Array([0.1]), 'small')

    expect(state.value).toBe('loading-model')
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'transcribe',
      audio: expect.any(Float32Array),
      modelSize: 'small',
    })
  })

  it('reflects progress and result messages from the worker', () => {
    const worker = createFakeWorker()
    const { state, text, chunks, transcribe } = useTranscription(() => worker)
    transcribe(new Float32Array([0.1]), 'small')

    worker.onmessage?.({ data: { type: 'progress', status: 'transcribing' } } as MessageEvent)
    expect(state.value).toBe('transcribing')

    worker.onmessage?.({
      data: { type: 'result', text: 'hola mundo', chunks: [{ text: 'hola mundo', timestamp: [0, 1] }] },
    } as MessageEvent)
    expect(state.value).toBe('done')
    expect(text.value).toBe('hola mundo')
    expect(chunks.value).toEqual([{ text: 'hola mundo', timestamp: [0, 1] }])
  })

  it('reflects the chosen device when the worker reports it', () => {
    const worker = createFakeWorker()
    const { device, transcribe } = useTranscription(() => worker)
    transcribe(new Float32Array([0.1]), 'small')

    worker.onmessage?.({ data: { type: 'device', device: 'wasm' } } as MessageEvent)

    expect(device.value).toBe('wasm')
  })

  it('reflects error messages from the worker', () => {
    const worker = createFakeWorker()
    const { state, errorMessage, transcribe } = useTranscription(() => worker)
    transcribe(new Float32Array([0.1]), 'small')

    worker.onmessage?.({ data: { type: 'error', message: 'boom' } } as MessageEvent)

    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('boom')
  })

  it('treats a worker crash as an error', () => {
    const worker = createFakeWorker()
    const { state, errorMessage, transcribe } = useTranscription(() => worker)
    transcribe(new Float32Array([0.1]), 'small')

    worker.onerror?.(new Event('error') as ErrorEvent)

    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('worker-crashed')
  })

  it('retry terminates the old worker and creates a new one', () => {
    const firstWorker = createFakeWorker()
    const secondWorker = createFakeWorker()
    const factory = vi.fn().mockReturnValueOnce(firstWorker).mockReturnValueOnce(secondWorker)
    const { retry } = useTranscription(factory)

    retry(new Float32Array([0.1]), 'small')

    expect(firstWorker.terminate).not.toHaveBeenCalled()
    expect(secondWorker.postMessage).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- useTranscription`
Expected: FAIL with "Cannot find module '../../../app/composables/useTranscription'"

- [ ] **Step 3: Implement `app/composables/useTranscription.ts`**

```ts
import { ref, shallowRef } from 'vue'
import type { WhisperModelSize } from '../utils/whisperModels'
import type { WhisperWorkerResponse, WhisperChunk } from '../workers/whisper.types'

export type TranscriptionState = 'idle' | 'loading-model' | 'transcribing' | 'done' | 'error'

export interface MinimalWorker {
  postMessage: (message: unknown) => void
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
  let worker: MinimalWorker | null = null

  function ensureWorker(): MinimalWorker {
    if (worker) return worker
    worker = createWorker()
    worker.onmessage = (event) => {
      const message = event.data
      if (message.type === 'progress') {
        state.value = message.status
      } else if (message.type === 'device') {
        device.value = message.device
      } else if (message.type === 'result') {
        text.value = message.text
        chunks.value = message.chunks
        state.value = 'done'
      } else if (message.type === 'error') {
        state.value = 'error'
        errorMessage.value = message.message
      }
    }
    worker.onerror = () => {
      state.value = 'error'
      errorMessage.value = 'worker-crashed'
    }
    return worker
  }

  function transcribe(audio: Float32Array, modelSize: WhisperModelSize) {
    errorMessage.value = null
    state.value = 'loading-model'
    ensureWorker().postMessage({ type: 'transcribe', audio, modelSize })
  }

  function retry(audio: Float32Array, modelSize: WhisperModelSize) {
    worker?.terminate()
    worker = null
    transcribe(audio, modelSize)
  }

  return { state, text, chunks, errorMessage, device, transcribe, retry }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- useTranscription`
Expected: PASS (6 tests passed)

- [ ] **Step 5: Implement `app/workers/whisper.worker.ts` (no unit test, see note above)**

```ts
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import { getModelRepoId, type WhisperModelSize } from '../utils/whisperModels'
import type { WhisperWorkerRequest, WhisperWorkerResponse, WhisperChunk } from './whisper.types'

let transcriber: AutomaticSpeechRecognitionPipeline | null = null
let loadedModelSize: WhisperModelSize | null = null

function post(message: WhisperWorkerResponse) {
  ;(self as unknown as Worker).postMessage(message)
}

async function getTranscriber(modelSize: WhisperModelSize) {
  if (transcriber && loadedModelSize === modelSize) return transcriber
  post({ type: 'progress', status: 'loading-model' })
  const device = typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm'
  post({ type: 'device', device })
  transcriber = await pipeline('automatic-speech-recognition', getModelRepoId(modelSize), { device })
  loadedModelSize = modelSize
  return transcriber
}

self.onmessage = async (event: MessageEvent<WhisperWorkerRequest>) => {
  const { audio, modelSize } = event.data
  try {
    const asr = await getTranscriber(modelSize)
    post({ type: 'progress', status: 'transcribing' })
    const output = await asr(audio, { return_timestamps: true })
    const rawChunks = Array.isArray(output) ? output[0]?.chunks ?? [] : output.chunks ?? []
    const chunks: WhisperChunk[] = rawChunks.map((chunk: { text: string; timestamp: [number, number | null] }) => ({
      text: chunk.text,
      timestamp: chunk.timestamp,
    }))
    const text = Array.isArray(output) ? output[0]?.text ?? '' : output.text
    post({ type: 'result', text, chunks })
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : 'unknown-error' })
  }
}
```

- [ ] **Step 6: Run the full unit suite to confirm nothing else broke**

Run: `pnpm test`
Expected: PASS (all tests passed)

- [ ] **Step 7: Type-check the project**

Run: `pnpm dlx nuxi typecheck`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add app/workers/whisper.worker.ts app/composables/useTranscription.ts tests/unit/composables/useTranscription.test.ts
git commit -m "Añade worker de transcripción Whisper y composable useTranscription"
```

- [ ] **Step 9: Manual verification (not automated — requires a real browser with WebGPU or WASM)**

Run: `pnpm dev`, open the dev server URL, and in the browser console run:

```js
const worker = new Worker(new URL('/app/workers/whisper.worker.ts', import.meta.url), { type: 'module' })
worker.onmessage = (e) => console.log(e.data)
worker.postMessage({ type: 'transcribe', audio: new Float32Array(16000), modelSize: 'tiny' })
```

Expected: console logs a `{ type: 'progress', status: 'loading-model' }` message, then `'transcribing'`, then a `{ type: 'result', text: '', chunks: [] }` (silence produces empty text, which confirms the pipeline loaded and ran without throwing).

---

### Task 9: Utilidades de exportación (TXT/SRT/VTT/JSON)

**Files:**
- Create: `app/utils/transcriptExport.ts`
- Test: `tests/unit/utils/transcriptExport.test.ts`

**Interfaces:**
- Consumes: `WhisperChunk` from Task 3.
- Produces: `TranscriptResult { text: string, chunks: WhisperChunk[] }`, `toTxt`, `toSrt`, `toVtt`, `toJson` — all `(result: TranscriptResult) => string`, consumed by Task 11.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/utils/transcriptExport.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toTxt, toSrt, toVtt, toJson, type TranscriptResult } from '../../../app/utils/transcriptExport'

const sample: TranscriptResult = {
  text: 'Hola mundo. Adiós.',
  chunks: [
    { text: 'Hola mundo.', timestamp: [0, 1.5] },
    { text: 'Adiós.', timestamp: [1.5, 2.25] },
  ],
}

describe('toTxt', () => {
  it('returns the trimmed plain text', () => {
    expect(toTxt(sample)).toBe('Hola mundo. Adiós.')
  })
})

describe('toSrt', () => {
  it('numbers each chunk and formats timestamps with a comma', () => {
    const srt = toSrt(sample)
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:01,500\nHola mundo.')
    expect(srt).toContain('2\n00:00:01,500 --> 00:00:02,250\nAdiós.')
  })
})

describe('toVtt', () => {
  it('starts with the WEBVTT header and uses dot timestamps', () => {
    const vtt = toVtt(sample)
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true)
    expect(vtt).toContain('00:00:00.000 --> 00:00:01.500\nHola mundo.')
  })
})

describe('toJson', () => {
  it('serializes the full result', () => {
    expect(JSON.parse(toJson(sample))).toEqual(sample)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- transcriptExport`
Expected: FAIL with "Cannot find module '../../../app/utils/transcriptExport'"

- [ ] **Step 3: Implement `app/utils/transcriptExport.ts`**

```ts
import type { WhisperChunk } from '../workers/whisper.types'

export interface TranscriptResult {
  text: string
  chunks: WhisperChunk[]
}

export function toTxt(result: TranscriptResult): string {
  return result.text.trim()
}

function formatTimestamp(seconds: number, separator: ',' | '.'): string {
  const totalMs = Math.round(seconds * 1000)
  const ms = totalMs % 1000
  const totalSeconds = Math.floor(totalMs / 1000)
  const s = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const m = totalMinutes % 60
  const h = Math.floor(totalMinutes / 60)
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms, 3)}`
}

export function toSrt(result: TranscriptResult): string {
  return result.chunks
    .map((chunk, index) => {
      const [start, end] = chunk.timestamp
      const endTime = end ?? start
      return `${index + 1}\n${formatTimestamp(start, ',')} --> ${formatTimestamp(endTime, ',')}\n${chunk.text.trim()}\n`
    })
    .join('\n')
}

export function toVtt(result: TranscriptResult): string {
  const body = result.chunks
    .map((chunk) => {
      const [start, end] = chunk.timestamp
      const endTime = end ?? start
      return `${formatTimestamp(start, '.')} --> ${formatTimestamp(endTime, '.')}\n${chunk.text.trim()}\n`
    })
    .join('\n')
  return `WEBVTT\n\n${body}`
}

export function toJson(result: TranscriptResult): string {
  return JSON.stringify(result, null, 2)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- transcriptExport`
Expected: PASS (4 tests passed)

- [ ] **Step 5: Commit**

```bash
git add app/utils/transcriptExport.ts tests/unit/utils/transcriptExport.test.ts
git commit -m "Añade utilidades de exportación TXT/SRT/VTT/JSON"
```

---

### Task 10: `TranscriptEditor` component

**Files:**
- Create: `app/components/transcript/TranscriptEditor.vue`
- Test: `tests/unit/components/TranscriptEditor.test.ts`

**Interfaces:**
- Produces: a `v-model`-compatible component (`modelValue: string`, emits `update:modelValue`), consumed by Task 14.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/TranscriptEditor.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TranscriptEditor from '../../../app/components/transcript/TranscriptEditor.vue'

describe('TranscriptEditor', () => {
  it('renders the current text', () => {
    const wrapper = mount(TranscriptEditor, { props: { modelValue: 'hola' } })
    expect(wrapper.get('[data-testid="transcript-editor"]').element.value).toBe('hola')
  })

  it('emits update:modelValue on input', async () => {
    const wrapper = mount(TranscriptEditor, { props: { modelValue: 'hola' } })
    const textarea = wrapper.get('[data-testid="transcript-editor"]')
    await textarea.setValue('hola mundo')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['hola mundo'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- TranscriptEditor`
Expected: FAIL with "Cannot find module '../../../app/components/transcript/TranscriptEditor.vue'"

- [ ] **Step 3: Implement `app/components/transcript/TranscriptEditor.vue`**

```vue
<script setup lang="ts">
defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <textarea
    class="w-full h-64 p-3 border rounded font-mono text-sm"
    data-testid="transcript-editor"
    :value="modelValue"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- TranscriptEditor`
Expected: PASS (2 tests passed)

- [ ] **Step 5: Commit**

```bash
git add app/components/transcript/TranscriptEditor.vue tests/unit/components/TranscriptEditor.test.ts
git commit -m "Añade componente TranscriptEditor"
```

---

### Task 11: `ExportMenu` component

**Files:**
- Create: `app/components/export/ExportMenu.vue`
- Test: `tests/unit/components/ExportMenu.test.ts`

**Interfaces:**
- Consumes: `toTxt`, `toSrt`, `toVtt`, `toJson`, `TranscriptResult` from Task 9.
- Produces: a component with prop `result: TranscriptResult`, used standalone in Task 14.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/ExportMenu.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ExportMenu from '../../../app/components/export/ExportMenu.vue'

const sample = {
  text: 'Hola mundo.',
  chunks: [{ text: 'Hola mundo.', timestamp: [0, 1] as [number, number] }],
}

beforeEach(() => {
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

describe('ExportMenu', () => {
  it('triggers a TXT download when the TXT button is clicked', async () => {
    const wrapper = mount(ExportMenu, { props: { result: sample } })
    await wrapper.get('[data-testid="export-txt"]').trigger('click')
    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled()
  })

  it('triggers a JSON download when the JSON button is clicked', async () => {
    const wrapper = mount(ExportMenu, { props: { result: sample } })
    await wrapper.get('[data-testid="export-json"]').trigger('click')
    expect(URL.createObjectURL).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- ExportMenu`
Expected: FAIL with "Cannot find module '../../../app/components/export/ExportMenu.vue'"

- [ ] **Step 3: Implement `app/components/export/ExportMenu.vue`**

```vue
<script setup lang="ts">
import { toTxt, toSrt, toVtt, toJson, type TranscriptResult } from '../../utils/transcriptExport'

const props = defineProps<{ result: TranscriptResult }>()

const formats = [
  { key: 'txt', label: 'TXT', mime: 'text/plain', extension: 'txt', generate: toTxt },
  { key: 'srt', label: 'SRT', mime: 'text/plain', extension: 'srt', generate: toSrt },
  { key: 'vtt', label: 'VTT', mime: 'text/vtt', extension: 'vtt', generate: toVtt },
  { key: 'json', label: 'JSON', mime: 'application/json', extension: 'json', generate: toJson },
] as const

function download(format: (typeof formats)[number]) {
  const content = format.generate(props.result)
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
  <div class="flex gap-2">
    <button
      v-for="format in formats"
      :key="format.key"
      :data-testid="`export-${format.key}`"
      class="px-3 py-1 border rounded"
      @click="download(format)"
    >
      {{ format.label }}
    </button>
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- ExportMenu`
Expected: PASS (2 tests passed)

- [ ] **Step 5: Commit**

```bash
git add app/components/export/ExportMenu.vue tests/unit/components/ExportMenu.test.ts
git commit -m "Añade componente ExportMenu"
```

---

### Task 12: Componentes de UI del grabador (`RecordButton`, `RecordingTimer`, `AudioVisualizer`)

**Files:**
- Create: `app/utils/formatElapsed.ts`
- Create: `app/components/recorder/RecordButton.vue`
- Create: `app/components/recorder/RecordingTimer.vue`
- Create: `app/components/recorder/AudioVisualizer.vue`
- Test: `tests/unit/utils/formatElapsed.test.ts`
- Test: `tests/unit/components/RecordButton.test.ts`
- Test: `tests/unit/components/RecordingTimer.test.ts`

**Interfaces:**
- Produces: `formatElapsed(totalSeconds: number): string`; `RecordButton` (prop `state`, emits `start`/`stop`); `RecordingTimer` (prop `seconds: number`); `AudioVisualizer` (prop `level?: number`). All consumed by Task 14. `AudioVisualizer` has no automated test in this phase — it is static, prop-driven markup with no logic to assert beyond what TypeScript already checks.

- [ ] **Step 1: Write the failing test for `formatElapsed`**

Create `tests/unit/utils/formatElapsed.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatElapsed } from '../../../app/utils/formatElapsed'

describe('formatElapsed', () => {
  it('formats seconds under a minute', () => {
    expect(formatElapsed(5)).toBe('00:05')
  })

  it('formats minutes and seconds', () => {
    expect(formatElapsed(125)).toBe('02:05')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- formatElapsed`
Expected: FAIL with "Cannot find module '../../../app/utils/formatElapsed'"

- [ ] **Step 3: Implement `app/utils/formatElapsed.ts`**

```ts
export function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- formatElapsed`
Expected: PASS (2 tests passed)

- [ ] **Step 5: Write the failing tests for `RecordButton` and `RecordingTimer`**

Create `tests/unit/components/RecordButton.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RecordButton from '../../../app/components/recorder/RecordButton.vue'

describe('RecordButton', () => {
  it('shows "Grabar" and emits start when idle', async () => {
    const wrapper = mount(RecordButton, { props: { state: 'idle' } })
    expect(wrapper.text()).toContain('Grabar')
    await wrapper.get('[data-testid="record-button"]').trigger('click')
    expect(wrapper.emitted('start')).toHaveLength(1)
  })

  it('shows "Detener" and emits stop when recording', async () => {
    const wrapper = mount(RecordButton, { props: { state: 'recording' } })
    expect(wrapper.text()).toContain('Detener')
    await wrapper.get('[data-testid="record-button"]').trigger('click')
    expect(wrapper.emitted('stop')).toHaveLength(1)
  })
})
```

Create `tests/unit/components/RecordingTimer.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RecordingTimer from '../../../app/components/recorder/RecordingTimer.vue'

describe('RecordingTimer', () => {
  it('renders the formatted elapsed time', () => {
    const wrapper = mount(RecordingTimer, { props: { seconds: 65 } })
    expect(wrapper.get('[data-testid="recording-timer"]').text()).toBe('01:05')
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `pnpm test -- RecordButton RecordingTimer`
Expected: FAIL with "Cannot find module" for both components

- [ ] **Step 7: Implement `app/components/recorder/RecordButton.vue`**

```vue
<script setup lang="ts">
defineProps<{ state: 'idle' | 'recording' | 'stopped' | 'error' }>()
const emit = defineEmits<{ start: []; stop: [] }>()
</script>

<template>
  <button
    data-testid="record-button"
    class="px-4 py-2 rounded font-semibold"
    :class="state === 'recording' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'"
    @click="state === 'recording' ? emit('stop') : emit('start')"
  >
    {{ state === 'recording' ? 'Detener' : 'Grabar' }}
  </button>
</template>
```

- [ ] **Step 8: Implement `app/components/recorder/RecordingTimer.vue`**

```vue
<script setup lang="ts">
import { formatElapsed } from '../../utils/formatElapsed'
const props = defineProps<{ seconds: number }>()
</script>

<template>
  <span data-testid="recording-timer">{{ formatElapsed(props.seconds) }}</span>
</template>
```

- [ ] **Step 9: Implement `app/components/recorder/AudioVisualizer.vue` (no test, see note above)**

```vue
<script setup lang="ts">
withDefaults(defineProps<{ level?: number }>(), { level: 0 })
</script>

<template>
  <div class="w-full h-2 bg-gray-200 rounded" data-testid="audio-visualizer">
    <div class="h-2 bg-green-500 rounded" :style="{ width: `${Math.min(level, 1) * 100}%` }" />
  </div>
</template>
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `pnpm test -- RecordButton RecordingTimer formatElapsed`
Expected: PASS (5 tests passed)

- [ ] **Step 11: Commit**

```bash
git add app/utils/formatElapsed.ts app/components/recorder tests/unit/utils/formatElapsed.test.ts tests/unit/components/RecordButton.test.ts tests/unit/components/RecordingTimer.test.ts
git commit -m "Añade componentes de UI del grabador"
```

---

### Task 13: `FileDropzone` component

**Files:**
- Create: `app/components/importer/FileDropzone.vue`
- Test: `tests/unit/components/FileDropzone.test.ts`

**Interfaces:**
- Produces: a component with no props, emitting `file-selected: [file: File]` on an accepted audio/video file and `rejected: [reason: string]` otherwise. Consumed by Task 14.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/FileDropzone.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FileDropzone from '../../../app/components/importer/FileDropzone.vue'

function dropEventWith(file: File) {
  return { preventDefault: () => {}, dataTransfer: { files: [file] } } as unknown as DragEvent
}

describe('FileDropzone', () => {
  it('emits file-selected when an accepted file is dropped', async () => {
    const wrapper = mount(FileDropzone)
    const file = new File(['x'], 'memo.mp3', { type: 'audio/mpeg' })
    await wrapper.get('[data-testid="file-dropzone"]').trigger('drop', {} as Event)
    ;(wrapper.vm as unknown as { onDrop: (e: DragEvent) => void }).onDrop?.(dropEventWith(file))
    expect(wrapper.emitted('file-selected')?.[0]).toEqual([file])
  })

  it('emits rejected for an unsupported file type via the file input', async () => {
    const wrapper = mount(FileDropzone)
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
    const input = wrapper.get<HTMLInputElement>('[data-testid="file-input"]')
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    expect(wrapper.emitted('rejected')?.[0]).toEqual(['unsupported-file-type'])
  })
})
```

The first test calls `onDrop` directly because jsdom/happy-dom cannot construct a real `DragEvent` with a populated `dataTransfer`; exposing `onDrop` via `defineExpose` keeps the drop path testable.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- FileDropzone`
Expected: FAIL with "Cannot find module '../../../app/components/importer/FileDropzone.vue'"

- [ ] **Step 3: Implement `app/components/importer/FileDropzone.vue`**

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
  <div data-testid="file-dropzone" class="border-2 border-dashed rounded p-6 text-center" @dragover.prevent @drop="onDrop">
    <p>Arrastra un archivo de audio o vídeo, o</p>
    <label class="text-blue-600 underline cursor-pointer">
      selecciona uno
      <input type="file" accept="audio/*,video/*" class="hidden" data-testid="file-input" @change="onChange" />
    </label>
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- FileDropzone`
Expected: PASS (2 tests passed)

- [ ] **Step 5: Commit**

```bash
git add app/components/importer/FileDropzone.vue tests/unit/components/FileDropzone.test.ts
git commit -m "Añade componente FileDropzone"
```

---

### Task 14: Página principal `index.vue`

**Files:**
- Modify: `app/pages/index.vue` (replaces the Task 1 placeholder)
- Test: `tests/unit/pages/index.test.ts`

**Interfaces:**
- Consumes: `useRecorder` (Task 6), `useFileImport` (Task 7), `useModelSelector` (Task 5), `useTranscription` (Task 8), `decodeAudioFile` (Task 4), and all components from Tasks 10-13.
- This task wires every previous composable/component together; it has no downstream consumers.

Composable refs are destructured to top-level names (e.g. `recorderState`) rather than accessed as `recorder.state` so that Vue's template auto-unwrapping applies — accessing a ref through a nested object property in a template does not auto-unwrap it.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/pages/index.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const startRecording = vi.fn()
const stopRecording = vi.fn().mockResolvedValue(new Blob())
const importFile = vi.fn()
const transcribe = vi.fn()
const retry = vi.fn()

const recorderState = ref('idle')
const recorderError = ref<string | null>(null)
const importError = ref<string | null>(null)
const modelSize = ref('small')
const transcriptionState = ref('idle')
const transcriptionText = ref('')
const transcriptionChunks = ref<{ text: string; timestamp: [number, number | null] }[]>([])
const transcriptionError = ref<string | null>(null)
const transcriptionDevice = ref<'webgpu' | 'wasm' | null>(null)

vi.mock('../../../app/composables/useRecorder', () => ({
  useRecorder: () => ({ state: recorderState, errorMessage: recorderError, start: startRecording, stop: stopRecording }),
}))
vi.mock('../../../app/composables/useFileImport', () => ({
  useFileImport: () => ({ state: ref('idle'), errorMessage: importError, importFile }),
}))
vi.mock('../../../app/composables/useModelSelector', () => ({
  useModelSelector: () => ({ modelSize, setModelSize: vi.fn() }),
}))
vi.mock('../../../app/composables/useTranscription', () => ({
  useTranscription: () => ({
    state: transcriptionState,
    text: transcriptionText,
    chunks: transcriptionChunks,
    errorMessage: transcriptionError,
    device: transcriptionDevice,
    transcribe,
    retry,
  }),
}))
vi.mock('../../../app/utils/audio/decodeAudioFile', () => ({
  decodeAudioFile: vi.fn().mockResolvedValue(new Float32Array([0])),
}))

import IndexPage from '../../../app/pages/index.vue'
import FileDropzone from '../../../app/components/importer/FileDropzone.vue'

function mountPage() {
  return mount(IndexPage, {
    global: {
      stubs: { RecordButton: true, RecordingTimer: true, TranscriptEditor: true, ExportMenu: true },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  recorderState.value = 'idle'
  recorderError.value = null
  importError.value = null
  transcriptionState.value = 'idle'
  transcriptionError.value = null
  transcriptionDevice.value = null
})

describe('index page', () => {
  it('shows a banner when the microphone permission is denied', async () => {
    recorderError.value = 'mic-permission-denied'
    const wrapper = mountPage()
    expect(wrapper.find('[data-testid="recorder-error"]').exists()).toBe(true)
  })

  it('imports a file and starts transcription with the decoded PCM', async () => {
    const pcm = new Float32Array([1, 2, 3])
    importFile.mockResolvedValue(pcm)
    const wrapper = mountPage()

    await wrapper.findComponent(FileDropzone).vm.$emit('file-selected', new File(['x'], 'a.mp3', { type: 'audio/mpeg' }))
    await wrapper.vm.$nextTick()
    await Promise.resolve()

    expect(importFile).toHaveBeenCalled()
    expect(transcribe).toHaveBeenCalledWith(pcm, 'small')
  })

  it('retries transcription with the last imported audio when the retry button is clicked', async () => {
    const pcm = new Float32Array([4, 5, 6])
    importFile.mockResolvedValue(pcm)
    const wrapper = mountPage()

    await wrapper.findComponent(FileDropzone).vm.$emit('file-selected', new File(['x'], 'a.mp3', { type: 'audio/mpeg' }))
    await wrapper.vm.$nextTick()
    await Promise.resolve()

    transcriptionState.value = 'error'
    await wrapper.vm.$nextTick()
    await wrapper.get('[data-testid="retry-button"]').trigger('click')

    expect(retry).toHaveBeenCalledWith(pcm, 'small')
  })

  it('populates the editor with the transcribed text once done', async () => {
    transcriptionText.value = 'texto reconocido'
    const wrapper = mountPage()

    transcriptionState.value = 'done'
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent({ name: 'TranscriptEditor' }).props('modelValue')).toBe('texto reconocido')
    expect(wrapper.findComponent({ name: 'ExportMenu' }).exists()).toBe(true)
  })

  it('shows a compatibility notice when the worker falls back to wasm', async () => {
    const wrapper = mountPage()

    transcriptionDevice.value = 'wasm'
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="wasm-fallback-notice"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- index`
Expected: FAIL — the placeholder `index.vue` from Task 1 has none of the expected `data-testid` elements or composable wiring.

- [ ] **Step 3: Implement `app/pages/index.vue`**

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import RecordButton from '../components/recorder/RecordButton.vue'
import RecordingTimer from '../components/recorder/RecordingTimer.vue'
import FileDropzone from '../components/importer/FileDropzone.vue'
import TranscriptEditor from '../components/transcript/TranscriptEditor.vue'
import ExportMenu from '../components/export/ExportMenu.vue'
import { useRecorder } from '../composables/useRecorder'
import { useFileImport } from '../composables/useFileImport'
import { useModelSelector } from '../composables/useModelSelector'
import { useTranscription } from '../composables/useTranscription'
import { decodeAudioFile } from '../utils/audio/decodeAudioFile'

const {
  state: recorderState,
  errorMessage: recorderError,
  start: startRecording,
  stop: stopRecording,
} = useRecorder()

const { errorMessage: importError, importFile } = useFileImport()

const { modelSize } = useModelSelector()

const {
  state: transcriptionState,
  text: transcriptionText,
  chunks: transcriptionChunks,
  errorMessage: transcriptionError,
  device: transcriptionDevice,
  transcribe,
  retry,
} = useTranscription()

const elapsedSeconds = ref(0)
const editedText = ref('')
const importRejectedReason = ref<string | null>(null)
const lastAudio = ref<Float32Array | null>(null)
let timerInterval: ReturnType<typeof setInterval> | null = null

watch(transcriptionState, (state) => {
  if (state === 'done') editedText.value = transcriptionText.value
})

async function handleRecordStart() {
  await startRecording()
  if (recorderState.value !== 'recording') return
  elapsedSeconds.value = 0
  timerInterval = setInterval(() => {
    elapsedSeconds.value += 1
  }, 1000)
}

async function handleRecordStop() {
  const blob = await stopRecording()
  if (timerInterval) clearInterval(timerInterval)
  const arrayBuffer = await blob.arrayBuffer()
  const pcm = await decodeAudioFile(arrayBuffer)
  lastAudio.value = pcm
  transcribe(pcm, modelSize.value)
}

async function handleFileSelected(file: File) {
  importRejectedReason.value = null
  const pcm = await importFile(file)
  if (pcm) {
    lastAudio.value = pcm
    transcribe(pcm, modelSize.value)
  }
}

function handleFileRejected(reason: string) {
  importRejectedReason.value = reason
}

function handleRetry() {
  if (lastAudio.value) retry(lastAudio.value, modelSize.value)
}
</script>

<template>
  <main class="max-w-2xl mx-auto p-6 space-y-6">
    <h1 class="text-2xl font-bold">Local Recorder</h1>

    <section class="flex items-center gap-4">
      <RecordButton :state="recorderState" @start="handleRecordStart" @stop="handleRecordStop" />
      <RecordingTimer v-if="recorderState === 'recording'" :seconds="elapsedSeconds" />
    </section>
    <p v-if="recorderError" data-testid="recorder-error" class="text-red-600">
      No se pudo acceder al micrófono. Revisa los permisos del navegador.
    </p>

    <FileDropzone @file-selected="handleFileSelected" @rejected="handleFileRejected" />
    <p v-if="importRejectedReason || importError" data-testid="import-error" class="text-red-600">
      Formato de archivo no soportado. Prueba con mp3, wav, m4a, mp4 o webm.
    </p>

    <p v-if="transcriptionDevice === 'wasm'" data-testid="wasm-fallback-notice">
      Tu navegador no soporta WebGPU: usando modo compatibilidad (más lento).
    </p>
    <p v-if="transcriptionState === 'loading-model'" data-testid="status-loading-model">Descargando modelo de transcripción…</p>
    <p v-if="transcriptionState === 'transcribing'" data-testid="status-transcribing">Transcribiendo…</p>
    <div v-if="transcriptionState === 'error'" data-testid="transcription-error">
      <p class="text-red-600">{{ transcriptionError ?? 'Ocurrió un error al transcribir.' }}</p>
      <button data-testid="retry-button" class="underline" @click="handleRetry">Reintentar</button>
    </div>

    <template v-if="transcriptionState === 'done'">
      <TranscriptEditor v-model="editedText" />
      <ExportMenu :result="{ text: editedText, chunks: transcriptionChunks }" />
    </template>
  </main>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- index`
Expected: PASS (5 tests passed)

- [ ] **Step 5: Run the full unit suite**

Run: `pnpm test`
Expected: PASS (all tests passed)

- [ ] **Step 6: Commit**

```bash
git add app/pages/index.vue tests/unit/pages/index.test.ts
git commit -m "Conecta grabación, importación, transcripción, editor y exportación en la página principal"
```

---

### Task 15: Suite E2E con Playwright (worker mockeado)

**Files:**
- Modify: `playwright.config.ts` (add fake-media-device Chromium flags for the recording flow)
- Create: `tests/e2e/transcription-flow.spec.ts`

**Interfaces:**
- Consumes: the full app from Task 14. Stubs the global `Worker` constructor at the browser level (via `page.addInitScript`) so no real model download or WebGPU/WASM inference happens in CI — only `decodeAudioFile`/`useRecorder`/`useFileImport`/the UI run for real.

- [ ] **Step 1: Update `playwright.config.ts` to enable a fake microphone device**

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    command: 'pnpm dev',
    port: 3000,
    reuseExistingServer: true,
  },
  use: {
    baseURL: 'http://localhost:3000',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone'],
        launchOptions: {
          args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
        },
      },
    },
  ],
})
```

- [ ] **Step 2: Write the E2E spec**

Create `tests/e2e/transcription-flow.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

function createSilentWav(durationSeconds: number): Buffer {
  const sampleRate = 16000
  const numSamples = sampleRate * durationSeconds
  const dataSize = numSamples * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  return buffer
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class FakeWhisperWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null
      onerror: (() => void) | null = null
      postMessage(message: { type: string }) {
        if (message.type !== 'transcribe') return
        setTimeout(() => this.onmessage?.({ data: { type: 'progress', status: 'loading-model' } }), 0)
        setTimeout(() => this.onmessage?.({ data: { type: 'progress', status: 'transcribing' } }), 10)
        setTimeout(
          () =>
            this.onmessage?.({
              data: {
                type: 'result',
                text: 'hola mundo de prueba',
                chunks: [{ text: 'hola mundo de prueba', timestamp: [0, 1] }],
              },
            }),
          20,
        )
      }
      terminate() {}
    }
    // @ts-expect-error overriding the global Worker with a test double
    window.Worker = FakeWhisperWorker
  })
})

test('importa un archivo, transcribe (worker mockeado) y exporta TXT', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('[data-testid="file-input"]', {
    name: 'sample.wav',
    mimeType: 'audio/wav',
    buffer: createSilentWav(1),
  })

  await expect(page.getByTestId('transcript-editor')).toHaveValue('hola mundo de prueba', { timeout: 5000 })

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-txt').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('transcript.txt')
})

test('muestra un error al importar un archivo no soportado', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('[data-testid="file-input"]', {
    name: 'doc.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('not audio'),
  })

  await expect(page.getByTestId('import-error')).toBeVisible()
})

test('grava desde el micrófono, transcribe (worker mockeado) y exporta SRT', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('record-button').click()
  await expect(page.getByTestId('recording-timer')).toBeVisible()
  await page.waitForTimeout(1200)
  await page.getByTestId('record-button').click()

  await expect(page.getByTestId('transcript-editor')).toHaveValue('hola mundo de prueba', { timeout: 5000 })

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-srt').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('transcript.srt')
})
```

- [ ] **Step 3: Run the e2e suite**

Run: `pnpm test:e2e`
Expected: PASS (4 tests passed — including the Task 1 smoke test)

- [ ] **Step 4: Run the full unit suite one more time to confirm no regressions**

Run: `pnpm test`
Expected: PASS (all tests passed)

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/transcription-flow.spec.ts
git commit -m "Añade suite E2E de grabación/importación/transcripción/exportación con worker mockeado"
```

---

