# Resumen con LLM local — diseño

## Contexto

El README (`README.md:25`) lista "Resumen IA local: Generación de TL;DR y
puntos clave con un LLM pequeño en cliente" como parte de la "Fase 2 —
Inteligencia". El selector de tamaño de modelo y la captura de audio de
pestaña, los otros dos puntos de esa fase, ya están implementados. Esta
fase cierra el último punto pendiente: generar un resumen (TL;DR + puntos
clave) de la transcripción, usando un segundo modelo —un LLM pequeño,
distinto de Whisper— ejecutándose también localmente en el navegador vía
`@huggingface/transformers`.

## Alcance

1. Botón manual "Resumir", disponible una vez la transcripción está lista
   y tiene texto (no en el caso de "no se detectó voz").
2. Selector de tamaño de LLM con 2 opciones verificadas:
   `onnx-community/Qwen2.5-0.5B-Instruct` (por defecto) y
   `onnx-community/Qwen2.5-1.5B-Instruct`.
3. El resumen se genera con formato fijo (TL;DR + lista de puntos clave),
   en el mismo idioma que la transcripción, y es editable en su propio
   textarea.
4. Reutiliza el patrón ya existente de progreso de descarga y manejo de
   errores/reintento de la transcripción Whisper.

### Fuera de alcance (decisión explícita)

- **Sin exportación del resumen.** Por ahora solo se ve y edita en
  pantalla; no se añade a `ExportMenu` ni se ofrece una descarga propia.
- **Sin troceo de transcripciones muy largas.** Los modelos Qwen2.5
  soportan un contexto generoso; no se implementa resumen por partes ni
  truncado explícito del texto de entrada en esta fase.
- **Sin liberar el worker de Whisper al resumir.** Ambos modelos pueden
  estar cargados en memoria a la vez tras una transcripción+resumen en la
  misma sesión; no se optimiza el pico de memoria combinado, mismo
  criterio que otras decisiones de memoria ya diferidas en fases previas
  (ver `2026-06-22-fase2-cierre-gaps-design.md`).
- **Sin control programático de idioma de salida.** Se instruye al modelo
  por prompt a responder en el mismo idioma que el texto de entrada, sin
  detección de idioma explícita ni parámetro de configuración.
- **Sin cancelación a media generación.** Igual que la transcripción: una
  vez iniciada, se espera a que termine o falle.
- **Sin tercer tamaño de LLM (~3B).** Se intentó verificar un modelo
  Qwen2.5-Instruct (no "Coder") de ~3B en `onnx-community`; no se pudo
  confirmar su existencia. Solo se usan los dos tamaños verificados.

## Componentes y responsabilidades

- **`app/utils/llmModels.ts`** (nuevo): `LlmModelSize = '0.5b' | '1.5b'`;
  `LLM_MODELS: Record<LlmModelSize, string>` mapeando a
  `onnx-community/Qwen2.5-0.5B-Instruct` / `-1.5B-Instruct`;
  `getLlmModelRepoId(size: LlmModelSize): string`. Los tamaños se nombran
  por su número de parámetros (no `tiny`/`small` como Whisper) para no
  confundirlos al leer código que importa ambos tipos a la vez.

- **`app/composables/useLlmModelSelector.ts`** (nuevo): mismo patrón que
  `useModelSelector.ts` — persistencia en `localStorage` con clave propia
  `local-recorder:llm-model-size`, valor por defecto `'0.5b'` (más
  rápido/ligero, al ser una segunda descarga de modelo opcional encima de
  Whisper). Expone `{ modelSize, setModelSize }`.

- **`app/components/settings/LlmModelSizePicker.vue`** (nuevo): mismo
  patrón que `ModelSizePicker.vue` — `<select>` con las 2 opciones de
  `LLM_MODELS`, props `modelValue: LlmModelSize` y `disabled?: boolean`,
  emite `update:modelValue`. `data-testid="llm-model-size-picker"`.

- **`app/utils/modelDownloadProgress.ts`** (nuevo): extrae la lógica de
  agregación de progreso ya existente en `whisper.worker.ts` (`Map<string,
  {loaded, total}>` por archivo, recalcula porcentaje global, solo invoca
  el callback cuando el valor redondeado cambia) en una función pura:
  ```ts
  export function createProgressAggregator(onPercent: (percent: number) => void) {
    const fileBytes = new Map<string, { loaded: number; total: number }>()
    let lastPostedPercent = -1
    return function onProgress(info: ProgressInfo) {
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
        onPercent(percent)
      }
    }
  }
  ```
  `whisper.worker.ts` se modifica para usar
  `createProgressAggregator((percent) => post({ type: 'model-download-progress', percent }))`
  en vez de su copia inline — esta fase introduciría, si no se hace esto,
  una duplicación exacta de esa lógica en `summarizer.worker.ts`.

- **`app/workers/summarizer.types.ts`** (nuevo), protocolo análogo a
  `whisper.types.ts`:
  ```ts
  export interface SummarizeRequest {
    type: 'summarize'
    text: string
    modelSize: LlmModelSize
  }
  export interface SummaryProgressMessage {
    type: 'progress'
    status: 'loading-model' | 'summarizing'
  }
  export interface SummaryDeviceMessage {
    type: 'device'
    device: 'webgpu' | 'wasm'
  }
  export interface SummaryModelProgressMessage {
    type: 'model-download-progress'
    percent: number
  }
  export interface SummaryResultMessage {
    type: 'result'
    summary: string
  }
  export interface SummaryErrorMessage {
    type: 'error'
    message: string
  }
  export type SummarizerWorkerRequest = SummarizeRequest
  export type SummarizerWorkerResponse =
    | SummaryProgressMessage
    | SummaryDeviceMessage
    | SummaryModelProgressMessage
    | SummaryResultMessage
    | SummaryErrorMessage
  ```

- **`app/workers/summarizer.worker.ts`** (nuevo): carga
  `pipeline('text-generation', getLlmModelRepoId(modelSize), { device,
  progress_callback })` (mismo patrón de detección de `device`
  webgpu/wasm que `whisper.worker.ts`). Al recibir `{type: 'summarize',
  text, modelSize}`:
  1. Posta `{type: 'progress', status: 'loading-model'}` y `{type:
     'device', device}` (si el generador del tamaño pedido no está ya
     cargado).
  2. Posta `{type: 'progress', status: 'summarizing'}`.
  3. Construye los mensajes de chat:
     ```ts
     const messages = [
       {
         role: 'system',
         content:
           'Eres un asistente que resume transcripciones de audio. Responde ' +
           'siempre en el mismo idioma que el texto proporcionado. Usa ' +
           'exactamente este formato:\n\nTL;DR: <resumen de 2-3 frases>\n\n' +
           'Puntos clave:\n- <punto>\n- <punto>...',
       },
       { role: 'user', content: text },
     ]
     ```
  4. Llama `await generator(messages, { max_new_tokens: 256, do_sample: false })`.
  5. La salida con entrada de chat es el array de mensajes completo con el
     turno `assistant` añadido al final (comportamiento confirmado en el
     código fuente de `@huggingface/transformers`: con `isChatInput`,
     `generated_text` es `[...mensajesOriginales, {role:'assistant',
     content: <texto generado>}]`). El worker extrae el resumen con
     `const resultMessages = output[0].generated_text; const summary =
     resultMessages[resultMessages.length - 1].content`.
  6. Posta `{type: 'result', summary}`.
  Errores (descarga, generación) caen en el mismo `try/catch` →
  `{type: 'error', message}` que el patrón de `whisper.worker.ts`.

- **`app/composables/useSummarizer.ts`** (nuevo), mismo patrón que
  `useTranscription.ts`:
  - Estado `SummarizerState = 'idle' | 'loading-model' | 'summarizing' |
    'done' | 'error'`.
  - Refs: `state`, `summary: Ref<string>`, `errorMessage`, `device`,
    `downloadProgress`.
  - `summarize(text: string, modelSize: LlmModelSize)`: postea `{type:
    'summarize', text, modelSize}` (sin necesidad de clonar/transferir —
    es un `string`, no un `Float32Array`, no aplica la optimización de
    `transfer` que sí usa `transcribe()`).
  - `retry(text: string, modelSize: LlmModelSize)`: termina el worker
    actual y vuelve a llamar `summarize`, igual que en `useTranscription`.

- **`app/components/summary/SummaryEditor.vue`** (nuevo): idéntico a
  `TranscriptEditor.vue` (textarea con `v-model`), con
  `data-testid="summary-editor"` propio.

- **`app/pages/index.vue`** (modificado): cuando `transcriptionState ===
  'done'` y `editedText.trim() !== ''` (la misma condición que ya decide
  si se muestra el editor/exportador de transcripción):
  - Añade `LlmModelSizePicker` (v-model sobre `llmModelSize` de
    `useLlmModelSelector()`) y un botón `data-testid="summarize-button"`
    con texto "Resumir", deshabilitados mientras
    `summarizerState === 'loading-model' || summarizerState === 'summarizing'`.
  - Mensajes de estado: `status-loading-model-llm`/`status-summarizing-llm`
    (mismo texto que los de transcripción, adaptado), barra de progreso de
    descarga reutilizando el mismo patrón `<progress>` ya existente
    (`data-testid="llm-download-progress"`).
  - Mensaje de error + botón "Reintentar" (`data-testid="summarize-error"`
    / `data-testid="summarize-retry-button"`) cuando
    `summarizerState === 'error'`, llamando a
    `retry(editedText, llmModelSize)`.
  - `<SummaryEditor v-model="editedSummary" />` cuando
    `summarizerState === 'done'`, poblado desde `summary` igual que
    `editedText` se puebla desde `transcriptionText` (mismo patrón de
    `watch`).

## Flujo de datos

```
Click "Resumir" ──► summarize(editedText, llmModelSize)
                              │
                              ▼
        summarizer.worker.ts: pipeline('text-generation', repoId)
                              │
              ┌───────────────┴────────────────┐
              ▼                                 ▼
     descarga del modelo                  modelo ya cargado
   (createProgressAggregator,                   │
    igual que Whisper)                           │
              │                                 │
              ▼                                 ▼
   generator(chatMessages, {max_new_tokens:256, do_sample:false})
                              │
                              ▼
   output[0].generated_text (array de mensajes) → último .content
                              │
                              ▼
            post({type:'result', summary})
                              │
                              ▼
   useSummarizer.summary (Ref<string>) ──► index.vue: editedSummary
                              │
                              ▼
                  <SummaryEditor v-model="editedSummary" />
```

El flujo de transcripción (grabación/importación/Whisper/exportación) no
cambia; este es un flujo paralelo e independiente que parte del texto ya
transcrito.

## Manejo de errores

Mismo patrón que transcripción: cualquier fallo (descarga, generación,
crash del worker) cae en `state = 'error'` con un `errorMessage`, mostrado
junto a un botón "Reintentar" que vuelve a invocar `summarize` con el
mismo texto y tamaño de modelo. `downloadProgress` se resetea a `null` en
los mismos puntos que en `useTranscription` (`progress`/`result`/`error`).

## Testing

- **`modelDownloadProgress.test.ts`** (nuevo): `createProgressAggregator`
  con eventos de varios archivos simultáneos, verifica el porcentaje
  global agregado y que `onPercent` solo se invoca cuando el valor
  redondeado cambia (no en cada evento redundante).
- **`whisper.worker.ts`**: tras refactorizar para usar
  `createProgressAggregator`, sigue sin test unitario directo (requiere
  navegador real); se verifica por lectura de código que el
  comportamiento observable no cambia.
- **`summarizer.worker.ts`**: igual que `whisper.worker.ts`, sin test
  directo; se verifica por lectura de código, incluyendo la extracción
  correcta de `summary` del array de mensajes de chat devuelto.
- **`llmModels.test.ts`** / **`useLlmModelSelector.test.ts`** /
  **`LlmModelSizePicker.test.ts`** / **`SummaryEditor.test.ts`** (nuevos):
  mirror exacto de sus equivalentes ya existentes para Whisper
  (`whisperModels.test.ts`, `useModelSelector.test.ts`,
  `ModelSizePicker.test.ts`, `TranscriptEditor.test.ts`).
- **`useSummarizer.test.ts`** (nuevo): mirror de `useTranscription.test.ts`
  — transición a `loading-model` y mensaje `postMessage` correcto al
  llamar `summarize`; refleja `model-download-progress`; resetea
  `downloadProgress` en `progress`/`result`/`error`; `result` puebla
  `summary` y pasa a `done`; mensaje `error` pasa a `error`; `onerror` del
  worker pasa a `error` con `'worker-crashed'`; `retry` termina el worker
  anterior y crea uno nuevo.
- **`index.test.ts`** (extendido): `LlmModelSizePicker` y botón
  "Resumir" visibles solo cuando `transcriptionState === 'done'` y el
  texto no está vacío; ambos deshabilitados durante
  `loading-model`/`summarizing`; click en "Resumir" llama a `summarize`
  con `editedText` y el tamaño de LLM seleccionado; `SummaryEditor`
  aparece con el texto correcto cuando `summarizerState === 'done'`;
  mensaje de error + reintento cuando `summarizerState === 'error'`.
- Suite E2E (`transcription-flow.spec.ts`): sin cambios necesarios — no se
  añade un `FakeSummarizerWorker`; mismo criterio ya aplicado a la barra
  de progreso de descarga de Whisper (mantener el fake E2E mínimo).

## Extensiones futuras

Sin cambios respecto a la lista ya documentada en la Fase 1 (diarización,
persistencia cifrada, soporte RTL/japonés, streaming, fallback
ffmpeg.wasm), menos "resumen LLM local" (esta fase) y "captura de audio de
pestaña" (ya implementada), que se retiran de la lista. Quedan pendientes
de la Fase 3 del README: diarización, soporte árabe/japonés, persistencia
cifrada, exportación Markdown estructurada.
