# Chunking de audio largo en el worker de Whisper — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir el truncado silencioso a 30 segundos en la transcripción Whisper, pasando `chunk_length_s`/`stride_length_s` a la llamada `asr(...)` en `whisper.worker.ts` para que el pipeline trocee internamente el audio largo en vez de descartar todo lo que pase de los primeros 30s.

**Architecture:** Cambio de una sola llamada en un solo archivo. Se añaden dos constantes a nivel de módulo (`CHUNK_LENGTH_S = 30`, `STRIDE_LENGTH_S = 5`) y se pasan como opciones adicionales a `asr(audio, {...})`. La forma de la salida (`{text, chunks}`) no cambia — el pipeline de `@huggingface/transformers` ya fusiona las ventanas internamente — así que ningún otro archivo del proyecto necesita modificarse.

**Tech Stack:** Igual que fases anteriores — Nuxt 4, TypeScript, `@huggingface/transformers` (Whisper vía transformers.js), Vitest, pnpm.

## Global Constraints

- Package manager: pnpm only.
- Commits: sin co-author, mensajes en español, siempre en `main` (`CLAUDE.md`).
- `whisper.worker.ts` no tiene test unitario directo (requiere navegador real para `pipeline`), igual que en fases anteriores — su corrección se verifica leyendo el código y con verificación manual en navegador.
- `pnpm dlx nuxi typecheck` debe seguir pasando limpio tras la tarea.
- Tras la tarea, correr `pnpm test` y `pnpm test:e2e` completos para confirmar que no hay regresiones (ninguna suite usa el pipeline real, así que no se espera que prueben este comportamiento directamente — solo confirman ausencia de roturas).

---

### Task 1: Pasar `chunk_length_s`/`stride_length_s` a la llamada `asr(...)`

**Files:**
- Modify: `app/workers/whisper.worker.ts:1-7,52`

**Interfaces:**
- No consume nada de tareas anteriores (no hay tareas anteriores en este plan).
- No produce ninguna interfaz nueva para otras tareas — este plan tiene una sola tarea. La forma del mensaje `{ type: 'result', text, chunks }` que ya consumen `useTranscription.ts` e `index.vue` no cambia.

Este archivo no tiene test unitario directo (ver Global Constraints): la pipeline de transcripción (`pipeline(...)`, `asr(...)`) requiere un navegador real. Su corrección se verifica leyendo el código, con la suite completa + typecheck, y con una verificación manual en navegador — igual que en fases anteriores.

- [ ] **Step 1: Añadir las constantes de chunking**

En `app/workers/whisper.worker.ts`, las líneas 1-7 actuales son:

```ts
import { pipeline, type AutomaticSpeechRecognitionPipeline, type ProgressInfo } from '@huggingface/transformers'
import { getModelRepoId, type WhisperModelSize } from '../utils/whisperModels'
import type { WhisperWorkerRequest, WhisperWorkerResponse, WhisperChunk } from './whisper.types'

let transcriber: AutomaticSpeechRecognitionPipeline | null = null
let loadedModelSize: WhisperModelSize | null = null

function post(message: WhisperWorkerResponse) {
```

Cambiar las líneas 5-6 (las dos declaraciones `let`) de:
```ts
let transcriber: AutomaticSpeechRecognitionPipeline | null = null
let loadedModelSize: WhisperModelSize | null = null
```
a:
```ts
let transcriber: AutomaticSpeechRecognitionPipeline | null = null
let loadedModelSize: WhisperModelSize | null = null

// Valores recomendados por la documentación de @huggingface/transformers para
// audio de más de 30s: sin esto, WhisperFeatureExtractor trunca el audio a los
// primeros 30 segundos y descarta el resto antes de que llegue al modelo.
const CHUNK_LENGTH_S = 30
const STRIDE_LENGTH_S = 5
```

- [ ] **Step 2: Pasar las constantes a la llamada `asr(...)`**

En el mismo archivo, la línea 52 actual es:
```ts
    const output = await asr(audio, { return_timestamps: true })
```

Cambiarla a:
```ts
    const output = await asr(audio, {
      return_timestamps: true,
      chunk_length_s: CHUNK_LENGTH_S,
      stride_length_s: STRIDE_LENGTH_S,
    })
```

- [ ] **Step 3: Tipar el proyecto**

Run: `pnpm dlx nuxi typecheck`
Expected: sin errores

- [ ] **Step 4: Ejecutar la suite unitaria completa**

Run: `pnpm test`
Expected: PASS (todos los tests pasan, sin regresiones — este archivo no tiene tests propios, pero no debe romper ningún otro; ningún test usa el pipeline real)

- [ ] **Step 5: Ejecutar la suite E2E**

Run: `pnpm test:e2e`
Expected: PASS (4 tests passed) — el `FakeWhisperWorker` de `tests/e2e/transcription-flow.spec.ts` no usa la pipeline real de Whisper, así que no se ve afectado por este cambio.

- [ ] **Step 6: Verificación manual en navegador**

Levantar la app (`pnpm dev`), grabar o importar un audio de más de 30 segundos (idealmente la misma canción que reveló el problema original), y transcribirlo. Confirmar:
- El último `timestamp` de los chunks devueltos (visible exportando a SRT/VTT desde el `ExportMenu`, o inspeccionando `transcriptionChunks` en las devtools) cubre cerca del final de la duración real del audio, no solo los primeros ~30 segundos.
- La consola del navegador ya no muestra el aviso `"Attempting to extract features for audio longer than 30 seconds..."` que aparecía antes de este cambio.

- [ ] **Step 7: Commit**

```bash
git add app/workers/whisper.worker.ts
git commit -m "Corrige el truncado a 30s pasando chunk_length_s/stride_length_s al pipeline de Whisper"
```

---
