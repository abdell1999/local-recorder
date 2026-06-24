# Captura de audio de pestaña — diseño

## Contexto

El README (`README.md:21`) describe la grabación como "Captura desde
micrófono, pestaña del navegador o ambos (mezcla)". Hasta ahora solo existe
captura por micrófono (`useRecorder.ts`, vía `getUserMedia`). Esta fase añade
la captura de audio de una pestaña del navegador (vía `getDisplayMedia`)
como una segunda fuente disponible, para casos como grabar el audio de una
reunión online, un vídeo o cualquier contenido que esté sonando en otra
pestaña.

## Alcance

1. El usuario puede elegir, antes de grabar, entre micrófono (como hoy) o
   audio de una pestaña del navegador.
2. Validación de que la pestaña/ventana/pantalla compartida realmente
   incluye audio; si no, error claro sin llegar a grabar.
3. Manejo del caso en que el usuario cancela el selector nativo del
   navegador (equivalente a denegar permiso).

### Fuera de alcance (decisión explícita)

- **Sin mezcla simultánea de micrófono + pestaña.** El README la menciona
  como visión a futuro; mezclar dos streams de audio con `AudioContext` es
  una pieza de complejidad bastante mayor que añadir una segunda fuente
  alternativa, y no hay caso de uso concreto que la requiera ahora. Sigue
  en la lista de extensiones futuras.
- **Sin detección previa de soporte de `getDisplayMedia`.** Si el navegador
  no lo soporta, el intento de captura falla igual que un permiso denegado,
  mostrando el mismo mensaje `'tab-permission-denied'`. El mensaje no es
  100% preciso para ese caso concreto ("sin soporte" vs "permiso denegado"),
  pero evita añadir un cuarto estado de error solo para distinguirlo — no
  hay indicios de que el navegador objetivo de esta app carezca de esta API.
- **Sin restricción de qué puede compartir el usuario** en el selector
  nativo (pestaña concreta, ventana, o pantalla completa). Eso lo decide el
  propio navegador; la única validación de esta app es "¿el stream
  resultante tiene al menos una pista de audio?", independientemente de qué
  haya compartido.
- **Sin indicador visual propio de "compartiendo pantalla".** El navegador
  ya muestra su propia UI nativa para esto (barra/icono de "compartiendo");
  no se duplica en la app.

## Componentes y responsabilidades

- **`app/composables/useRecorder.ts`** (modificado): `start` pasa a aceptar
  un parámetro `source: 'microphone' | 'tab' = 'microphone'`.
  - Para `'microphone'`: comportamiento idéntico al actual
    (`getUserMedia({ audio: true })`).
  - Para `'tab'`: llama a
    `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })`
    (la API exige pedir vídeo aunque no se vaya a usar). Inmediatamente
    después de obtener el stream, se detienen y descartan sus pistas de
    vídeo (`stream.getVideoTracks().forEach(t => t.stop())`) — nunca se
    usan para nada. Se comprueba `stream.getAudioTracks().length > 0`; si
    es `0`, se detienen también las pistas de audio restantes, `state`
    pasa a `'error'` con `errorMessage = 'tab-audio-not-shared'`, y la
    función retorna sin crear el `MediaRecorder`. Si `getDisplayMedia`
    rechaza la promesa (usuario cancela el selector nativo, o permiso
    denegado), `state = 'error'` con `errorMessage = 'tab-permission-denied'`
    — mismo patrón que el `catch` ya existente para `'mic-permission-denied'`.
  - El resto de la función (creación del `MediaRecorder`, recolección de
    `chunks`, `stop()`) no cambia — es agnóstico a qué `MediaStream` recibió.
  - `RecorderState`/`errorMessage` no cambian de tipo (`errorMessage` ya es
    `string | null` de forma genérica); solo se añaden los dos nuevos
    valores de string posibles.

- **`app/components/recorder/RecordButton.vue`** (modificado): dos props
  nuevas, `source: 'microphone' | 'tab'` y `label: string` (sustituye al
  texto fijo `'Grabar'`). El botón **solo se renderiza cuando `state !==
  'recording'`** — `emit('start')` ya no necesita payload porque el padre
  asocia cada instancia del componente a una `source` fija mediante un
  listener distinto. Cuando `state === 'recording'`, el componente no
  renderiza nada (antes mostraba "Detener"; ese botón se traslada a
  `index.vue`, ver abajo, para que no compita con dos instancias mostrando
  "Detener" a la vez). El `data-testid` pasa a ser dinámico,
  `:data-testid="`record-button-${source}`"` (`record-button-microphone` /
  `record-button-tab`), para que los tests puedan distinguir ambas
  instancias — con dos `RecordButton` montados a la vez, un testid fijo
  compartido sería ambiguo.

- **`app/pages/index.vue`** (modificado):
  - Dos instancias de `RecordButton`:
    `<RecordButton source="microphone" label="Grabar micrófono" :state="recorderState" @start="handleRecordStart('microphone')" />` y
    `<RecordButton source="tab" label="Grabar pestaña" :state="recorderState" @start="handleRecordStart('tab')" />`.
  - Un botón "Detener" nuevo, independiente, visible solo con
    `v-if="recorderState === 'recording'"`, que llama a `handleRecordStop()`
    (ya existente, sin cambios en su lógica).
  - `handleRecordStart` pasa a aceptar `source: 'microphone' | 'tab'` y se
    lo reenvía a `startRecording(source)`.
  - Dos nuevos mensajes de error, junto al ya existente `recorder-error`:
    `<p v-if="recorderError === 'tab-permission-denied'" data-testid="tab-permission-error">No se concedió permiso para compartir la pestaña.</p>`
    y
    `<p v-if="recorderError === 'tab-audio-not-shared'" data-testid="tab-audio-error">No se compartió audio. Vuelve a intentarlo y marca "Compartir audio de la pestaña".</p>`.

## Flujo de datos

```
RecordButton (source="tab") @start ──► index.vue: handleRecordStart('tab')
                                              │
                                              ▼
                          useRecorder.start('tab')
                                              │
                          getDisplayMedia({video:true, audio:true})
                                              │
                       ┌──────────────────────┴──────────────────────┐
                       ▼                                              ▼
            sin pista de audio                              con pista de audio
                       │                                              │
                       ▼                                              ▼
   state='error', errorMessage=                      detiene pistas de vídeo,
   'tab-audio-not-shared'                             MediaRecorder.start(),
                       │                               state='recording'
                       ▼                                              │
   index.vue: muestra tab-audio-error                                ▼
                                                   index.vue: botón "Detener"
                                                   (compartido, no por fuente)
```

El resto del flujo (decodificación a PCM, transcripción, edición,
exportación) no cambia — recibe el mismo `Blob` que ya produce `stop()`,
sin saber de qué fuente vino.

## Manejo de errores

Cubierto en el flujo de datos arriba. Los tres estados de error de
`useRecorder` (`'mic-permission-denied'`, `'tab-permission-denied'`,
`'tab-audio-not-shared'`) son mutuamente excluyentes (uno por intento de
`start()`) y se muestran como mensajes `<p>` independientes en `index.vue`,
igual que el patrón ya existente para errores de transcripción e
importación.

## Testing

- **`useRecorder.test.ts`** (extendido):
  - `start('tab')` con éxito: stub de
    `navigator.mediaDevices.getDisplayMedia` devolviendo un stream con una
    pista de audio y una de vídeo (cada una como `{ stop: vi.fn() }`);
    verifica que la pista de vídeo recibe `stop()` y que `state` pasa a
    `'recording'`.
  - `start('tab')` sin pista de audio: stream solo con pista de vídeo;
    verifica `state === 'error'`, `errorMessage === 'tab-audio-not-shared'`,
    y que la pista de vídeo también recibe `stop()`.
  - `start('tab')` con el selector cancelado: `getDisplayMedia` rechaza;
    verifica `state === 'error'`, `errorMessage === 'tab-permission-denied'`.
  - Los tests existentes de `start()` (sin argumento) y `start('microphone')`
    siguen pasando sin modificación — `'microphone'` es el valor por
    defecto.
- **`RecordButton.test.ts`** (extendido): renderiza el texto de la prop
  `label` recibida (en vez del texto fijo `'Grabar'` anterior); no renderiza
  ningún botón cuando `state === 'recording'`; emite `start` al hacer clic.
  Los tests existentes que verifican el texto `'Grabar'`/`'Detener'` se
  actualizan para reflejar las nuevas props.
- **`index.test.ts`** (extendido): ambas instancias de `RecordButton`
  presentes en estado idle, localizables por sus `data-testid` distintos
  (`record-button-microphone`/`record-button-tab`) con su `label`/`source`
  correctos; un clic en cada una llama a `startRecording` con la fuente
  correspondiente; el botón "Detener" solo existe en el DOM cuando
  `recorderState === 'recording'` y llama a `stopRecording`; los dos
  mensajes de error nuevos se renderizan según el valor de `recorderError`.
- Suite E2E (`transcription-flow.spec.ts`): sin cambios necesarios — los
  tests E2E existentes de grabación usan el flujo de micrófono, que no
  cambia de comportamiento.

## Extensiones futuras

Sin cambios respecto a la lista ya documentada en la Fase 1 (diarización,
resumen LLM, persistencia cifrada, soporte RTL/japonés, streaming, fallback
ffmpeg.wasm), más la mezcla simultánea micrófono+pestaña mencionada en el
README, que queda fuera de esta fase (ver "Fuera de alcance").
