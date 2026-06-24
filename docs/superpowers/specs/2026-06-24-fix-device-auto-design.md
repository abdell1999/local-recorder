# Corrección del fallback WebGPU→WASM: `device:'auto'` — diseño

## Contexto

El fix de `2026-06-24-fallback-webgpu-wasm-design.md` (commits
`6c7cab2..79776d8`, ya en `main`) **no funciona de verdad**. Se diseñó e
implementó asumiendo que reintentar con `device:'wasm'` en una llamada
*separada* tras un fallo de `device:'webgpu'` recuperaría la transcripción.
Verificando manualmente en navegador (mismo entorno sin adaptador GPU real
que reveló el bug original), se confirmó con logs de depuración que
**ambos intentos fallan con el mismo error exacto**:

```
no available backend found. ERR: [webgpu] Error: Failed to get GPU adapter...
```

La causa real: una vez que `onnxruntime-web` intenta registrar el backend
WebGPU dentro de un worker y falla, ese fallo no es "por intento" sino
**global al realm de JavaScript del worker** — una llamada posterior con
`device:'wasm'` en una sesión `InferenceSession.create()` *separada* sigue
fallando igual.

Se confirmó la solución real leyendo el código fuente de
`onnxruntime-web` (`node_modules/.pnpm/onnxruntime-web@.../dist/ort.all.mjs`):
cuando se le pasan **varios** proveedores de ejecución candidatos en la
**misma** llamada a `create()` (lo que `transformers.js` hace al pasar
`device:'auto'`, que se traduce a
`executionProviders: ['webgpu', 'wasm']` vía
`deviceToExecutionProviders('auto')` en
`node_modules/@huggingface/transformers/src/backends/onnx.js`),
`onnxruntime-web` prueba cada proveedor en orden **dentro de la misma
sesión** y, si uno falla, lo retira con un `console.warn` (`"removing
requested execution provider \"webgpu\" from session options because it
is not available"`) — no como error fatal — y continúa con el siguiente.
Se verificó esto en navegador real: con `device:'auto'`, la transcripción
se completa correctamente.

## Alcance

1. Eliminar `app/utils/modelDevice.ts` y su test — la utilidad
   `loadWithDeviceFallback` no resuelve el problema real y no la usaría
   nadie tras este fix.
2. En los tres workers (`whisper.worker.ts`, `summarizer.worker.ts`,
   `speakerSegmentation.worker.ts`): pasar `device: 'auto'` (literal) a la
   llamada real de `pipeline()`/`from_pretrained()`, en vez del resultado
   de `loadWithDeviceFallback`.
3. Mantener la heurística `'gpu' in navigator` — ya no decide qué se pide
   a la librería, pero sigue siendo la única señal disponible para (a) el
   aviso `wasm-fallback-notice` ya existente en la UI, y (b) decidir el
   `dtype` a pedir explícitamente.

### Fuera de alcance (decisión explícita)

- **El aviso de la UI puede quedar impreciso en el caso raro que
  arreglamos.** Si `navigator.gpu` existe pero falla de verdad (el bug
  original), el mensaje seguirá diciendo "modo compatibilidad" basado en
  si la propiedad existe, no en qué proveedor ganó realmente —
  `onnxruntime-web` no expone de vuelta a `transformers.js` qué proveedor
  se usó al final tras su propio fallback interno, así que no hay forma
  de saberlo con certeza. Aceptado: es cosmético, no rompe la
  transcripción (que es lo que importa), y solo afecta al caso raro que
  ya era un fallo total antes de este fix.
- **Sin forzar `dtype:'q8'` incondicionalmente.** Se calcula a partir de
  la misma heurística `'gpu' in navigator` (igual que antes de cualquier
  cambio de hoy), para no penalizar con un modelo cuantizado a usuarios
  con WebGPU real y funcional, que seguirán obteniendo `fp32` completo.
  Solo en el caso raro de WebGPU presente-pero-roto se pierde el `dtype`
  óptimo (se usará `fp32` en wasm en vez de `q8`) — aceptado por el mismo
  motivo que el punto anterior.

## Componentes y responsabilidades

- **Eliminar `app/utils/modelDevice.ts` y `tests/unit/utils/modelDevice.test.ts`.**

- **`app/workers/whisper.worker.ts`** (modificado), `getTranscriber`:
  vuelve al patrón original de antes de la fase de fallback (calcular
  `device` con la heurística, postearlo de inmediato), pero la llamada a
  `pipeline()` pasa `device: 'auto'` (no la variable `device`) y un
  `dtype` calculado a partir de esa misma variable:
  ```ts
  async function getTranscriber(modelSize: WhisperModelSize) {
    if (transcriber && loadedModelSize === modelSize) return transcriber
    post({ type: 'progress', status: 'loading-model' })
    // Heurística usada solo como pista para la UI y para el dtype — la
    // selección real de backend la hace onnxruntime-web internamente vía
    // device:'auto' (ver spec de esta fase para el por qué).
    const device = typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm'
    post({ type: 'device', device })

    const onProgress = createProgressAggregator((percent) => post({ type: 'model-download-progress', percent }))

    transcriber = await pipeline<'automatic-speech-recognition'>(
      'automatic-speech-recognition',
      getModelRepoId(modelSize),
      { device: 'auto', dtype: device === 'wasm' ? 'q8' : undefined, progress_callback: onProgress },
    )
    loadedModelSize = modelSize
    return transcriber
  }
  ```
  Se elimina el import de `loadWithDeviceFallback`.

- **`app/workers/summarizer.worker.ts`** (modificado), `getGenerator`:
  mismo cambio exacto, adaptado a `pipeline<'text-generation'>(...)`.

- **`app/workers/speakerSegmentation.worker.ts`** (modificado),
  `getModelAndProcessor`: mismo cambio, aplicado solo a la carga del
  modelo (`AutoModelForAudioFrameClassification.from_pretrained`) — la
  carga del `processor` no cambia.

## Verificación técnica ya realizada (durante este diseño)

- Confirmado en `onnxruntime-web` (`ort.all.mjs`) que un fallo de un
  proveedor dentro de una lista multi-proveedor de la misma sesión se
  degrada con `console.warn`, no con excepción — y que el siguiente
  proveedor de la lista se usa con normalidad.
- Confirmado en `@huggingface/transformers/src/backends/onnx.js` que
  `device:'auto'` se traduce a la lista completa de proveedores
  soportados (`['webgpu', 'wasm']` cuando `navigator.gpu` existe), no a
  uno solo.
- Confirmado en `@huggingface/transformers/src/utils/dtypes.js` que
  `DEFAULT_DEVICE_DTYPE_MAPPING` solo tiene entrada explícita para
  `'wasm'` (`q8`) — con `device:'auto'` el dtype por defecto sería
  siempre `fp32` si no se especifica explícitamente, de ahí la necesidad
  del cálculo manual de `dtype` en el punto anterior.
- Verificado de punta a punta en navegador real (mismo entorno sin
  adaptador GPU que reveló el bug original): con `device:'auto'`, el
  worker de Whisper completa la transcripción correctamente, mostrando el
  aviso `wasm-fallback-notice` esperado.

## Manejo de errores

Sin cambios respecto al patrón ya existente: cualquier fallo (de
descarga, o si *ningún* proveedor de la lista de `device:'auto'`
funciona) sigue cayendo en el mismo `try/catch` de `self.onmessage` →
`{type:'error', message}`.

## Testing

- Sin test unitario directo para los tres workers (igual que siempre,
  requieren navegador real) — se verifican por lectura de código.
- **Verificación manual ya realizada** (ver sección anterior) durante
  este mismo diseño, antes incluso de escribir el plan de
  implementación — inusual respecto a fases anteriores, pero justificado
  porque la verificación *es* la evidencia que motiva el diseño. **Esa
  verificación cubrió solo `whisper.worker.ts`** (con el cambio aplicado
  como experimento temporal, luego revertido). Dado que la fase anterior
  ya falló por confiar en una corrección sin verificarla de punta a punta
  en los tres workers, tras implementar el cambio definitivo se repetirá
  la verificación en navegador para **los tres workers** (no solo
  Whisper) antes de dar la fase por cerrada — al menos confirmando que
  cada uno complete su flujo (transcripción, resumen, segmentación) sin
  el error de adaptador GPU en el mismo entorno sin GPU real.
- `app/utils/audioWindows.ts`, `modelDownloadProgress.ts`, y el resto de
  composables/tests no se ven afectados — ningún test debería cambiar de
  cantidad salvo la eliminación de los 4 tests de `modelDevice.test.ts`.

## Extensiones futuras

Sin cambios respecto a la lista ya documentada. Esta es una corrección de
una corrección — no añade superficie de producto nueva.
