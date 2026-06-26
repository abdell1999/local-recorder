# Exportación Markdown — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir el formato Markdown al menú de exportación, con bloques por hablante + timestamp cuando la diarización está disponible, y fallback a líneas por timestamp cuando no lo está.

**Architecture:** Nueva función pura `toMarkdown(result, segments?)` en `transcriptExport.ts` (ya existente). `ExportMenu.vue` gana una prop `segments?: SpeakerSegment[]` y un botón MD. `index.vue` pasa los segmentos de diarización cuando están disponibles. La lógica de asignación de hablante se encapsula en `toMarkdown` sin tocar `speakerTranscriptAlignment.ts`.

**Tech Stack:** Nuxt 4, Vue 3, TypeScript, Vitest, pnpm.

## Global Constraints

- Package manager: pnpm only.
- Commits sin co-author, mensajes en español, siempre en `main` (`CLAUDE.md`).
- `pnpm dlx nuxi typecheck` debe pasar limpio tras cada tarea. El proyecto usa `noUncheckedIndexedAccess: true` — accesos a arrays tipan como `T | undefined`; usar guards explícitos, nunca casts.
- `pnpm test` completo debe pasar sin regresiones tras cada tarea.

---

### Task 1: `toMarkdown` — función pura con hablantes y timestamps

**Files:**
- Modify: `app/utils/transcriptExport.ts`
- Test: `tests/unit/utils/transcriptExport.test.ts`

**Interfaces:**
- Consumes: `TranscriptResult` (ya exportado en el mismo archivo), `SpeakerSegment` de `../workers/speakerSegmentation.types` (ya existente).
- Produces:
  ```ts
  export function toMarkdown(result: TranscriptResult, segments?: SpeakerSegment[]): string
  ```
  Usada por la Tarea 2 (`ExportMenu.vue`).

- [ ] **Step 1: Añadir los tests que fallan**

En `tests/unit/utils/transcriptExport.test.ts`, añadir tras los describes existentes:

```ts
import type { SpeakerSegment } from '../../../app/workers/speakerSegmentation.types'

const seg = (start: number, end: number, globalSpeakerId: number | null): SpeakerSegment => ({
  windowIndex: 0,
  localSpeakerId: 1,
  start,
  end,
  confidence: 1,
  globalSpeakerId,
})

describe('toMarkdown', () => {
  it('returns empty string for empty chunks', () => {
    expect(toMarkdown({ text: '', chunks: [] })).toBe('')
  })

  it('returns fallback timestamp format for a single chunk without segments', () => {
    const chunks = [{ text: ' hello', timestamp: [5, 10] as [number, number | null] }]
    expect(toMarkdown({ text: 'hello', chunks })).toBe('**[00:05]** hello')
  })

  it('separates multiple fallback chunks with blank lines', () => {
    const chunks = [
      { text: ' hello', timestamp: [0, 5] as [number, number | null] },
      { text: ' world', timestamp: [5, 10] as [number, number | null] },
    ]
    expect(toMarkdown({ text: 'hello world', chunks })).toBe('**[00:00]** hello\n\n**[00:05]** world')
  })

  it('formats timestamps >= 3600s as HH:MM:SS', () => {
    const chunks = [{ text: ' hi', timestamp: [3661, 3670] as [number, number | null] }]
    expect(toMarkdown({ text: 'hi', chunks })).toBe('**[01:01:01]** hi')
  })

  it('groups consecutive chunks of the same speaker into one block', () => {
    const chunks = [
      { text: ' hello', timestamp: [0, 5] as [number, number | null] },
      { text: ' world', timestamp: [5, 10] as [number, number | null] },
    ]
    expect(toMarkdown({ text: 'hello world', chunks }, [seg(0, 10, 0)])).toBe(
      '**Hablante 1** · 00:00\n\nhello world',
    )
  })

  it('separates alternating speakers with ---', () => {
    const chunks = [
      { text: ' hello', timestamp: [0, 5] as [number, number | null] },
      { text: ' hi', timestamp: [5, 10] as [number, number | null] },
    ]
    expect(toMarkdown({ text: 'hello hi', chunks }, [seg(0, 5, 0), seg(5, 10, 1)])).toBe(
      '**Hablante 1** · 00:00\n\nhello\n\n---\n\n**Hablante 2** · 00:05\n\nhi',
    )
  })

  it('renders null-speaker chunks in fallback format within speaker output', () => {
    // First chunk has no overlapping segment → null speaker
    const chunks = [
      { text: ' overlap', timestamp: [0, 5] as [number, number | null] },
      { text: ' clear', timestamp: [5, 10] as [number, number | null] },
    ]
    expect(toMarkdown({ text: 'overlap clear', chunks }, [seg(5, 10, 0)])).toBe(
      '**[00:00]** overlap\n\n---\n\n**Hablante 1** · 00:05\n\nclear',
    )
  })

  it('with all-null globalSpeakerId behaves identically to no-segments fallback', () => {
    const chunks = [{ text: ' hello', timestamp: [0, 5] as [number, number | null] }]
    expect(toMarkdown({ text: 'hello', chunks }, [seg(0, 5, null)])).toBe(
      toMarkdown({ text: 'hello', chunks }),
    )
  })
})
```

También actualizar el import en la línea 2 del archivo para incluir `toMarkdown`:
```ts
import { toTxt, toSrt, toVtt, toJson, toMarkdown, type TranscriptResult } from '../../../app/utils/transcriptExport'
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `pnpm vitest run tests/unit/utils/transcriptExport.test.ts`
Expected: FAIL — `toMarkdown is not a function` (o similar)

- [ ] **Step 3: Implementar `toMarkdown` en `transcriptExport.ts`**

Añadir al principio del archivo, junto al import existente de `WhisperChunk`:
```ts
import type { SpeakerSegment } from '../workers/speakerSegmentation.types'
```

Añadir al final del archivo (tras `toJson`):

```ts
function formatMd(seconds: number): string {
  const totalSeconds = Math.floor(seconds)
  const s = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const m = totalMinutes % 60
  const h = Math.floor(totalMinutes / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function assignSpeaker(chunk: WhisperChunk, segments: SpeakerSegment[]): number | null {
  const [chunkStart, chunkEndOrNull] = chunk.timestamp
  const chunkEnd = chunkEndOrNull ?? chunkStart
  let bestId: number | null = null
  let bestOverlap = 0
  for (const segment of segments) {
    if (segment.globalSpeakerId === null) continue
    const overlap = Math.min(chunkEnd, segment.end) - Math.max(chunkStart, segment.start)
    if (overlap > bestOverlap) {
      bestOverlap = overlap
      bestId = segment.globalSpeakerId
    }
  }
  return bestId
}

export function toMarkdown(result: TranscriptResult, segments?: SpeakerSegment[]): string {
  if (result.chunks.length === 0) return ''

  if (!segments || segments.length === 0) {
    return result.chunks
      .map((chunk) => {
        const [start] = chunk.timestamp
        return `**[${formatMd(start)}]** ${chunk.text.trim()}`
      })
      .join('\n\n')
  }

  type Group = { globalSpeakerId: number | null; chunks: WhisperChunk[] }
  const groups: Group[] = []
  for (const chunk of result.chunks) {
    const speakerId = assignSpeaker(chunk, segments)
    const last = groups[groups.length - 1]
    if (last !== undefined && last.globalSpeakerId === speakerId) {
      last.chunks.push(chunk)
    } else {
      groups.push({ globalSpeakerId: speakerId, chunks: [chunk] })
    }
  }

  return groups
    .map((group) => {
      const firstChunk = group.chunks[0]
      if (firstChunk === undefined) return ''
      if (group.globalSpeakerId !== null) {
        const [start] = firstChunk.timestamp
        const text = group.chunks.map((c) => c.text.trim()).join(' ')
        return `**Hablante ${group.globalSpeakerId + 1}** · ${formatMd(start)}\n\n${text}`
      }
      return group.chunks
        .map((c) => {
          const [cStart] = c.timestamp
          return `**[${formatMd(cStart)}]** ${c.text.trim()}`
        })
        .join('\n\n')
    })
    .filter((s) => s !== '')
    .join('\n\n---\n\n')
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `pnpm vitest run tests/unit/utils/transcriptExport.test.ts`
Expected: PASS (12/12 — 4 existentes + 8 nuevos)

- [ ] **Step 5: Ejecutar la suite completa y tipar**

Run: `pnpm test && pnpm dlx nuxi typecheck`
Expected: PASS, sin errores de tipo

- [ ] **Step 6: Commit**

```bash
git add app/utils/transcriptExport.ts tests/unit/utils/transcriptExport.test.ts
git commit -m "Añade exportación Markdown con hablantes y timestamps"
```

---

### Task 2: Botón MD en `ExportMenu.vue` y wiring en `index.vue`

**Files:**
- Modify: `app/components/export/ExportMenu.vue`
- Modify: `app/pages/index.vue`

**Interfaces:**
- Consumes: `toMarkdown` de `../../utils/transcriptExport` (Task 1), `SpeakerSegment` de `../../workers/speakerSegmentation.types`.
- Produce: nada nuevo para otras tareas — esta es la tarea final.

Sin test unitario nuevo — los tests existentes de `ExportMenu.test.ts` cubren el patrón de descarga. Se verifica que siguen pasando y que el typecheck limpia.

- [ ] **Step 1: Reescribir `ExportMenu.vue`**

Sustituir el contenido completo de `app/components/export/ExportMenu.vue` por:

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

Nota: todos los `generate` pasan a ser funciones de cero argumentos (closures que capturan `props`), por lo que `download` llama `format.generate()` en vez de `format.generate(props.result)`. El comportamiento observable es idéntico para los formatos existentes.

- [ ] **Step 2: Actualizar `index.vue` — pasar `segments` a `ExportMenu`**

En `app/pages/index.vue`, cambiar:
```html
        <ExportMenu :result="{ text: editedText, chunks: transcriptionChunks }" />
```
por:
```html
        <ExportMenu
          :result="{ text: editedText, chunks: transcriptionChunks }"
          :segments="diarizationState === 'done' ? diarizationSegments : undefined"
        />
```

`diarizationState` y `diarizationSegments` ya existen en scope (desestructurados de `useSpeakerSegmentation` en la fase de diarización UI).

- [ ] **Step 3: Ejecutar la suite completa y tipar**

Run: `pnpm test && pnpm dlx nuxi typecheck`
Expected: PASS sin regresiones (los 2 tests de `ExportMenu.test.ts` siguen pasando porque solo verifican que `URL.createObjectURL` y `HTMLAnchorElement.click` se llaman, sin inspeccionar el contenido generado)

- [ ] **Step 4: Verificación manual**

Run: `pnpm dev`

1. Cargar `peluqueria.mp3`.
2. Esperar transcripción. Pulsar el botón **MD** → abrir el `.md` descargado y verificar que aparecen líneas `**[MM:SS]** texto`.
3. Pulsar "Identificar hablantes". Esperar. Pulsar **MD** de nuevo → verificar bloques `**Hablante N** · MM:SS` separados por `---`.

- [ ] **Step 5: Commit**

```bash
git add app/components/export/ExportMenu.vue app/pages/index.vue
git commit -m "Añade botón MD al menú de exportación con soporte de hablantes"
```
