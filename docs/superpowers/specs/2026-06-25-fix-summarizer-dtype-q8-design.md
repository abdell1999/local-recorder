# Forzar `dtype:'q8'` en el resumen LLM — diseño

## Contexto

Verificando en navegador real el fix de `device:'auto'` (ver
`2026-06-24-fix-device-auto-design.md`) para los tres workers, se confirmó
que el fallback de dispositivo funciona correctamente también en
`summarizer.worker.ts` (mismo aviso "removing requested execution
provider webgpu", no error fatal). Pero apareció un **fallo distinto**: en
el caso de `navigator.gpu` presente-pero-roto (el mismo caso raro que
motivó toda esta serie de fixes), el modelo Qwen2.5-0.5B se queda en
`dtype: fp32` (sin cuantizar, ~2GB) porque la heurística `dtype: device
=== 'wasm' ? 'q8' : undefined` asume WebGPU (ya que la propiedad existe)
y por tanto no aplica la cuantización. Ejecutar ese modelo sin cuantizar
sobre el backend `wasm` (al que `device:'auto'` cae internamente) agotó la
memoria del runtime WASM, que lanzó una excepción no estándar (un número
crudo, `3999532680`, no un `Error` de JS) — capturada igualmente por el
`catch` existente, pero como `'unknown-error'` sin más contexto.

Whisper y la segmentación de hablantes usan modelos sustancialmente más
pequeños y no mostraron este problema en las mismas pruebas — el riesgo es
específico del LLM de resumen.

## Alcance

1. En `summarizer.worker.ts`, forzar `dtype: 'q8'` de forma incondicional
   en la llamada a `pipeline()`, en vez de basarlo en la heurística
   `'gpu' in navigator`.

### Fuera de alcance (decisión explícita)

- **Sin tocar `whisper.worker.ts` ni `speakerSegmentation.worker.ts`.**
  No mostraron este problema en las pruebas reales — sus modelos son más
  pequeños. Si en el futuro se añaden tamaños de modelo más grandes para
  esos workers (p. ej. Whisper `medium`/`large`), revisar entonces si
  necesitan el mismo tratamiento.
- **Sin investigar si q8 también puede agotar memoria en otros casos
  extremos** (audio/texto de entrada muy largos, etc.) — fuera del
  problema concreto verificado aquí.
- **Se acepta perder algo de calidad/velocidad en GPUs reales y
  funcionales**, que antes obtenían el modelo completo en `fp32` y ahora
  siempre obtienen la variante cuantizada `q8`. Se verificó que el
  archivo `model_quantized.onnx` existe en el repositorio del modelo como
  grafo ONNX genérico (no específico de CPU), así que sigue funcionando
  correctamente sobre el backend `webgpu` — solo sin aprovechar toda la
  capacidad de una GPU real.

## Componentes y responsabilidades

- **`app/workers/summarizer.worker.ts`** (modificado), `getGenerator`:
  cambia
  ```ts
  { device: 'auto', dtype: device === 'wasm' ? 'q8' : undefined, progress_callback: onProgress }
  ```
  por
  ```ts
  { device: 'auto', dtype: 'q8', progress_callback: onProgress }
  ```
  La variable `device` (heurística `'gpu' in navigator`) se mantiene sin
  cambios para el `post({type:'device', device})` que alimenta el aviso
  de la UI — solo deja de usarse para decidir el `dtype`.

## Manejo de errores

Sin cambios respecto al patrón ya existente — el `try/catch` de
`self.onmessage` sigue capturando cualquier fallo. Esta fase reduce la
probabilidad de llegar a ese camino de error por agotamiento de memoria,
no cambia cómo se reporta.

## Testing

- Sin test unitario directo (igual que siempre, requiere navegador real
  para `pipeline()`) — se verifica por lectura de código.
- **Verificación manual:** repetir la prueba que reveló el problema (worker
  real de resumen, con `navigator.gpu` presente pero sin adaptador
  funcional) y confirmar que ahora completa el resumen sin el fallo de
  memoria — descargando la variante `_quantized` (`q8`) en vez de la
  completa (`fp32`).

## Extensiones futuras

Sin cambios respecto a la lista ya documentada. Si en el futuro
`whisper.worker.ts`/`speakerSegmentation.worker.ts` añaden modelos más
grandes, revisar si necesitan el mismo tratamiento de `dtype` fijo.
