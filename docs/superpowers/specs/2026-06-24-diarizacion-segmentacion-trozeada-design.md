# Diarización — fase 2: segmentación troceada — diseño

## Contexto

Esta es la fase 2 de la diarización (ver
`2026-06-24-diarizacion-spike-embeddings-design.md` para la fase 1, ya
confirmada: el modelo de embeddings de hablante carga y funciona vía
`transformers.js`). El modelo de segmentación,
`onnx-community/pyannote-segmentation-3.0`, solo procesa ventanas fijas de
10 segundos de audio — no puede diarizar un archivo completo en una sola
llamada. Esta fase implementa el troceo del audio en ventanas con solape y
la llamada al modelo por ventana, produciendo segmentos de hablante
**locales** (sin identidad consistente entre ventanas — eso es la fase 3,
embeddings + clustering, que no se diseña aquí).

## Alcance

1. Función pura que calcula los offsets de las ventanas (10s, paso de 5s,
   50% de solape) sobre un audio de longitud arbitraria.
2. Worker que carga el modelo de segmentación y, para cada ventana,
   ejecuta la inferencia y postprocesa la salida a segmentos con
   timestamps absolutos (no relativos a la ventana).
3. Composable que envuelve el worker con el mismo patrón de estado,
   progreso de descarga y reintento ya usado en `useTranscription`/
   `useSummarizer`.
4. Verificación manual mediante un spike temporal (igual que el de la
   fase 1), eliminado al terminar.

### Fuera de alcance (decisión explícita)

- **Sin extracción de audio ni embeddings por segmento.** Eso es trabajo
  de la fase 3, que recortará `lastAudio` usando los timestamps que
  produce esta fase.
- **Sin resolución de identidad global de hablante.** `localSpeakerId` no
  significa lo mismo en dos ventanas distintas — es exactamente el
  problema que resuelve la fase 3.
- **Sin UI.** Eso es la fase 4. Esta fase termina en un composable
  funcional sin ningún componente que lo consuma todavía.
- **Sin ventana/paso configurables por el usuario.** Constantes fijas
  (10s/5s), igual que `CHUNK_LENGTH_S`/`STRIDE_LENGTH_S` en
  `whisper.worker.ts`.
- **Sin filtrar segmentos o ventanas demasiado cortas.** La ventana final
  de un audio que no encaja exacto puede ser más corta que 10s y se
  procesa igual, sin caso especial.

## Componentes y responsabilidades

- **`app/utils/audioWindows.ts`** (nuevo, puro, testeable):
  ```ts
  export interface AudioWindow {
    start: number // offset en muestras
    end: number   // offset en muestras (exclusivo)
  }

  export function computeWindows(
    totalSamples: number,
    sampleRate: number,
    windowSeconds: number,
    stepSeconds: number,
  ): AudioWindow[]
  ```
  Si `totalSamples` es menor o igual que una ventana completa, devuelve
  una única ventana `[0, totalSamples)` y termina ahí (caso especial,
  necesario para no generar una segunda ventana solapada minúscula).
  En otro caso, genera ventanas `[0, windowSamples)`, `[stepSamples,
  stepSamples + windowSamples)`, etc., recortando `end` a `totalSamples`
  cuando se saldría del audio; **la condición de parada es que la ventana
  actual ya llegue exactamente al final del audio** (`end ===
  totalSamples`), no que el siguiente `start` se pase de `totalSamples` —
  así la última ventana puede quedar más corta que `windowSamples` pero
  nunca se genera una ventana extra redundante tras alcanzar el final.

- **`app/workers/speakerSegmentation.types.ts`** (nuevo), protocolo
  análogo a `whisper.types.ts`:
  ```ts
  export interface SegmentRequest {
    type: 'segment'
    audio: Float32Array
  }
  export interface SegmentationProgressMessage {
    type: 'progress'
    status: 'loading-model' | 'segmenting'
  }
  export interface SegmentationDeviceMessage {
    type: 'device'
    device: 'webgpu' | 'wasm'
  }
  export interface SegmentationModelProgressMessage {
    type: 'model-download-progress'
    percent: number
  }
  export interface LocalSpeakerSegment {
    windowIndex: number
    localSpeakerId: number // 0=sin voz, 1-3=hablante local, 4-6=combinaciones de solape
    start: number // segundos, absolutos dentro de todo el audio
    end: number    // segundos, absolutos dentro de todo el audio
    confidence: number
  }
  export interface SegmentationResultMessage {
    type: 'result'
    segments: LocalSpeakerSegment[]
  }
  export interface SegmentationErrorMessage {
    type: 'error'
    message: string
  }
  export type SpeakerSegmentationWorkerRequest = SegmentRequest
  export type SpeakerSegmentationWorkerResponse =
    | SegmentationProgressMessage
    | SegmentationDeviceMessage
    | SegmentationModelProgressMessage
    | SegmentationResultMessage
    | SegmentationErrorMessage
  ```

- **`app/workers/speakerSegmentation.worker.ts`** (nuevo): carga
  `AutoModelForAudioFrameClassification.from_pretrained('onnx-community/pyannote-segmentation-3.0')`
  y `AutoProcessor.from_pretrained(...)`, con el mismo patrón de detección
  de `device` y `createProgressAggregator` (de
  `app/utils/modelDownloadProgress.ts`, fase de resumen LLM) ya usado en
  los otros workers. Al recibir `{type: 'segment', audio}`:
  1. Calcula `computeWindows(audio.length, 16000, 10, 5)`.
  2. Para cada ventana: recorta `audio.subarray(start, end)`, lo procesa
     con el processor, ejecuta el modelo, y llama a
     `processor.post_process_speaker_diarization(logits, windowAudio.length)`
     (método ya integrado en `@huggingface/transformers`, confirmado en
     el spike de la fase 1 — bueno, en realidad confirmado ahora por
     lectura directa de su código fuente en `node_modules`, ver sección
     de verificación técnica).
  3. Suma `start / 16000` (el offset de la ventana en segundos) a cada
     `start`/`end` que devuelve el postprocesado, para convertir de
     "relativo a la ventana" a "absoluto dentro de todo el audio".
  4. Acumula todos los segmentos de todas las ventanas en un único array
     plano, cada uno con su `windowIndex`.
  5. Postea `{type: 'result', segments}`.
  Errores (descarga, inferencia) caen en el mismo patrón `try/catch` →
  `{type: 'error', message}` que el resto de workers.

- **`app/composables/useSpeakerSegmentation.ts`** (nuevo), mismo patrón
  que `useTranscription`/`useSummarizer`:
  - Estado `'idle' | 'loading-model' | 'segmenting' | 'done' | 'error'`.
  - Refs: `state`, `segments: Ref<LocalSpeakerSegment[]>`, `errorMessage`,
    `device`, `downloadProgress`.
  - `segment(audio: Float32Array)`: clona el audio (`audio.slice()`) y lo
    postea con `transfer: [transferable.buffer]` — mismo patrón que
    `transcribe()` en `useTranscription.ts` — para que el `audio`
    original que recibió la función siga íntegro y reutilizable (la fase
    3 necesitará recortar el mismo `lastAudio` más adelante).
  - `retry(audio: Float32Array)`: termina el worker actual y vuelve a
    llamar `segment`.

## Verificación técnica del postprocesado (hecha durante este diseño)

Se confirmó leyendo
`node_modules/@huggingface/transformers/src/models/pyannote/feature_extraction_pyannote.js`
que `post_process_speaker_diarization(logits, num_samples)` ya hace
exactamente el trabajo de "argmax por frame + agrupar frames consecutivos
del mismo hablante en segmentos + convertir de espacio-de-frames a
espacio-de-tiempo" — no hay que reimplementar nada de eso, solo llamarlo
por ventana y sumar el offset.

## Flujo de datos

```
useSpeakerSegmentation.segment(lastAudio)
              │ (clona + transfiere, lastAudio original intacto)
              ▼
speakerSegmentation.worker.ts
              │
   computeWindows(audio.length, 16000, 10, 5)
              │
   ┌──────────┴──────────┐
   ▼                      ▼
 ventana 0              ventana 1, 2, ...
   │                      │
 AutoModelForAudioFrameClassification + processor.post_process_speaker_diarization
   │                      │
 segmentos (tiempos relativos a la ventana)
   │                      │
   └── + offset ventana ──┘
              │
              ▼
   post({type:'result', segments})  ── array plano, con windowIndex
              │
              ▼
   useSpeakerSegmentation.segments (Ref<LocalSpeakerSegment[]>)
```

Sin conexión a `index.vue` en esta fase — el composable queda listo para
que la fase 4 lo consuma.

## Manejo de errores

Mismo patrón que el resto de workers: cualquier fallo (descarga,
inferencia) cae en `state = 'error'` con un `errorMessage`. Sin UI en esta
fase, así que no hay un botón "Reintentar" visible todavía — la función
`retry` del composable existe y está testeada, pero su consumo en pantalla
llega en la fase 4.

## Testing

- **`audioWindows.test.ts`** (nuevo): audio que encaja en un número exacto
  de ventanas; audio cuya última ventana queda más corta que 10s; audio
  más corto que una ventana completa (debe devolver una sola ventana
  recortada a la longitud real); audio que produce exactamente 1 ventana
  cuando `totalSamples === windowSamples`.
- **`useSpeakerSegmentation.test.ts`** (nuevo): mirror de
  `useTranscription.test.ts` — transición a `loading-model` y `postMessage`
  con clonado+transferencia (mismo test que ya existe para `transcribe()`,
  adaptado); refleja `progress`/`device`/`model-download-progress`/
  `result`/`error`; resetea `downloadProgress` en los puntos ya
  establecidos; `retry` termina el worker anterior y crea uno nuevo.
- **`speakerSegmentation.worker.ts`**: sin test unitario directo (requiere
  navegador real para el modelo), igual que el resto de workers — se
  verifica por lectura de código.
- **Verificación manual (spike temporal):** worker + botón temporal en
  `index.vue` (como el de la fase 1), usando `lastAudio` ya grabado o
  importado. Se confirma en navegador que el número de ventanas calculado
  coincide con la duración del audio, que los `localSpeakerId` están en el
  rango 0-6, y que los timestamps de los segmentos son crecientes y caben
  dentro de la duración total. Se elimina el botón/arnés al terminar de
  verificar — el worker, el composable y `audioWindows.ts` quedan como
  código de producción.

## Extensiones futuras

Fase 3 (embeddings + clustering, para identidad global de hablante
consistente en todo el audio) y fase 4 (integración en la UI: mostrar
"Hablante 1:"/"Hablante 2:" alineado con los chunks de la transcripción),
ambas sin diseñar todavía. El resto de la lista de extensiones futuras del
proyecto (resumen LLM, captura de pestaña — ya implementadas; persistencia
cifrada, soporte RTL/japonés, streaming, fallback ffmpeg.wasm) no cambia.
