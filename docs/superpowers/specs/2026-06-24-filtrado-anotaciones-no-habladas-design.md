# Filtrado de anotaciones no-habladas — diseño

## Contexto

Whisper, ante tramos de audio sin habla (música, aplausos, silencio…), no
omite esos tramos: emite anotaciones de texto al estilo de los subtítulos
cerrados, como `[MUSIC]`, `(applause)` o `[BLANK_AUDIO]`, como si fueran
habla transcrita literal. Esto se detectó al transcribir una canción: el
resultado fue literalmente `[MUSIC]`.

Esta fase elimina esas anotaciones del resultado antes de que lleguen a la
UI, el editor y los formatos de exportación.

## Alcance

1. Detectar y eliminar anotaciones no-habladas del `text` y los `chunks`
   devueltos por el worker de transcripción.
2. Cuando, tras filtrar, no queda ningún texto (audio íntegramente
   no-hablado, p. ej. una canción), mostrar un mensaje explícito en vez del
   editor vacío.

### Fuera de alcance (decisión explícita)

- **No se distingue visualmente que hubo música/aplausos/etc.** Se elimina
  sin dejar rastro — no es un requisito, solo limpieza del resultado.
- **No se usa una lista de palabras conocidas** (`MUSIC`, `APPLAUSE`,
  `BLANK_AUDIO`, `LAUGHTER`...). Se usa un criterio estructural genérico (ver
  "Criterio de detección") para no quedar corto ante variantes de wording
  que Whisper pueda emitir y que esta fase no previó.
- **Sin señal de confianza del modelo** (`no_speech_prob` o equivalente): se
  comprobó que `@huggingface/transformers` no expone esa metadata por chunk
  en la versión usada por este proyecto. La única señal disponible es el
  propio texto.

## Criterio de detección

Un *chunk* se considera una anotación no-hablada (y se descarta íntegro)
cuando su texto, una vez recortado (`trim()`), coincide **entero** con un
único par de corchetes o paréntesis envolviendo el resto del contenido:

- `[MUSIC]`, `[ Music playing ]`, `[BLANK_AUDIO]` → coinciden con
  `^\[[^[\]]*\]$`.
- `(applause)`, `(Laughter)` → coinciden con `^\([^()]*\)$`.

No se distingue mayúsculas/minúsculas ni palabra concreta: el criterio es
estructural (todo el chunk es un único bloque entre corchetes o entre
paréntesis), no léxico.

**Falso positivo aceptado:** un chunk real hablado que fuera *exactamente*
`"(sí)"` se filtraría igual. Caso extremadamente raro en la práctica de
Whisper (estas anotaciones casi siempre ocupan su propio chunk separado del
habla real), aceptado como trade-off de un criterio simple y genérico.

## Componentes y responsabilidades

- **`app/utils/transcriptClean.ts`** (nuevo, utilidad pura sin dependencias
  de Vue/worker, testeable con Vitest — mismo patrón que `resample.ts` y
  `transcriptExport.ts`):
  - `isNonSpeechAnnotation(text: string): boolean` — aplica el criterio de
    detección descrito arriba sobre `text.trim()`.
  - `filterNonSpeechChunks(chunks: WhisperChunk[]): WhisperChunk[]` —
    devuelve los chunks cuyo `text` no sea una anotación no-hablada.
  - `deriveText(chunks: WhisperChunk[], fallbackText: string): string` —
    si `chunks.length > 0`, reconstruye el texto uniendo
    `chunk.text.trim()` de cada chunk con un espacio simple y recorta el
    resultado; si `chunks.length === 0` (caso raro: audio corto sin
    desglose en chunks), aplica `isNonSpeechAnnotation` directamente sobre
    `fallbackText.trim()` y devuelve `''` si coincide, o el texto recortado
    si no.

- **`app/workers/whisper.worker.ts`** (modificado): tras mapear `rawChunks`
  a `WhisperChunk[]` (líneas 54-57 actuales), se filtran con
  `filterNonSpeechChunks` antes de postear el resultado. El `text` final se
  calcula con `deriveText(chunksFiltrados, output.text)` en vez de usar
  `output.text` sin procesar. La forma del mensaje `{ type: 'result', text,
  chunks }` no cambia.

- **`app/pages/index.vue`** (modificado): cuando `transcriptionState ===
  'done'` y `editedText.trim() === ''`, se muestra
  `<p data-testid="no-speech-detected">No se detectó voz en el audio.</p>`
  en lugar de `TranscriptEditor`/`ExportMenu` (no tiene sentido editar o
  exportar una transcripción vacía).

## Flujo de datos

```
asr(audio) → rawChunks / output.text
                   │
                   ▼
   mapeo a WhisperChunk[] (sin cambios respecto a hoy)
                   │
                   ▼
   filterNonSpeechChunks(chunks) ──► chunks limpios
                   │                  (afecta también SRT/VTT al exportar)
                   ▼
   deriveText(chunks, output.text) ──► text limpio
                   │
                   ▼
   post({ type: 'result', text, chunks })   (forma del mensaje sin cambios)
```

El resto del pipeline (exportación TXT/SRT/VTT/JSON, editor, retry) no
cambia: sigue consumiendo `text`/`chunks` exactamente igual, solo que ahora
llegan ya filtrados.

## Manejo de errores

Sin cambios respecto a las fases anteriores. El filtrado ocurre solo en el
camino feliz (`result`); no introduce ningún nuevo estado de error.

## Testing

- **`transcriptClean.test.ts`** (nuevo):
  - `isNonSpeechAnnotation`: positivos (`[MUSIC]`, `(applause)`, con
    espacios extra alrededor, mayúsculas/minúsculas mezcladas); negativos
    (texto normal sin corchetes/paréntesis; texto que solo contiene un
    paréntesis parcial como `"hola (en serio)"`, donde el chunk entero no
    es solo el paréntesis).
  - `filterNonSpeechChunks`: array mixto (algunos chunks tag, otros habla
    real) → solo sobreviven los de habla real; array con todos los chunks
    como tags → array vacío; array sin ningún tag → sin cambios.
  - `deriveText`: chunks mixtos → texto unido solo de los chunks de habla
    real; todos los chunks son tags → `''`; `chunks` vacío con
    `fallbackText` que es una anotación → `''`; `chunks` vacío con
    `fallbackText` normal → el texto recortado tal cual.
- **`index.test.ts`** (extendido): nuevo caso verificando que, en estado
  `done` con `editedText` vacío (tras `trim()`), se muestra
  `[data-testid="no-speech-detected"]` y no se renderizan
  `TranscriptEditor` ni `ExportMenu`; caso existente de `done` con texto no
  vacío sigue verificando que sí se renderizan.
- **`whisper.worker.ts`**: sigue sin test unitario directo (requiere
  navegador real para `pipeline`, igual que en fases anteriores). Se
  verifica por lectura de código que llama a `filterNonSpeechChunks` y
  `deriveText` con los argumentos correctos antes de `post({type:
  'result', ...})`.
- Suite E2E (`transcription-flow.spec.ts`): sin cambios necesarios — el
  `FakeWhisperWorker` ya postea directamente un `result` con texto/chunks
  ya "limpios" en sus fixtures, por lo que los 4 tests existentes siguen
  pasando sin tocar el fake.

## Extensiones futuras

Sin cambios respecto a la lista ya documentada en la Fase 1 (diarización,
resumen LLM, persistencia cifrada, soporte RTL/japonés, streaming, fallback
ffmpeg.wasm). La siguiente fase planeada tras esta es captura de audio de
pestaña (`getDisplayMedia`), según lo acordado en la sesión de
brainstorming.
