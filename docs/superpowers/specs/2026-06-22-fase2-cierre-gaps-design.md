# Fase 2: cierre de gaps de Fase 1 — diseño

## Contexto

Fase 1 (grabación + importación + transcripción Whisper + edición + exportación,
ver `docs/superpowers/specs/2026-06-22-nuxt4-pwa-fase1-design.md`) quedó completa,
testeada y revisada. La revisión final de rama identificó tres mejoras "Important"
no bloqueantes que se dejaron deliberadamente pendientes para una fase posterior:

1. No existe ningún control en la UI para elegir el tamaño de modelo Whisper —
   `useModelSelector` ya persiste la elección en `localStorage`, pero
   `setModelSize` nunca se llama desde ningún componente.
2. No hay feedback de progreso durante la descarga del modelo (solo el texto
   estático "Descargando modelo…"), y el modelo por defecto (`small`, ~500MB)
   hace que la primera ejecución sea lenta sin ninguna indicación de avance.
3. El `Float32Array` de audio se copia (structured clone implícito) al postear
   el mensaje `transcribe` al worker, en vez de transferirse.

Esta fase cierra los tres puntos. No introduce ninguna superficie de producto
nueva (no es diarización, ni resumen, ni idiomas complejos — esas siguen en
"Extensiones futuras" del spec de Fase 1, sin tocar aquí).

## Alcance

1. Selector de tamaño de modelo visible en la UI, deshabilitado durante una
   transcripción en curso.
2. Barra de progreso agregada (un solo porcentaje global, no desglose por
   archivo) durante la descarga del modelo.
3. El audio se clona (`Float32Array.slice()`) antes de transferirse al worker,
   conservando el original para el flujo de reintento (`retry`).

### Fuera de alcance (decisión explícita)

- **Zero-copy real para `lastAudio`:** lograr que el hilo principal nunca
  retenga una copia completa del audio decodificado requeriría rediseñar
  `retry()` para re-decodificar desde el `Blob`/`File` original en vez de
  reutilizar el `Float32Array` ya decodificado — cambio más profundo en
  `useRecorder`/`useFileImport`/`index.vue`, descartado por el usuario a favor
  de la opción más simple (clonar+transferir) que no ahorra memoria pico pero
  evita que el motor del navegador haga su propio clonado interno.
- **Progreso desglosado por archivo:** se agrega un único porcentaje global en
  vez de mostrar cada archivo del modelo por separado.

## Stack y convenciones (sin cambios respecto a Fase 1)

- Nuxt 4, TypeScript, Tailwind CSS (sin librería de componentes), pnpm.
- Composables/componentes con imports explícitos de `vue`, no auto-imports.
- Commits: sin co-author, en español, siempre en `main` (`CLAUDE.md`).
- `nuxi typecheck` debe seguir pasando limpio (ya desbloqueado desde Fase 1,
  `nuxt` fijado en `4.3.1`).

## Componentes y responsabilidades

- **`app/components/settings/ModelSizePicker.vue`** (nuevo): `<select>` con las
  4 opciones de `WHISPER_MODELS` (tiny/base/small/medium). Prop `modelValue:
  WhisperModelSize`, prop `disabled?: boolean`, emite `update:modelValue`.
  Compatible con `v-model`.
- **`app/workers/whisper.types.ts`** (modificado): nuevo mensaje
  `WhisperModelProgressMessage { type: 'model-download-progress', percent:
  number }`, añadido a la unión `WhisperWorkerResponse`.
- **`app/workers/whisper.worker.ts`** (modificado): pasa un `progress_callback`
  a `pipeline(...)`. El callback recibe eventos `ProgressInfo` de
  transformers.js (`status: 'initiate'|'download'|'progress'|'done'|'ready'`,
  con `loaded`/`total` en bytes solo en `status: 'progress'`, por archivo). El
  worker mantiene un `Map<string, { loaded: number; total: number }>` keyed
  por `file`, actualizado en cada evento `progress`, y recalcula un porcentaje
  global como `Math.round(sum(loaded) / sum(total) * 100)`. Solo postea
  `model-download-progress` cuando ese valor redondeado cambia respecto al
  último valor posteado (evita inundar el canal de mensajes con eventos
  redundantes).
- **`app/composables/useTranscription.ts`** (modificado):
  - Nuevo ref `downloadProgress: Ref<number | null>`, `null` cuando no aplica.
  - Actualizado al recibir `model-download-progress`.
  - Reseteado a `null` al recibir `progress`/`transcribing`, `result`/`done`, o
    `error` (la descarga ya terminó o se abortó en los tres casos; sin este
    reseteo, una descarga fallida a mitad de camino dejaría la barra de
    progreso visible de forma huérfana, sin la línea "Descargando modelo…" que
    le daba contexto, junto al mensaje de error).
  - `transcribe()`/`retry()`: antes de `postMessage`, clona el audio recibido
    (`const transferable = audio.slice()`) y lo postea con
    `worker.postMessage({ type: 'transcribe', audio: transferable, modelSize },
    { transfer: [transferable.buffer] })`. El `audio` original que recibió la
    función nunca se transfiere — solo la copia — por lo que el llamador
    (`index.vue`, vía `lastAudio.value`) conserva un array íntegro y utilizable
    para un futuro `retry()`.
- **`app/pages/index.vue`** (modificado):
  - Añade `<ModelSizePicker v-model="modelSize" :disabled="transcriptionState
    === 'loading-model' || transcriptionState === 'transcribing'" />` junto al
    `RecordButton`/`FileDropzone`.
  - Añade `setModelSize` a la destructuración de `useModelSelector()` (hoy solo
    se usa `modelSize`).
  - Añade `<progress :value="downloadProgress" max="100"
    data-testid="model-download-progress" v-if="downloadProgress !== null">`
    bajo el texto de `status-loading-model`.

## Flujo de datos (progreso de descarga)

```
transformers.js (progress_callback, por archivo) ──┐
                                                     ├─► whisper.worker.ts: Map<file, {loaded,total}>
pipeline('automatic-speech-recognition', ..., { ────┘    │
  progress_callback })                                    ▼
                                          postMessage({type:'model-download-progress', percent})
                                                            │
                                                            ▼
                                    useTranscription.downloadProgress (Ref<number|null>)
                                                            │
                                                            ▼
                              index.vue: <progress :value="downloadProgress" max="100">
```

El flujo de transcripción/grabación/importación/exportación no cambia respecto
a Fase 1; este diagrama solo cubre la pieza nueva.

## Manejo de errores

Sin cambios respecto a Fase 1. El progreso de descarga es puramente
informativo: si la descarga falla, el worker sigue cayendo en el mismo
`{type: 'error'}` ya existente. `downloadProgress` se resetea a `null` en ese
camino (ver sección de componentes) para que la barra no quede visible sin
contexto junto al mensaje de error.

## Testing

- **`ModelSizePicker.test.ts`** (nuevo): renderiza las 4 opciones; emite
  `update:modelValue` al cambiar; respeta la prop `disabled` (el `<select>`
  queda deshabilitado en el DOM).
- **`useTranscription.test.ts`** (extendido): nuevo caso para el mensaje
  `model-download-progress` → `downloadProgress.value` se actualiza con el
  `percent` recibido; nuevo caso verificando que se resetea a `null` al
  recibir `progress`/`'transcribing'`, `result`/`'done'`, o `error`; nuevo caso
  verificando que `transcribe()` invoca `postMessage` con un segundo argumento
  `{ transfer: [...] }` y que el `audio` original pasado a `transcribe()` no es
  el mismo objeto que el campo `audio` del mensaje posteado (evidencia de que
  se clonó, no se transfirió el original).
- **`whisper.worker.ts`**: sigue sin test unitario directo (igual que Fase 1 —
  requiere navegador real para `pipeline`). La agregación de `percent` por
  archivo se verifica manualmente, igual que el resto del worker, en el mismo
  paso de verificación manual ya documentado en el plan de Fase 1.
- **`index.test.ts`** (extendido): nuevo caso verificando que
  `ModelSizePicker` recibe `disabled: true` cuando `transcriptionState` es
  `'loading-model'` o `'transcribing'`, y `disabled: false` en otros estados;
  nuevo caso verificando que la barra de progreso solo aparece cuando
  `downloadProgress !== null`.
- Suite E2E (`transcription-flow.spec.ts`): sin cambios necesarios — el
  `FakeWhisperWorker` ya simulado no necesita emitir progreso de descarga para
  que los 4 tests existentes sigan pasando; opcionalmente se podría extender el
  fake para emitir un `model-download-progress` antes del `result`, pero no es
  obligatorio para esta fase (decisión: no extenderlo, mantener el fake mínimo).

## Extensiones futuras

Sin cambios respecto a la lista de Fase 1 (diarización, resumen LLM,
persistencia cifrada, soporte RTL/japonés, streaming, fallback ffmpeg.wasm).
Ninguna de ellas se diseña ni se toca en esta fase.
