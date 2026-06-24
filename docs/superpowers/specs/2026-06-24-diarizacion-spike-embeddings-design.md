# Diarización — spike de viabilidad de embeddings de hablante

> Nota de proceso: este documento es deliberadamente breve. El usuario pidió
> proceso ligero para este spike (sin plan formal de tareas ni ronda de
> subagentes/revisores) porque su objetivo es solo determinar viabilidad, no
> producir código definitivo. Si el spike funciona, las fases 2-4 de
> diarización (segmentación troceada, embeddings+clustering, integración UI)
> se diseñarán con el proceso completo de este repositorio.

## Por qué este spike

La diarización real (README, "Fase 3 — Avanzado") requiere, además del
modelo de segmentación ya confirmado compatible
(`onnx-community/pyannote-segmentation-3.0`), un modelo de **embeddings de
hablante** para resolver el problema de permutación entre ventanas (la
documentación oficial de pyannote confirma que el modelo de segmentación,
al procesar en ventanas de 10s, no garantiza identidad consistente entre
ventanas — "Hablante 1" en una ventana no tiene por qué ser la misma
persona que "Hablante 1" en otra).

El modelo de embeddings candidato,
`onnx-community/wespeaker-voxceleb-resnet34-LM`, **no aparece etiquetado
como compatible con `transformers.js`** en Hugging Face (a diferencia del
de segmentación), así que su viabilidad no estaba confirmada al empezar
esta sesión de brainstorming.

## Investigación ya realizada (antes del spike en navegador)

- `node_modules/@huggingface/transformers/src/models.js` registra
  `['wespeaker-resnet', ['WeSpeakerResNetModel', WeSpeakerResNetModel]]` —
  la clase de modelo existe en la librería instalada.
- `node_modules/@huggingface/transformers/src/models/wespeaker/feature_extraction_wespeaker.js`
  contiene `WeSpeakerFeatureExtractor`, una reimplementación en JS puro del
  preprocesado fbank (el preprocesado original en Python usa operaciones de
  `torchaudio` que no se pueden exportar a ONNX — por eso esta
  reimplementación es necesaria y, si existe, es buena señal).
- `config.json` del repo en Hugging Face: `{"model_type":
  "wespeaker-resnet"}` — coincide exactamente con la clave registrada en la
  librería.
- `preprocessor_config.json` del repo: `{"feature_extractor_type":
  "WeSpeakerFeatureExtractor", "sampling_rate": 16000, ...}` — coincide
  exactamente con la clase de la librería.

Estas tres piezas coinciden perfectamente, lo cual da confianza alta de que
`AutoModel.from_pretrained('onnx-community/wespeaker-voxceleb-resnet34-LM')`
+ `AutoProcessor.from_pretrained(...)` cargarán y funcionarán correctamente
vía `transformers.js`. Pero ningún archivo de configuración garantiza
comportamiento en tiempo de ejecución real (WebGPU/WASM, tamaños de
tensor, etc.) — de ahí el spike.

## Qué confirma el spike

1. El modelo y el processor cargan sin error en un Worker, vía
   `AutoModel`/`AutoProcessor` (no `pipeline()`, que no tiene una tarea
   genérica de "speaker-embedding").
2. Al procesar un audio real (reutilizando el PCM ya decodificado por
   `decodeAudioFile`/`useRecorder` existentes), el modelo devuelve un
   tensor de embedding sin lanzar error.
3. Se inspecciona en vivo la forma exacta de la salida del modelo (no se
   asume un nombre de clave de antemano — el worker registra en consola
   las claves del objeto de salida y las dimensiones de cualquier tensor,
   ya que no hay forma de verificar el nombre exacto sin ejecutarlo).

No se evalúa en este spike si los embeddings son *semánticamente*
correctos (p. ej. mayor similitud coseno entre dos grabaciones de la misma
persona) — eso requeriría grabaciones controladas de varias personas y es
un paso posterior si este spike básico funciona.

## Implementación

- **`app/workers/speakerEmbeddingSpike.worker.ts`** (temporal, nombre
  explícito de spike): carga `AutoModel`/`AutoProcessor` para
  `onnx-community/wespeaker-voxceleb-resnet34-LM`; al recibir
  `{type: 'extract', audio: Float32Array}`, procesa el audio y llama al
  modelo; postea `{type: 'result', outputKeys: string[], dims:
  Record<string, number[]>}` o `{type: 'error', message}`.
- **`app/pages/index.vue`** (modificado temporalmente): un botón
  `[SPIKE] Probar embeddings de hablante`, visible solo cuando hay
  `lastAudio`, que llama al worker y muestra el resultado en pantalla y por
  `console.log`.

Tras la verificación en navegador, se decide en la conversación si este
código se elimina (si falla) o se sustituye por el diseño real de las
fases 2-4 (si funciona) — no se mantiene como código de producción en
ningún caso.
