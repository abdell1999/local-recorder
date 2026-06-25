# Diarización — fase 4: integración en la UI — diseño

## Contexto

Las fases 1-3 de la diarización están implementadas y commitidas: la fase 2
(`pyannote-segmentation-3.0`) produce `LocalSpeakerSegment[]` con timestamps
absolutos y `localSpeakerId` por ventana; la fase 3 (`wespeaker-voxceleb-resnet34-LM`
+ clustering por similitud de coseno) asigna un `globalSpeakerId` consistente en todo
el audio a los segmentos individuales. El composable `useSpeakerSegmentation` expone
todo eso con sus estados de progreso y error. Sin embargo, **nada de esto está
conectado en `index.vue`**: el usuario no puede activarlo, y no existe ninguna vista
que muestre quién habló qué.

Esta fase añade el botón "Identificar hablantes" y una sección de lectura debajo de
la transcripción que agrupa el texto de Whisper por hablante.

## Alcance

1. Función pura `alignChunksWithSpeakers` que alinea los chunks de Whisper con los
   segmentos de diarización por solapamiento temporal y agrupa los chunks consecutivos
   del mismo hablante en bloques.
2. Componente de solo lectura `SpeakerTranscriptView.vue` que renderiza esos bloques.
3. Conexión en `index.vue`: botón "Identificar hablantes", estados de progreso, vista
   de resultado y manejo de error con reintento.

### Fuera de alcance (decisión explícita)

- **Sin edición de la vista de hablantes.** El textarea existente sigue siendo la
  fuente editable; la sección de hablantes es solo lectura.
- **Sin exportación enriquecida con hablantes.** El `ExportMenu` no cambia en esta
  fase.
- **Sin nombre personalizable de hablante.** Se muestra "Hablante 1", "Hablante 2"…
  No hay campo para que el usuario renombre.
- **Sin re-diarización automática.** Si el usuario retranscribe el audio, la sección
  de hablantes desaparece y el botón vuelve a estar disponible (reset de estado).

## Componentes y responsabilidades

### `app/utils/speakerTranscriptAlignment.ts` (nuevo, puro, testeable)

```ts
export interface AlignedSpeakerBlock {
  globalSpeakerId: number | null
  text: string
}

export function alignChunksWithSpeakers(
  chunks: WhisperChunk[],
  segments: SpeakerSegment[],
): AlignedSpeakerBlock[]
```

**Algoritmo:**

1. Para cada chunk (`{ text, timestamp: [start, end | null] }`), calcular el
   solapamiento con cada segmento: `overlap = min(chunkEnd, seg.end) - max(chunkStart,
   seg.start)`. Si `timestamp[1]` es `null`, usar `timestamp[0]` como `chunkEnd`
   (chunk puntual — raro, pero posible en Whisper).
2. Asignar al chunk el `globalSpeakerId` del segmento con mayor solapamiento positivo.
   Si ningún segmento solapa positivamente, o el mejor tiene `globalSpeakerId: null`,
   el chunk queda con `globalSpeakerId: null`.
3. Agrupar chunks consecutivos con el mismo `globalSpeakerId` concatenando su texto.
   El resultado es un array de `AlignedSpeakerBlock`.

Importa `WhisperChunk` de `../workers/whisper.types` y `SpeakerSegment` de
`../workers/speakerSegmentation.types`.

### `app/components/diarization/SpeakerTranscriptView.vue` (nuevo)

Props: `blocks: AlignedSpeakerBlock[]`.

Renderiza cada bloque como:
```
Hablante N          ← "Hablante " + (globalSpeakerId + 1); si null, sin etiqueta
[texto del bloque]
```

Separación visual entre bloques (margen). Sin lógica, sin eventos emitidos.

### `app/pages/index.vue` (modificado)

- Importa `useSpeakerSegmentation` y `alignChunksWithSpeakers`.
- `const { state: diarizationState, segments, errorMessage: diarizationError, segment: segmentAudio, retry: retryDiarization } = useSpeakerSegmentation()`
- `const speakerBlocks = computed(() => alignChunksWithSpeakers(transcriptionChunks.value, segments.value))`
- Cuando `transcriptionState` cambia a `'idle'` o `'loading-model'` (nueva transcripción), resetear la diarización: no hay acción activa — `diarizationState` vuelve a `'idle'` solo porque el composable es independiente; basta con no mostrar la sección si `diarizationState !== 'done'`.
- Botón "Identificar hablantes": visible cuando `transcriptionState === 'done'` y `editedText.trim() !== ''`. Deshabilitado cuando `diarizationState === 'loading-model' || diarizationState === 'segmenting' || diarizationState === 'identifying-speakers'`. Al pulsarlo: `segmentAudio(lastAudio.value!)`.
- Mensajes de progreso:
  - `diarizationState === 'loading-model'` → "Descargando modelo de diarización…"
  - `diarizationState === 'segmenting'` → "Segmentando audio…"
  - `diarizationState === 'identifying-speakers'` → "Identificando hablantes…"
- Error: `diarizationState === 'error'` → mensaje + botón "Reintentar" que llama `retryDiarization(lastAudio.value!)`.
- Resultado: `diarizationState === 'done'` → `<SpeakerTranscriptView :blocks="speakerBlocks" />`.

## Flujo de datos

```
transcribe(pcm) → transcriptionChunks (WhisperChunk[])
                                    ↓ (botón "Identificar hablantes")
segmentAudio(lastAudio)
→ useSpeakerSegmentation
→ segments (SpeakerSegment[], con globalSpeakerId)
                                    ↓ (computed, reactivo)
alignChunksWithSpeakers(transcriptionChunks, segments)
→ speakerBlocks (AlignedSpeakerBlock[])
                                    ↓
<SpeakerTranscriptView :blocks="speakerBlocks" />
```

## Manejo de errores

Mismo patrón que transcripción y summarizer: `diarizationState === 'error'` muestra
`diarizationError` con botón "Reintentar". `useSpeakerSegmentation` ya captura
cualquier excepción del worker y la expone en ese estado — no se añade lógica nueva.

## Testing

- **`tests/unit/utils/speakerTranscriptAlignment.test.ts`** (nuevo):
  - Array vacío de chunks → array vacío de bloques.
  - Chunks sin segmentos → todos los bloques con `globalSpeakerId: null`.
  - Todos los chunks del mismo hablante → un solo bloque con el texto concatenado.
  - Hablantes alternados → bloques separados en el orden correcto.
  - Chunk que solapa dos segmentos → se asigna al que tiene mayor solapamiento.
  - Chunk con `timestamp[1] === null` → tratado como punto, se asigna por solapamiento
    del instante.
  - Chunks consecutivos con el mismo hablante se fusionan aunque haya un segmento sin
    hablante (`null`) en el medio que no solape a ningún chunk de esa zona.

- **`SpeakerTranscriptView.vue`**: sin test unitario (componente visual sin lógica).

- **Verificación manual:** cargar `peluqueria.mp3` (en la raíz del repo), transcribir,
  pulsar "Identificar hablantes" y comprobar que aparece la sección con texto agrupado
  por bloques y etiquetas "Hablante N:".

## Extensiones futuras

- Exportación enriquecida (SRT/JSON con columna de hablante).
- Renombrado de hablantes por el usuario.
- Re-diarización automática al retranscribir.
