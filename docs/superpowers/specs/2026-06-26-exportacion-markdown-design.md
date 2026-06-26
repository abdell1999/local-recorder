# Exportación Markdown — diseño

## Contexto

El menú de exportación (`ExportMenu.vue`) ofrece TXT, SRT, VTT y JSON. El README
lista "Markdown estructurado" como característica pendiente de la Fase 3. Esta fase
añade el formato MD con dos modos según el estado de la diarización:

- **Con diarización ejecutada:** bloques agrupados por hablante con el timestamp del
  primer chunk del grupo.
- **Sin diarización (fallback):** una línea por chunk con su timestamp.

## Alcance

1. Nueva función `toMarkdown(result, segments?)` en `app/utils/transcriptExport.ts`.
2. Prop opcional `segments?: SpeakerSegment[]` en `ExportMenu.vue` + botón MD.
3. Un solo cambio en `index.vue`: pasar `diarizationSegments` a `ExportMenu` cuando
   `diarizationState === 'done'`.

### Fuera de alcance (decisión explícita)

- **Sin deshabilitar el botón MD sin diarización.** El fallback a timestamps es
  suficientemente útil — el botón siempre está disponible.
- **Sin exportación del resumen.** `SummaryEditor` y `ExportMenu` siguen
  independientes.
- **Sin enriquecer SRT/VTT/JSON con hablantes.** Solo MD en esta fase.
- **Sin renombrado de hablantes en la exportación.** Se usan los IDs numéricos
  generados por el clustering.

## Componentes y responsabilidades

### `app/utils/transcriptExport.ts` (modificado)

Nueva función exportada:

```ts
export function toMarkdown(result: TranscriptResult, segments?: SpeakerSegment[]): string
```

Importa `SpeakerSegment` de `../workers/speakerSegmentation.types`.

**Algoritmo con segmentos:**

1. Función interna `assignSpeaker(chunk, segments)` — misma lógica de solapamiento
   que `alignChunksWithSpeakers` (10 líneas):
   ```ts
   const [chunkStart, chunkEndOrNull] = chunk.timestamp
   const chunkEnd = chunkEndOrNull ?? chunkStart
   // mayor overlap positivo → globalSpeakerId; si ninguno → null
   ```
2. Agrupar chunks consecutivos con el mismo `globalSpeakerId` en
   `{ globalSpeakerId: number | null, chunks: WhisperChunk[] }[]`.
3. Por cada grupo:
   - Si `globalSpeakerId !== null`: header `**Hablante N** · HH:MM:SS` (timestamp del
     primer chunk), línea en blanco, texto concatenado de los chunks (`.text.trim()`),
     separador `---` entre grupos.
   - Si `globalSpeakerId === null`: igual que el modo sin segmentos para ese grupo
     (una línea `**[HH:MM:SS]** texto` por chunk).

**Fallback (sin segmentos):**

Una línea por chunk: `**[HH:MM:SS]** texto.trim()`, separadas por `\n\n`.

**Formato de timestamp:** `MM:SS` si duración < 1 hora, `HH:MM:SS` si ≥ 1 hora.
Función interna `formatMd(seconds)` (distinta de `formatTimestamp` existente, que
usa separadores `,`/`.` para SRT/VTT).

**Salida de ejemplo con segmentos:**

```markdown
**Hablante 1** · 00:00

Hola, ¿cómo estás? Estoy bien, gracias.

---

**Hablante 2** · 00:08

Me alegra escucharlo.
```

**Salida de ejemplo sin segmentos:**

```markdown
**[00:00]** Hola, ¿cómo estás?

**[00:05]** Estoy bien, gracias.

**[00:08]** Me alegra escucharlo.
```

### `app/components/export/ExportMenu.vue` (modificado)

- Nueva prop `segments?: SpeakerSegment[]`.
- Importa `SpeakerSegment` de `../../workers/speakerSegmentation.types` y `toMarkdown`
  de `../../utils/transcriptExport`.
- Añade al array `formats`:
  ```ts
  { key: 'md', label: 'MD', mime: 'text/markdown', extension: 'md',
    generate: () => toMarkdown(props.result, props.segments) }
  ```

### `app/pages/index.vue` (modificado)

Un cambio de una línea en el template:

```html
<ExportMenu
  :result="{ text: editedText, chunks: transcriptionChunks }"
  :segments="diarizationState === 'done' ? diarizationSegments : undefined"
/>
```

`diarizationSegments` ya está disponible en scope (desestructurado de
`useSpeakerSegmentation` en la fase anterior).

## Flujo de datos

```
diarizationState === 'done' ?
  diarizationSegments (SpeakerSegment[]) → ExportMenu → toMarkdown(result, segments)
  else undefined                         → ExportMenu → toMarkdown(result)          (fallback)
```

## Manejo de errores

`toMarkdown` es pura y determinista. Un array vacío de chunks produce `''`. Segmentos
con todos los `globalSpeakerId: null` producen la salida de fallback (sin headers de
hablante). La descarga la gestiona `ExportMenu` con el patrón existente
(Blob + URL.createObjectURL) — sin cambios.

## Testing

En `tests/unit/utils/transcriptExport.test.ts` (ya existe), añadir casos para
`toMarkdown`:

- Array vacío de chunks → `''`.
- Un chunk sin segmentos → `**[MM:SS]** texto`.
- Varios chunks sin segmentos → líneas separadas por `\n\n`.
- Timestamp ≥ 3600s → formato `HH:MM:SS`.
- Con segmentos, mismo hablante en chunks consecutivos → un bloque fusionado con
  header `**Hablante N** · MM:SS`.
- Con segmentos, hablantes alternados → bloques separados por `---`.
- Con segmentos, `globalSpeakerId: null` → esos chunks en formato fallback (sin
  header de hablante).
- Con segmentos todos `null` → output idéntico al modo sin segmentos.

`ExportMenu.vue` e `index.vue`: sin nuevos tests unitarios — el cambio en
`ExportMenu` es de una línea en el `generate`, y `index.vue` solo añade un prop
binding. El comportamiento de descarga ya está cubierto por los tests de la fase
anterior.
