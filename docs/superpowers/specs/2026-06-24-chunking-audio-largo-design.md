# Chunking de audio largo en el worker de Whisper — diseño

## Contexto

Al investigar por qué una canción con letra se transcribía como solo
`[MUSIC]`, se encontró la causa real en el código fuente de
`@huggingface/transformers`: `whisper.worker.ts` llama a
`asr(audio, { return_timestamps: true })` sin `chunk_length_s`. Sin ese
parámetro, `WhisperFeatureExtractor._call` trunca silenciosamente cualquier
audio a los primeros 30 segundos antes de que llegue al modelo
(`feature_extraction_whisper.js:71-79`, con un `console.warn` que ya avisa
de esto: *"Attempting to extract features for audio longer than 30
seconds... remember to specify `chunk_length_s`"*). El resto del audio
nunca llega al modelo.

Esto no es un problema específico de música: **afecta a cualquier grabación
o archivo importado de más de 30 segundos** — el caso de uso principal de
la app (reuniones, notas de voz, entrevistas). El síntoma de la canción fue
solo la forma en que se detectó: la intro instrumental ocupaba esos
primeros (y únicos) 30 segundos procesados.

## Alcance

1. Pasar `chunk_length_s` y `stride_length_s` a la llamada `asr(...)` en
   `whisper.worker.ts`, con los valores recomendados en la documentación
   oficial de `@huggingface/transformers` (30s de ventana, 5s de solape),
   para que el pipeline trocee internamente el audio largo en vez de
   truncarlo.

### Fuera de alcance (decisión explícita)

- **No soluciona el caso original de la canción al 100%.** Con este cambio,
  la canción completa llega al modelo (ya no se trunca a los primeros 30s),
  pero Whisper puede seguir emitiendo `[MUSIC]`/etc. en tramos
  genuinamente instrumentales dentro de la canción — eso es la limitación
  de fondo ya cubierta (como caso legítimo) por el spec de "filtrado de
  anotaciones no-habladas" (`2026-06-24-filtrado-anotaciones-no-habladas-design.md`),
  que sigue pendiente de implementar por separado.
- **No se expone `chunk_length_s`/`stride_length_s` como configuración de
  usuario.** Se fijan como constantes en el worker; no hay caso de uso
  conocido que justifique hacerlos ajustables.
- **No se añade progreso por ventana durante la transcripción.** Para audio
  largo, el pipeline decodifica las ventanas secuencialmente (así lo indica
  un comentario en el propio código de la librería: *"NOTE: doing
  sequentially for now"*), lo que puede tardar más en archivos largos. La
  UI sigue mostrando el mismo estado estático `'transcribing'` que ya
  existe — sin desglose por ventana. Posible mejora futura, no aquí.
- **No se ajusta el rendimiento del troceo secuencial.** Es una limitación
  interna de la librería, fuera de nuestro control.

## Componentes y responsabilidades

- **`app/workers/whisper.worker.ts`** (modificado): se añaden dos
  constantes a nivel de módulo, `CHUNK_LENGTH_S = 30` y
  `STRIDE_LENGTH_S = 5`, y se pasan a la llamada existente:
  ```ts
  const output = await asr(audio, {
    return_timestamps: true,
    chunk_length_s: CHUNK_LENGTH_S,
    stride_length_s: STRIDE_LENGTH_S,
  })
  ```
  No cambia nada más de la función: la forma de la salida (`output.text`,
  `output.chunks`) es idéntica con o sin chunking — el pipeline interno
  (`_decode_asr`) ya se encarga de fusionar las ventanas en un único
  resultado coherente.

No se modifica ningún otro archivo: el protocolo del worker
(`whisper.types.ts`), `useTranscription.ts`, `transcriptExport.ts` e
`index.vue` ya consumen `{text, chunks}` sin asumir nada sobre cómo se
generaron internamente.

## Por qué es seguro para audio corto

Se revisó la lógica de troceo en `pipelines.js` (`_call_whisper`): cuando
`chunk_length_s > 0`, el bucle de ventanas calcula
`offset_end = offset + window` y termina en la primera iteración si
`offset_end >= audio.length` (`is_last = true`). Para audio más corto que
30s, esto produce una única ventana con el mismo `stride: [audio.length, 0,
0]` que la ruta sin chunking actual — comportamiento idéntico al de hoy
para todas las grabaciones cortas ya probadas en fases anteriores.

## Manejo de errores

Sin cambios. El troceo ocurre dentro de la llamada `asr(...)` ya envuelta
en el `try/catch` existente; cualquier fallo sigue cayendo en el mismo
`{type: 'error'}`.

## Testing

- **`whisper.worker.ts` sigue sin test unitario directo** (requiere
  navegador real para `pipeline`, igual que en fases anteriores). Se
  verifica por lectura de código que los dos parámetros se pasan
  correctamente a `asr(...)`.
- **Verificación manual en navegador** (igual que otras partes del worker
  ya verificadas así): importar o grabar un audio de más de 30 segundos
  (p. ej. la canción que detectó el problema) y confirmar que la
  transcripción resultante cubre toda la duración del audio, no solo los
  primeros 30 segundos — comparando los `timestamp` del último chunk
  devuelto contra la duración real del archivo.
- **Suite unitaria y E2E existentes:** sin cambios necesarios. Ninguna usa
  el pipeline real (`FakeWhisperWorker` en E2E, mocks de `useTranscription`
  en unitarios), así que no se ven afectadas por este cambio. Se ejecuta
  `pnpm test` y `pnpm test:e2e` solo para confirmar ausencia de
  regresiones, no porque se espere que prueben este comportamiento
  directamente.
- **Tipado:** `pnpm dlx nuxi typecheck` debe seguir pasando limpio.

## Extensiones futuras

Sin cambios respecto a la lista ya documentada en la Fase 1 (diarización,
resumen LLM, persistencia cifrada, soporte RTL/japonés, streaming, fallback
ffmpeg.wasm). El filtrado de anotaciones no-habladas
(`2026-06-24-filtrado-anotaciones-no-habladas-design.md`) sigue siendo la
siguiente fase ya diseñada y pendiente de implementar tras esta.
