# Timing y ETA de Transcripción

## Objetivo

Mostrar el tiempo transcurrido durante la transcripción, un ETA basado en progreso real de chunks, y la duración total al finalizar — para que el usuario sepa si el procesado es viable antes de esperar a ciegas.

## Alcance

Solo afecta al pipeline de transcripción (worker + composable + index.vue). No toca diarización ni resumen.

---

## 1. Worker (`whisper.worker.ts`)

### Nuevos mensajes postados

**Antes de llamar a `asr()`:**
```ts
post({ type: 'transcription-start', audioDuration: number, totalChunks: number })
```
- `audioDuration = audio.length / 16000` (segundos, Float32Array a 16 kHz)
- `totalChunks = Math.max(1, Math.ceil(audioDuration / (CHUNK_LENGTH_S - STRIDE_LENGTH_S)))`
  - Con los valores actuales: `Math.max(1, Math.ceil(audioDuration / 25))`

**Durante el procesado, via `callback_function`:**
```ts
post({ type: 'chunk-progress', done: number, total: number })
```
- `done` se incrementa en 1 por cada llamada al callback
- `total` es el mismo `totalChunks` calculado antes

### Cambio en la llamada a `asr()`

```ts
let chunksProcessed = 0
const totalChunks = Math.max(1, Math.ceil(audioDurationSeconds / (CHUNK_LENGTH_S - STRIDE_LENGTH_S)))
post({ type: 'transcription-start', audioDuration: audioDurationSeconds, totalChunks })

const output = await asr(audio, {
  return_timestamps: true,
  chunk_length_s: CHUNK_LENGTH_S,
  stride_length_s: STRIDE_LENGTH_S,
  ...(language !== 'auto' ? { language } : {}),
  callback_function: () => {
    chunksProcessed++
    post({ type: 'chunk-progress', done: chunksProcessed, total: totalChunks })
  },
})
```

---

## 2. Tipos (`whisper.types.ts`)

Dos nuevas interfaces:

```ts
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
```

Ambas se añaden a `WhisperWorkerResponse`.

---

## 3. Composable (`useTranscription.ts`)

### Estado nuevo

```ts
const elapsedSeconds = ref<number>(0)
const eta = ref<number | null>(null)
const transcriptionDuration = ref<number | null>(null)
```

### Timer

Variable interna `let timerHandle: ReturnType<typeof setInterval> | null = null`.

- Se arranca al recibir `transcription-start` (o al cambiar estado a `'transcribing'`): `setInterval(() => { elapsedSeconds.value++ }, 1000)`
- Se para y limpia al recibir `result` o `error` o en `worker.onerror`

### Cálculo de ETA

Al recibir `chunk-progress`:
```ts
if (message.done > 0 && elapsedSeconds.value > 0) {
  const secondsPerChunk = elapsedSeconds.value / message.done
  eta.value = Math.round(secondsPerChunk * (message.total - message.done))
}
```

### Reset en cada nueva transcripción

Al llamar a `transcribe()`:
```ts
elapsedSeconds.value = 0
eta.value = null
transcriptionDuration.value = null
```

### Al completar

Al recibir `result`:
```ts
transcriptionDuration.value = elapsedSeconds.value
// parar timer
```

### Retorno del composable

Exportar los tres nuevos valores:
```ts
return { ..., elapsedSeconds, eta, transcriptionDuration }
```

---

## 4. UI (`index.vue`)

### Durante la transcripción

Sustituir el `<p>` de estado por:

```html
<p data-testid="status-transcribing" class="text-sm text-gray-500 ...">
  <svg class="animate-spin ..."/> Transcribiendo… {{ formatElapsed(elapsedSeconds) }}
  <span v-if="eta !== null"> · ETA ~{{ formatElapsed(eta) }}</span>
</p>
<div v-if="chunkProgress !== null" class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
  <div
    data-testid="chunk-progress"
    class="bg-indigo-500 h-1.5 rounded-full transition-all"
    :style="{ width: `${(chunkProgress.done / chunkProgress.total) * 100}%` }"
  />
</div>
```

`chunkProgress` es un nuevo `Ref<{ done: number; total: number } | null>` en `useTranscription`.

### Al finalizar

En el header de la card de transcripción:

```html
<div class="flex items-center justify-between">
  <div class="flex items-center gap-3">
    <h2 class="text-xs font-semibold ...">Transcripción</h2>
    <span v-if="transcriptionDuration !== null" data-testid="transcription-duration"
      class="text-xs text-gray-400 dark:text-gray-500">
      Completado en {{ formatElapsed(transcriptionDuration) }}
    </span>
  </div>
  <ExportMenu ... />
</div>
```

---

## Restricciones globales

- Sin dependencias npm nuevas
- `callback_function` es parte de la API pública de `@huggingface/transformers` — no es un hack
- `formatElapsed` ya existe en `app/utils/formatElapsed.ts` — reutilizar sin modificar
- Commits en español, sin `Co-Authored-By`
- Rama `main`
