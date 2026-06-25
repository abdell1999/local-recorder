# Diarización — fase 3: embeddings + clustering — diseño

## Contexto

Fase 2 (`2026-06-24-diarizacion-segmentacion-trozeada-design.md`, ya
implementada) produce `LocalSpeakerSegment[]` — segmentos con
`localSpeakerId` (0=sin voz, 1-3=hablante local individual, 4-6=solape de
dos hablantes) y timestamps absolutos, pero **sin identidad consistente
entre ventanas**: "hablante 1" en la ventana 0 no tiene por qué ser la
misma persona que "hablante 1" en la ventana 3. Esta fase resuelve eso
extrayendo un *embedding* de voz por segmento (con el modelo
`onnx-community/wespeaker-voxceleb-resnet34-LM`, ya confirmado compatible
con `transformers.js` en el spike de la fase 1 — carga vía
`AutoModel`/`AutoProcessor`, salida `last_hidden_state` de 256
dimensiones) y agrupándolos por similitud para asignar un
`globalSpeakerId` consistente en todo el audio.

## Alcance

1. Extender `speakerSegmentation.worker.ts` para cargar también el
   modelo de embeddings y, tras la segmentación, extraer un embedding por
   cada segmento de hablante individual (no solapado) y asignarle un
   `globalSpeakerId` por clustering.
2. Función pura de clustering por similitud de coseno, sin dependencias
   externas, testeable con vectores sintéticos.
3. Actualizar el protocolo del worker y el composable
   `useSpeakerSegmentation` para exponer `globalSpeakerId`.

### Fuera de alcance (decisión explícita)

- **Sin identidad para segmentos de solape (`localSpeakerId` 4-6).**
  Separar las voces de un solape requiere separación de fuentes, un
  problema mucho mayor — quedan con `globalSpeakerId: null`.
- **Sin identidad para segmentos sin voz (`localSpeakerId` 0).** No hay
  voz que embeber — quedan con `globalSpeakerId: null`.
- **Sin calibración real del umbral de similitud.** Se documenta un valor
  de partida razonable según la literatura de verificación de hablante con
  embeddings ResNet (~0.5 de similitud de coseno), pero no hay forma de
  calibrarlo con precisión sin grabaciones reales de varias personas en
  este entorno — **mejor esfuerzo**, no un valor verificado
  empíricamente para este proyecto.
- **Sin UI.** Eso es la fase 4 (igual que ya se decidió en la fase 2).
- **Sin número de hablantes configurable por el usuario.** El clustering
  voraz determina el número de clusters automáticamente; no se pide al
  usuario cuántos hablantes esperar.
- **Sin reconsiderar asignaciones ya hechas.** El clustering es voraz y
  de una sola pasada en orden cronológico — no hay una segunda pasada que
  reasigne segmentos tras ver el resto del audio (un clustering jerárquico
  completo sería más preciso pero más complejo; queda para una iteración
  futura si el umbral fijo resulta insuficiente en uso real).

## Componentes y responsabilidades

- **`app/utils/speakerClustering.ts`** (nuevo, puro, testeable):
  ```ts
  export function cosineSimilarity(a: Float32Array, b: Float32Array): number

  export function clusterEmbeddings(
    embeddings: Float32Array[],
    threshold: number,
  ): number[]
  ```
  `clusterEmbeddings` recorre `embeddings` en orden (el orden de entrada
  es significativo: debe ser el orden cronológico de los segmentos), y
  para cada uno calcula la similitud de coseno contra el **centroide**
  (promedio acumulado) de cada cluster ya creado. Si la mejor similitud
  encontrada es `>= threshold`, asigna ese índice de cluster y actualiza
  el centroide (promedio incremental); si no, crea un cluster nuevo con
  ese embedding como primer miembro. Devuelve un array del mismo largo
  que `embeddings`, con el índice de cluster (0, 1, 2...) de cada uno.
  Centroides representados internamente como `{ sum: Float32Array, count:
  number }` — el centroide real es `sum[i] / count`, recalculado al
  vuelo en cada comparación (sin normalizar `sum` tras cada suma, para no
  perder precisión por redondeos repetidos).

- **`app/workers/speakerSegmentation.types.ts`** (modificado): añade el
  nuevo estado de progreso y el campo `globalSpeakerId`:
  ```ts
  export interface SegmentationProgressMessage {
    type: 'progress'
    status: 'loading-model' | 'segmenting' | 'identifying-speakers'
  }

  export interface SpeakerSegment extends LocalSpeakerSegment {
    globalSpeakerId: number | null
  }

  export interface SegmentationResultMessage {
    type: 'result'
    segments: SpeakerSegment[]
  }
  ```
  `LocalSpeakerSegment` no cambia — sigue siendo la forma "sin identidad
  global" que ya usan los tests de la fase 2. `SpeakerSegment` la extiende
  añadiendo el campo nuevo.

- **`app/workers/speakerSegmentation.worker.ts`** (modificado):
  - Nueva constante `EMBEDDING_MODEL_ID =
    'onnx-community/wespeaker-voxceleb-resnet34-LM'` y `SPEAKER_SIMILARITY_THRESHOLD = 0.5`.
  - Nueva función `getEmbeddingModelAndProcessor()`, mismo patrón que
    `getModelAndProcessor()` ya existente (heurística `device`/`dtype`,
    `device: 'auto'`, `createProgressAggregator`), pero para
    `AutoModel.from_pretrained(EMBEDDING_MODEL_ID, ...)` +
    `AutoProcessor.from_pretrained(EMBEDDING_MODEL_ID)`. Se llama de forma
    perezosa: solo si hay al menos un segmento individual (1-3) que
    embeber — un audio sin voz o solo con solape no descarga este segundo
    modelo en absoluto.
  - En `self.onmessage`, tras calcular `segments` (lógica de la fase 2,
    sin cambios):
    ```ts
    const individualSegments = segments
      .map((segment, index) => ({ segment, index }))
      .filter(({ segment }) => segment.localSpeakerId >= 1 && segment.localSpeakerId <= 3)
    const globalIdByIndex = new Map<number, number>()

    if (individualSegments.length > 0) {
      post({ type: 'progress', status: 'identifying-speakers' })
      const { embeddingModel, embeddingProcessor } = await getEmbeddingModelAndProcessor()

      const embeddings: Float32Array[] = []
      for (const { segment } of individualSegments) {
        const startSample = Math.round(segment.start * SAMPLE_RATE)
        const endSample = Math.round(segment.end * SAMPLE_RATE)
        const segmentAudio = audio.subarray(startSample, endSample)
        const inputs = await embeddingProcessor(segmentAudio)
        const { last_hidden_state } = await embeddingModel(inputs)
        embeddings.push(Float32Array.from(last_hidden_state.data as Float32Array))
      }

      const clusterIds = clusterEmbeddings(embeddings, SPEAKER_SIMILARITY_THRESHOLD)
      individualSegments.forEach(({ index }, i) => {
        globalIdByIndex.set(index, clusterIds[i])
      })
    }

    const resultSegments: SpeakerSegment[] = segments.map((segment, index) => ({
      ...segment,
      globalSpeakerId: globalIdByIndex.get(index) ?? null,
    }))

    post({ type: 'result', segments: resultSegments })
    ```
  - Importa `clusterEmbeddings` de `../utils/speakerClustering` y
    `AutoModel` de `@huggingface/transformers` (ya se importan
    `AutoModelForAudioFrameClassification`/`AutoProcessor` de ahí).

- **`app/composables/useSpeakerSegmentation.ts`** (modificado):
  - `segments = shallowRef<SpeakerSegment[]>([])` (antes
    `LocalSpeakerSegment[]`), importando `SpeakerSegment` en vez de (o
    junto a) `LocalSpeakerSegment`.
  - `SpeakerSegmentationState` gana `'identifying-speakers'`:
    ```ts
    export type SpeakerSegmentationState = 'idle' | 'loading-model' | 'segmenting' | 'identifying-speakers' | 'done' | 'error'
    ```
  - Sin más cambios — `state.value = message.status` y el resto del
    flujo ya manejan cualquier string de estado nuevo sin lógica
    adicional.

## Flujo de datos

```
useSpeakerSegmentation.segment(lastAudio)
              ▼
speakerSegmentation.worker.ts
              │
   (igual que fase 2: computeWindows + modelo de segmentación)
              ▼
   segments: LocalSpeakerSegment[]  (con localSpeakerId 0-6)
              │
   filtra localSpeakerId 1-3 ──► individualSegments
              │
   ¿hay alguno?  No ──────────────────────────┐
       │ Sí                                    │
       ▼                                        │
   getEmbeddingModelAndProcessor()              │
   (carga perezosa, solo si hace falta)         │
       │                                        │
   por cada segmento individual:                │
     recorta audio[start*16000, end*16000)       │
     embeddingProcessor → embeddingModel         │
     → embedding (256-dim)                       │
       │                                        │
   clusterEmbeddings(embeddings, 0.5)            │
   → globalSpeakerId por segmento                │
       │                                        │
       └──────────────► fusiona con segments ◄───┘
                              │
                              ▼
              post({type:'result', segments})
              (SpeakerSegment[], con globalSpeakerId)
```

## Manejo de errores

Mismo patrón que el resto del worker: cualquier fallo (descarga del
segundo modelo, inferencia de embeddings) cae en el mismo `try/catch` de
`self.onmessage` → `{type:'error', message}`. No hay manejo especial para
"el clustering falló" — `clusterEmbeddings` es una función pura
determinista sin estados de error (un array vacío de embeddings produce
un array vacío de asignaciones, no una excepción).

## Testing

- **`speakerClustering.test.ts`** (nuevo): `cosineSimilarity` con
  vectores idénticos (similitud 1), ortogonales (similitud 0), opuestos
  (similitud -1). `clusterEmbeddings`: un solo embedding → un cluster;
  dos embeddings muy similares (vectores casi idénticos) → mismo cluster;
  dos embeddings muy distintos (vectores ortogonales) → clusters
  distintos; tres embeddings donde el primero y el tercero son similares
  entre sí pero el segundo es distinto → clusters `[0, 1, 0]`; array vacío
  → array vacío.
- **`useSpeakerSegmentation.test.ts`** (modificado): el fixture
  `resultSegments` usado en el test de "reflects progress and result
  messages" pasa a incluir `globalSpeakerId` para que coincida con la
  forma real de `SpeakerSegment` (cambio cosmético, el test en sí no
  cambia de comportamiento). Nuevo test: el worker puede reportar
  `status: 'identifying-speakers'` y el composable lo refleja en
  `state.value` igual que cualquier otro estado.
- **`speakerSegmentation.worker.ts`**: sin test unitario directo (igual
  que siempre, requiere navegador real para los modelos) — se verifica
  por lectura de código.
- **Verificación manual (spike temporal):** mismo patrón que las fases
  1-2 — worker real en navegador, con `lastAudio`. **Limitación honesta:**
  solo se puede verificar la *mecánica* (el segundo modelo carga, se
  extraen embeddings con la forma esperada de 256 dimensiones, el
  clustering corre y produce `globalSpeakerId` consistentes con el número
  de segmentos), no la corrección *semántica* del umbral (si voces reales
  distintas de verdad se separan en clusters distintos) — no hay
  grabaciones de varias personas disponibles en este entorno para
  comprobar eso. Se documenta como limitación conocida, no como tarea
  pendiente de esta fase.

## Extensiones futuras

Fase 4 (integración en la UI: mostrar "Hablante 1:"/"Hablante 2:"
alineado con los chunks de la transcripción) sigue sin diseñar. Si en uso
real el umbral fijo de 0.5 resulta impreciso, una iteración futura podría
sustituir el clustering voraz por uno jerárquico completo, o exponer el
umbral como constante ajustable con datos reales. El resto de la lista de
extensiones futuras del proyecto no cambia.
