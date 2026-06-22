# Local Recorder — Fase 1 (núcleo) en Nuxt 4 / PWA

Fecha: 2026-06-22

## Alcance

Esta fase cubre:

- Grabación de audio desde micrófono.
- Importación de archivos de audio/vídeo desde el equipo.
- Transcripción local con Whisper (WebGPU, con fallback a WASM) en español e inglés.
- Editor de transcripción.
- Exportación a TXT y SRT/VTT.
- Esqueleto de PWA instalable desde el inicio (manifest, service worker, caché de modelos).

Fuera de alcance en esta fase (mencionado como extensión futura, no diseñado en detalle): diarización, resumen con LLM local, persistencia cifrada en IndexedDB, soporte de árabe/japonés. El README del proyecto documenta la visión completa de estas fases posteriores.

Transcripción por bloques al finalizar (no streaming): se transcribe el audio completo (grabado o importado) de una vez, no en tiempo real mientras se captura.

## Stack

- **Framework:** Nuxt 4, TypeScript.
- **Estilos:** Tailwind CSS (sin librería de componentes).
- **Gestor de paquetes:** pnpm.
- **Inferencia Whisper:** `@huggingface/transformers` (transformers.js) en un Web Worker, `device: 'webgpu'` con fallback automático a `'wasm'` si `navigator.gpu` no está disponible.
- **PWA:** módulo `@vite-pwa/nuxt` (Workbox), `registerType: autoUpdate`.
- **Decodificación de audio/vídeo importado:** Web Audio API nativa (`decodeAudioData`). Limitación conocida: contenedores/codecs exóticos pueden no decodificar; no se añade ffmpeg.wasm en esta fase (ver "Extensiones futuras").
- **Resample a 16kHz mono:** implementación manual (mezcla a mono + interpolación lineal en `app/utils/audio/resample.ts`), no `OfflineAudioContext`. Decisión tomada durante la implementación (Tarea 4): `OfflineAudioContext` es asíncrona y solo existe en navegador, igual que `decodeAudioData` — usarla habría dejado el resampleo tan intestable como la decodificación. La interpolación lineal manual es determinista, pura y cubierta por tests unitarios sin necesidad de un navegador real. Limitación conocida: sin filtro anti-aliasing al reducir la frecuencia de muestreo (p. ej. 48kHz→16kHz); el impacto esperado en la precisión de Whisper es menor, dada su robustez documentada ante ruido y artefactos de audio.
- **Testing:** Vitest (unit + componentes) y Playwright (E2E, worker de Whisper mockeado en CI).

## Estructura de carpetas

```
app/
  components/
    recorder/        RecordButton, RecordingTimer, AudioVisualizer
    importer/        FileDropzone (drag&drop + input file audio/video)
    transcript/       TranscriptEditor, SpeakerLabel (placeholder, sin diarización real)
    export/           ExportMenu (TXT/SRT/VTT/JSON)
  composables/
    useRecorder.ts        wrapper de MediaRecorder + getUserMedia
    useFileImport.ts      valida archivo, extrae audio vía decodeAudioData
    useTranscription.ts   orquesta el Worker, expone estado (idle/loading-model/transcribing/done/error)
    useModelSelector.ts   selección tiny→large, persistida en localStorage
  workers/
    whisper.worker.ts     carga @huggingface/transformers, ejecuta pipeline ASR
  pages/
    index.vue              pantalla principal (grabar / importar / resultado)
```

## Componentes y responsabilidades

- **`useRecorder`**: encapsula `getUserMedia` + `MediaRecorder`. Emite el `Blob` final al detener la grabación.
- **`useFileImport`**: recibe un `File` (audio o vídeo) y lo decodifica a `Float32Array` mono 16kHz vía Web Audio API.
- **`whisper.worker.ts`**: único Web Worker que recibe audio ya decodificado (`Float32Array`), sin necesidad de saber si la fuente fue el micrófono o un archivo importado. Carga el pipeline de transformers.js una sola vez y lo reutiliza entre transcripciones.
- **`useTranscription`**: capa fina sobre `postMessage`/`onmessage` con el worker; expone un estado reactivo único que consume la UI.
- **`useModelSelector`**: selección de tamaño de modelo Whisper (`tiny`/`base`/`small`/`medium`), por defecto `small`, persistida en `localStorage`.

**Decisión de diseño clave:** tanto la grabación como la importación de archivos convergen en el mismo formato (`Float32Array` PCM decodificado) antes de llegar al worker. Esto evita que el worker necesite lógica distinta según el origen del audio.

## Flujo de datos

```
[Micrófono] ──getUserMedia/MediaRecorder──┐
                                           ├──► Blob/ArrayBuffer ──► decodeAudioData + resample 16kHz mono
[Archivo audio/vídeo] ──File input/drop───┘                                   │
                                                                                ▼
                                                                  Float32Array (PCM)
                                                                                │
                                                            postMessage ──► whisper.worker.ts
                                                                                │
                                                  pipeline('automatic-speech-recognition')
                                                        device: webgpu → fallback wasm
                                                                                │
                                                            postMessage ◄── { text, chunks con timestamps }
                                                                                │
                                                                                ▼
                                                                  TranscriptEditor (editable)
                                                                                │
                                                                  ExportMenu → TXT / SRT / VTT / JSON
```

- Los `chunks` con `timestamp: [start, end]` que devuelve transformers.js alimentan directamente la exportación SRT/VTT.
- El modelo elegido se descarga la primera vez desde el CDN de Hugging Face; el Service Worker lo cachea (`CacheFirst`) para que las siguientes cargas y el uso offline sean instantáneos.

## Manejo de errores

- **Sin WebGPU disponible:** detección de `navigator.gpu` antes de inicializar el pipeline; si no existe, se usa `wasm` directamente y se muestra un aviso de modo compatibilidad (más lento).
- **Permiso de micrófono denegado:** `getUserMedia` rechaza la promesa → mensaje claro en la UI; la importación de archivos sigue disponible.
- **Archivo no decodificable** (`decodeAudioData` rechaza): mensaje de "formato no soportado" con los formatos recomendados, sin romper la app.
- **Fallo de descarga del modelo:** se distingue entre "nunca descargado, necesitas conexión" y "error de red, reintenta".
- **Worker caído o con excepción:** `useTranscription` escucha `worker.onerror`, resetea el estado a `error` con opción de reintentar sin recargar la página.

## Testing

- **Unit (Vitest):** composables (`useFileImport` con archivos de prueba pequeños, `useModelSelector`, generación de SRT/VTT/TXT/JSON a partir de `chunks` mockeados).
- **Componentes (Vitest + @vue/test-utils):** `TranscriptEditor`, `ExportMenu`, `FileDropzone`, sin depender del worker real.
- **E2E (Playwright):** flujo completo (grabar/importar → transcripción → exportar) con el worker de Whisper mockeado, para no descargar el modelo real en CI. Un test adicional, manual/opcional, valida la integración real con transformers.js.
- El worker se mantiene delgado a propósito: la lógica de negocio testeable vive en composables puros, no dentro del worker.

## Esqueleto PWA

- `@vite-pwa/nuxt` configurado con manifest (nombre, iconos, `display: standalone`, tema) y `registerType: autoUpdate`.
- Precache del app shell.
- Runtime caching `CacheFirst` para los pesos de modelo descargados del CDN de Hugging Face.
- No se implementa offline-first agresivo en esta fase: basta con que la app cargue offline si ya se usó antes y el modelo elegido ya está cacheado.

## Extensiones futuras (no diseñadas en detalle aquí)

- Diarización (identificación de hablantes).
- Resumen con LLM local (familia Qwen/Llama cuantizada).
- Persistencia cifrada (AES-GCM) opcional en IndexedDB.
- Soporte de árabe (RTL) y japonés (segmentación).
- Transcripción en streaming para sesiones largas.
- Fallback con ffmpeg.wasm para formatos de audio/vídeo que `decodeAudioData` no soporte.
