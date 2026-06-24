# Fallback WebGPU→WASM en los workers de IA — diseño

## Contexto

Al verificar manualmente en navegador la fase 2 de diarización (segmentación
troceada), se encontró que el worker nuevo fallaba con `no available
backend found. ERR: [webgpu] Error: Failed to get GPU adapter`. Al
investigar, se confirmó que **el mismo error afecta también a Whisper**
(`whisper.worker.ts`, ya en producción desde la Fase 1) en el mismo
navegador de prueba — no es un problema de la fase de diarización, es un
fallo preexistente compartido por los tres workers que cargan modelos de
IA (`whisper.worker.ts`, `summarizer.worker.ts`,
`speakerSegmentation.worker.ts`).

La detección de dispositivo actual, idéntica en los tres archivos:
```ts
const device = typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm'
```
solo comprueba que la *propiedad* `navigator.gpu` exista, no que
`requestAdapter()` realmente devuelva un adaptador funcional. Cuando
`navigator.gpu` existe pero la inicialización de WebGPU falla por
cualquier motivo (sin adaptador, drivers, hardware virtualizado, etc.), el
worker se cae entero — sin ningún intento de caer a `wasm`, a pesar de que
los tres workers ya soportan `wasm` perfectamente como dispositivo
alternativo.

## Alcance

1. Una utilidad compartida que intenta cargar con `device: 'webgpu'` y, si
   falla por cualquier motivo, reintenta automáticamente con `device:
   'wasm'` antes de propagar un error.
2. Los tres workers existentes (`whisper.worker.ts`, `summarizer.worker.ts`,
   `speakerSegmentation.worker.ts`) se modifican para usar esta utilidad en
   vez de su cálculo de `device` actual.

### Fuera de alcance (decisión explícita)

- **Sin detección proactiva** (`await navigator.gpu.requestAdapter()` antes
  de decidir). Solo cubriría el caso "no hay adaptador"; el try/catch
  reactivo cubre ese caso y cualquier otro fallo de inicialización de
  WebGPU dentro de `from_pretrained`/`pipeline()`, con menos código.
- **Sin tercera red de seguridad si `wasm` también falla.** Si el propio
  intento con `wasm` falla, el error se propaga tal cual (mismo
  comportamiento que ya existe hoy si el único intento fallaba).
- **Sin cambios de UI.** El aviso `wasm-fallback-notice` ya existente en
  `index.vue` (condicionado a `transcriptionDevice === 'wasm'`) ya cubre
  este caso automáticamente, sea por ausencia de WebGPU o por fallo de
  inicialización — no le importa el motivo.
- **Sin caché entre intentos del progreso de descarga.** Si el intento
  WebGPU llega a descargar parte de los pesos del modelo antes de fallar
  (puede pasar — el fallo puede ocurrir después de empezar la descarga),
  el intento WASM puede tener que descargar sus propios archivos desde
  cero (pueden ser variantes de precisión distintas — se observaron
  `dtype fp32` para webgpu vs `q8` para wasm en los mismos modelos). No se
  optimiza este caso (es una ruta de fallo, no el camino feliz).

## Componentes y responsabilidades

- **`app/utils/modelDevice.ts`** (nuevo, puro, testeable):
  ```ts
  export type ModelDevice = 'webgpu' | 'wasm'

  export async function loadWithDeviceFallback<T>(
    loadFn: (device: ModelDevice) => Promise<T>,
  ): Promise<{ result: T; device: ModelDevice }> {
    const canTryWebgpu = typeof navigator !== 'undefined' && 'gpu' in navigator
    if (canTryWebgpu) {
      try {
        return { result: await loadFn('webgpu'), device: 'webgpu' }
      } catch {
        // WebGPU existe pero falló al inicializar — se ignora y se
        // reintenta con WASM en vez de propagar el error.
      }
    }
    return { result: await loadFn('wasm'), device: 'wasm' }
  }
  ```
  `loadFn` recibe el `device` a intentar y devuelve la promesa de carga
  del modelo/pipeline correspondiente — agnóstico de qué se está cargando
  (pipeline de Whisper, de resumen, o `AutoModelForAudioFrameClassification`
  de segmentación), cada worker decide qué pasar.

- **`app/workers/whisper.worker.ts`** (modificado), `getTranscriber`:
  cambia de calcular `device` y pasarlo directo a `pipeline(...)`, a
  envolver esa llamada en `loadWithDeviceFallback`. **Importante:** el
  `createProgressAggregator` se crea *dentro* del `loadFn` (un agregador
  nuevo por intento), no una sola vez fuera — si se compartiera entre el
  intento fallido de WebGPU y el de WASM, acumularía entradas de archivos
  del intento fallido (potencialmente de una variante de precisión
  distinta) y el porcentaje del segundo intento saldría mal calculado. El
  mensaje `{type:'device', device}` se postea con el dispositivo que
  **realmente funcionó**, después de que `loadWithDeviceFallback` resuelva
  — no antes, como hace el código actual.

- **`app/workers/summarizer.worker.ts`** (modificado), `getGenerator`:
  mismo cambio exacto que `whisper.worker.ts`, adaptado a
  `pipeline<'text-generation'>(...)`.

- **`app/workers/speakerSegmentation.worker.ts`** (modificado),
  `getModelAndProcessor`: mismo cambio, envolviendo solo la carga del
  modelo (`AutoModelForAudioFrameClassification.from_pretrained`) — la
  carga del `processor` no depende de `device` y no cambia.

## Flujo de datos

```
getTranscriber/getGenerator/getModelAndProcessor()
              │
              ▼
   loadWithDeviceFallback(loadFn)
              │
   navigator.gpu existe? ──No──► loadFn('wasm') ──► {result, device:'wasm'}
              │ Sí
              ▼
   loadFn('webgpu') ──éxito──► {result, device:'webgpu'}
              │
           falla
              ▼
   loadFn('wasm') ──► {result, device:'wasm'} (o propaga error si esto también falla)
              │
              ▼
   post({type:'device', device})   ← el que realmente funcionó
```

## Manejo de errores

Si `wasm` también falla tras el fallback, el error se propaga sin
capturar dentro de `loadWithDeviceFallback`, llega al `try/catch` ya
existente en `self.onmessage` de cada worker, y cae en el mismo
`{type:'error', message}` que ya existe — comportamiento idéntico al caso
actual donde el único intento fallaba.

## Testing

- **`modelDevice.test.ts`** (nuevo):
  - Usa `webgpu` cuando `navigator.gpu` existe y `loadFn` tiene éxito en
    el primer intento (`loadFn` llamado una sola vez, con `'webgpu'`).
  - Cae a `wasm` cuando `navigator.gpu` existe pero `loadFn('webgpu')`
    rechaza (`loadFn` llamado dos veces: `'webgpu'` luego `'wasm'`).
  - Usa `wasm` directamente cuando `navigator.gpu` no existe (`loadFn`
    llamado una sola vez, con `'wasm'`, sin intentar `'webgpu'` primero).
  - Propaga el error si **ambos** intentos (`webgpu` y `wasm`) fallan.
- **Los tres workers**: sin test unitario directo (igual que siempre,
  requieren navegador real para `pipeline()`/`AutoModel`) — se verifican
  por lectura de código.
- **Verificación manual:** repetir el mismo script de Playwright que
  reveló el bug original (mismo navegador headless sin adaptador GPU
  real) y confirmar que ahora Whisper llega a transcribir usando `wasm`
  en vez de fallar con el error de adaptador. Es la prueba de regresión
  exacta para este fix — no hace falta ningún arnés temporal en la app,
  ya que se está verificando una ruta que ya existe (transcripción +
  `wasm-fallback-notice`), no una pieza nueva sin UI.

## Extensiones futuras

Sin cambios respecto a la lista ya documentada. Esta fase es una
corrección de robustez transversal a los tres workers existentes, no
añade ninguna superficie de producto nueva. La fase 3 de diarización
(embeddings + clustering) sigue pendiente de diseñar, sin relación con
este fix salvo que `speakerSegmentation.worker.ts` también se beneficia de
él.
