# Filtrado de anotaciones no-habladas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar del resultado de transcripción las anotaciones no-habladas que Whisper emite como texto literal (`[MUSIC]`, `(applause)`, etc.), y mostrar un mensaje explícito cuando, tras filtrar, no queda ningún texto.

**Architecture:** Una utilidad pura nueva (`app/utils/transcriptClean.ts`) detecta y filtra chunks que son íntegramente una anotación entre corchetes/paréntesis, y reconstruye el texto final a partir de los chunks supervivientes. `whisper.worker.ts` la invoca justo antes de postear el mensaje `result`, sin cambiar la forma de ese mensaje. `index.vue` añade un mensaje alternativo cuando el texto final, tras recortarlo, queda vacío.

**Tech Stack:** Igual que fases anteriores — Nuxt 4, TypeScript, Vue `<script setup>`, Tailwind CSS, Vitest + `@vue/test-utils` + happy-dom, pnpm.

## Global Constraints

- Package manager: pnpm only.
- Styling: Tailwind CSS, sin librería de componentes.
- Commits: sin co-author, mensajes en español, siempre en `main` (`CLAUDE.md`).
- Composables/componentes con imports explícitos de `vue`, no auto-imports de Nuxt — para que se puedan testear con Vitest + happy-dom sin el runtime completo de Nuxt.
- `whisper.worker.ts` no tiene test unitario directo (requiere navegador real para `pipeline`), igual que en fases anteriores — su corrección se verifica leyendo el código.
- `pnpm dlx nuxi typecheck` debe seguir pasando limpio tras cada tarea que toque `whisper.worker.ts`, `whisper.types.ts`, `transcriptClean.ts` o `index.vue`.
- Tras cada tarea, correr `pnpm test` completo para confirmar que no hay regresiones (no solo el archivo de test recién tocado).

---

### Task 1: Utilidad `transcriptClean`

**Files:**
- Create: `app/utils/transcriptClean.ts`
- Test: `tests/unit/utils/transcriptClean.test.ts`

**Interfaces:**
- Consumes: `WhisperChunk` desde `app/workers/whisper.types.ts` (ya existe, `{ text: string; timestamp: [number, number | null] }`).
- Produces: `isNonSpeechAnnotation(text: string): boolean`, `filterNonSpeechChunks(chunks: WhisperChunk[]): WhisperChunk[]`, `deriveText(chunks: WhisperChunk[], fallbackText: string): string`. Las tres consumidas por la Tarea 2 (`whisper.worker.ts`).

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/utils/transcriptClean.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isNonSpeechAnnotation, filterNonSpeechChunks, deriveText } from '../../../app/utils/transcriptClean'
import type { WhisperChunk } from '../../../app/workers/whisper.types'

const chunk = (text: string): WhisperChunk => ({ text, timestamp: [0, 1] })

describe('isNonSpeechAnnotation', () => {
  it('matches a whole chunk wrapped in square brackets', () => {
    expect(isNonSpeechAnnotation('[MUSIC]')).toBe(true)
  })

  it('matches a whole chunk wrapped in parentheses', () => {
    expect(isNonSpeechAnnotation('(applause)')).toBe(true)
  })

  it('ignores surrounding whitespace', () => {
    expect(isNonSpeechAnnotation('  [ Music playing ]  ')).toBe(true)
  })

  it('does not look at the words, only the structure', () => {
    expect(isNonSpeechAnnotation('[Blank_Audio]')).toBe(true)
    expect(isNonSpeechAnnotation('[anything at all]')).toBe(true)
  })

  it('does not match normal spoken text', () => {
    expect(isNonSpeechAnnotation('Hola, ¿cómo estás?')).toBe(false)
  })

  it('does not match text that only partially contains parentheses', () => {
    expect(isNonSpeechAnnotation('hola (en serio)')).toBe(false)
  })
})

describe('filterNonSpeechChunks', () => {
  it('drops chunks that are entirely a non-speech annotation', () => {
    const chunks = [chunk('Hola mundo'), chunk('[MUSIC]'), chunk('Adiós')]
    expect(filterNonSpeechChunks(chunks)).toEqual([chunk('Hola mundo'), chunk('Adiós')])
  })

  it('returns an empty array when every chunk is an annotation', () => {
    const chunks = [chunk('[MUSIC]'), chunk('(applause)')]
    expect(filterNonSpeechChunks(chunks)).toEqual([])
  })

  it('returns all chunks unchanged when none are annotations', () => {
    const chunks = [chunk('Hola'), chunk('Adiós')]
    expect(filterNonSpeechChunks(chunks)).toEqual(chunks)
  })
})

describe('deriveText', () => {
  it('joins the trimmed text of the surviving chunks', () => {
    expect(deriveText([chunk(' Hola '), chunk('mundo')], 'irrelevant')).toBe('Hola mundo')
  })

  it('falls back to the trimmed fallback text when there are no chunks and it is not an annotation', () => {
    expect(deriveText([], '  hola mundo  ')).toBe('hola mundo')
  })

  it('returns an empty string when there are no chunks and the fallback text is itself an annotation', () => {
    expect(deriveText([], '[MUSIC]')).toBe('')
  })
})
```

- [ ] **Step 2: Ejecutar el test para confirmar que falla**

Run: `pnpm test -- transcriptClean`
Expected: FAIL con "Cannot find module '../../../app/utils/transcriptClean'"

- [ ] **Step 3: Implementar `app/utils/transcriptClean.ts`**

```ts
import type { WhisperChunk } from '../workers/whisper.types'

const BRACKET_ANNOTATION = /^\[[^[\]]*\]$/
const PAREN_ANNOTATION = /^\([^()]*\)$/

export function isNonSpeechAnnotation(text: string): boolean {
  const trimmed = text.trim()
  return BRACKET_ANNOTATION.test(trimmed) || PAREN_ANNOTATION.test(trimmed)
}

export function filterNonSpeechChunks(chunks: WhisperChunk[]): WhisperChunk[] {
  return chunks.filter((chunk) => !isNonSpeechAnnotation(chunk.text))
}

export function deriveText(chunks: WhisperChunk[], fallbackText: string): string {
  if (chunks.length > 0) {
    return chunks
      .map((chunk) => chunk.text.trim())
      .join(' ')
      .trim()
  }
  const trimmedFallback = fallbackText.trim()
  return isNonSpeechAnnotation(trimmedFallback) ? '' : trimmedFallback
}
```

- [ ] **Step 4: Ejecutar el test para confirmar que pasa**

Run: `pnpm test -- transcriptClean`
Expected: PASS (12 tests passed)

- [ ] **Step 5: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 6: Commit**

```bash
git add app/utils/transcriptClean.ts tests/unit/utils/transcriptClean.test.ts
git commit -m "Añade utilidad transcriptClean para filtrar anotaciones no-habladas"
```

---

### Task 2: Conectar el filtrado en `whisper.worker.ts`

**Files:**
- Modify: `app/workers/whisper.worker.ts:3,58-69`

> **Nota de actualización del plan:** las referencias de línea y el bloque
> de código de este Task se escribieron antes de aplicarse el fix de
> truncado a 30s (`2026-06-24-chunking-audio-largo.md`), que ya está
> mergeado en `main` y desplazó/modificó estas líneas. Los snippets de
> abajo ya reflejan el estado real actual del archivo.

**Interfaces:**
- Consumes: `filterNonSpeechChunks`, `deriveText` de `app/utils/transcriptClean.ts` (Tarea 1).
- No produce nada nuevo para tareas posteriores — la forma del mensaje `{ type: 'result', text, chunks }` no cambia, solo su contenido.

Este archivo no tiene test unitario directo (ver Global Constraints): la pipeline de transcripción (`pipeline(...)`, `asr(...)`) requiere un navegador real. Su corrección se verifica leyendo el código y con la suite completa + typecheck, igual que en fases anteriores.

- [ ] **Step 1: Añadir el import**

En `app/workers/whisper.worker.ts`, cambiar la línea 3:
```ts
import type { WhisperWorkerRequest, WhisperWorkerResponse, WhisperChunk } from './whisper.types'
```
por:
```ts
import type { WhisperWorkerRequest, WhisperWorkerResponse, WhisperChunk } from './whisper.types'
import { filterNonSpeechChunks, deriveText } from '../utils/transcriptClean'
```

- [ ] **Step 2: Filtrar antes de postear el resultado**

Cambiar (líneas 58-69 actuales):
```ts
    const output = await asr(audio, {
      return_timestamps: true,
      chunk_length_s: CHUNK_LENGTH_S,
      stride_length_s: STRIDE_LENGTH_S,
    })
    const rawChunks = Array.isArray(output) ? output[0]?.chunks ?? [] : output.chunks ?? []
    const chunks: WhisperChunk[] = rawChunks.map((chunk: { text: string; timestamp: [number, number | null] }) => ({
      text: chunk.text,
      timestamp: chunk.timestamp,
    }))
    const text = Array.isArray(output) ? output[0]?.text ?? '' : output.text
    post({ type: 'result', text, chunks })
```
por:
```ts
    const output = await asr(audio, {
      return_timestamps: true,
      chunk_length_s: CHUNK_LENGTH_S,
      stride_length_s: STRIDE_LENGTH_S,
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
```

- [ ] **Step 3: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan, sin regresiones — este archivo no tiene tests propios, pero no debe romper ningún otro)

- [ ] **Step 4: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 5: Commit**

```bash
git add app/workers/whisper.worker.ts
git commit -m "Filtra anotaciones no-habladas antes de postear el resultado del worker"
```

---

### Task 3: Mensaje de "no se detectó voz" en `index.vue`

**Files:**
- Modify: `app/pages/index.vue:125-128`
- Modify: `tests/unit/pages/index.test.ts`

**Interfaces:**
- Consumes: `editedText` (ref local ya existente en `index.vue`, poblado desde `transcriptionText` al llegar a `done`).
- No produce nada nuevo para tareas posteriores — esta tarea es solo de presentación.

- [ ] **Step 1: Escribir el test que falla**

En `tests/unit/pages/index.test.ts`, añadir al final del `describe('index page', ...)`, antes del cierre (después del test `'shows a progress bar while the model downloads'`):

```ts

  it('shows a message instead of the editor when the transcription is empty', async () => {
    transcriptionText.value = '   '
    const wrapper = mountPage()

    transcriptionState.value = 'done'
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="no-speech-detected"]').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'TranscriptEditor' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ExportMenu' }).exists()).toBe(false)
  })
```

- [ ] **Step 2: Ejecutar el test para confirmar que falla**

Run: `pnpm test -- index`
Expected: FAIL — `[data-testid="no-speech-detected"]` no existe todavía en el DOM; `index.vue` siempre renderiza `TranscriptEditor`/`ExportMenu` en estado `done` sin importar si el texto está vacío.

- [ ] **Step 3: Modificar `app/pages/index.vue`**

Cambiar (líneas 125-128):
```html
    <template v-if="transcriptionState === 'done'">
      <TranscriptEditor v-model="editedText" />
      <ExportMenu :result="{ text: editedText, chunks: transcriptionChunks }" />
    </template>
```
por:
```html
    <template v-if="transcriptionState === 'done'">
      <p v-if="editedText.trim() === ''" data-testid="no-speech-detected">No se detectó voz en el audio.</p>
      <template v-else>
        <TranscriptEditor v-model="editedText" />
        <ExportMenu :result="{ text: editedText, chunks: transcriptionChunks }" />
      </template>
    </template>
```

- [ ] **Step 4: Ejecutar los tests para confirmar que pasan**

Run: `pnpm test -- index`
Expected: PASS (9 tests passed) — incluyendo el test existente `'populates the editor with the transcribed text once done'`, que sigue pasando porque ese texto no está vacío.

- [ ] **Step 5: Ejecutar la suite completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan, sin regresiones)

- [ ] **Step 6: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 7: Ejecutar la suite E2E**

Run: `pnpm test:e2e`
Expected: PASS (4 tests passed) — el `FakeWhisperWorker` de `tests/e2e/transcription-flow.spec.ts` postea un `result` con texto no vacío en sus fixtures, así que no entra en la rama del mensaje "no se detectó voz".

- [ ] **Step 8: Commit**

```bash
git add app/pages/index.vue tests/unit/pages/index.test.ts
git commit -m "Muestra un mensaje cuando la transcripción queda vacía tras filtrar anotaciones"
```

---
