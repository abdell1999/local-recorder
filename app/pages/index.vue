<script setup lang="ts">
import { ref, watch } from 'vue'
import RecordButton from '../components/recorder/RecordButton.vue'
import RecordingTimer from '../components/recorder/RecordingTimer.vue'
import FileDropzone from '../components/importer/FileDropzone.vue'
import TranscriptEditor from '../components/transcript/TranscriptEditor.vue'
import ExportMenu from '../components/export/ExportMenu.vue'
import ModelSizePicker from '../components/settings/ModelSizePicker.vue'
import { useRecorder, type RecorderSource } from '../composables/useRecorder'
import { useFileImport } from '../composables/useFileImport'
import { useModelSelector } from '../composables/useModelSelector'
import { useTranscription } from '../composables/useTranscription'
import { decodeAudioFile } from '../utils/audio/decodeAudioFile'

const {
  state: recorderState,
  errorMessage: recorderError,
  start: startRecording,
  stop: stopRecording,
} = useRecorder()

const { errorMessage: importError, importFile } = useFileImport()

const { modelSize, setModelSize } = useModelSelector()

const {
  state: transcriptionState,
  text: transcriptionText,
  chunks: transcriptionChunks,
  errorMessage: transcriptionError,
  device: transcriptionDevice,
  downloadProgress,
  transcribe,
  retry,
} = useTranscription()

const elapsedSeconds = ref(0)
const editedText = ref('')
const importRejectedReason = ref<string | null>(null)
const lastAudio = ref<Float32Array | null>(null)
let timerInterval: ReturnType<typeof setInterval> | null = null

watch(transcriptionState, (state) => {
  if (state === 'done') editedText.value = transcriptionText.value
})

async function handleRecordStart(source: RecorderSource) {
  await startRecording(source)
  if (recorderState.value !== 'recording') return
  elapsedSeconds.value = 0
  timerInterval = setInterval(() => {
    elapsedSeconds.value += 1
  }, 1000)
}

async function handleRecordStop() {
  const blob = await stopRecording()
  if (timerInterval) clearInterval(timerInterval)
  const arrayBuffer = await blob.arrayBuffer()
  const pcm = await decodeAudioFile(arrayBuffer)
  lastAudio.value = pcm
  transcribe(pcm, modelSize.value)
}

async function handleFileSelected(file: File) {
  importRejectedReason.value = null
  const pcm = await importFile(file)
  if (pcm) {
    lastAudio.value = pcm
    transcribe(pcm, modelSize.value)
  }
}

function handleFileRejected(reason: string) {
  importRejectedReason.value = reason
}

function handleRetry() {
  if (lastAudio.value) retry(lastAudio.value, modelSize.value)
}
</script>

<template>
  <main class="max-w-2xl mx-auto p-6 space-y-6">
    <h1 class="text-2xl font-bold">Local Recorder</h1>

    <div class="flex items-center gap-2">
      <span class="text-sm text-gray-600">Modelo:</span>
      <ModelSizePicker
        :model-value="modelSize"
        :disabled="transcriptionState === 'loading-model' || transcriptionState === 'transcribing'"
        @update:model-value="setModelSize"
      />
    </div>

    <section class="flex items-center gap-4">
      <RecordButton
        source="microphone"
        label="Grabar micrófono"
        :state="recorderState"
        @start="handleRecordStart('microphone')"
      />
      <RecordButton
        source="tab"
        label="Grabar pestaña"
        :state="recorderState"
        @start="handleRecordStart('tab')"
      />
      <button
        v-if="recorderState === 'recording'"
        data-testid="stop-button"
        class="px-4 py-2 rounded font-semibold bg-red-600 text-white"
        @click="handleRecordStop"
      >
        Detener
      </button>
      <RecordingTimer v-if="recorderState === 'recording'" :seconds="elapsedSeconds" />
    </section>
    <p v-if="recorderError === 'mic-permission-denied'" data-testid="recorder-error" class="text-red-600">
      No se pudo acceder al micrófono. Revisa los permisos del navegador.
    </p>
    <p v-if="recorderError === 'tab-permission-denied'" data-testid="tab-permission-error" class="text-red-600">
      No se concedió permiso para compartir la pestaña.
    </p>
    <p v-if="recorderError === 'tab-audio-not-shared'" data-testid="tab-audio-error" class="text-red-600">
      No se compartió audio. Vuelve a intentarlo y marca "Compartir audio de la pestaña".
    </p>

    <FileDropzone @file-selected="handleFileSelected" @rejected="handleFileRejected" />
    <p v-if="importRejectedReason || importError" data-testid="import-error" class="text-red-600">
      Formato de archivo no soportado. Prueba con mp3, wav, m4a, mp4 o webm.
    </p>

    <p v-if="transcriptionDevice === 'wasm'" data-testid="wasm-fallback-notice">
      Tu navegador no soporta WebGPU: usando modo compatibilidad (más lento).
    </p>
    <p v-if="transcriptionState === 'loading-model'" data-testid="status-loading-model">Descargando modelo de transcripción…</p>
    <progress
      v-if="downloadProgress !== null"
      data-testid="model-download-progress"
      :value="downloadProgress"
      max="100"
    />
    <p v-if="transcriptionState === 'transcribing'" data-testid="status-transcribing">Transcribiendo…</p>
    <div v-if="transcriptionState === 'error'" data-testid="transcription-error">
      <p class="text-red-600">{{ transcriptionError ?? 'Ocurrió un error al transcribir.' }}</p>
      <button data-testid="retry-button" class="underline" @click="handleRetry">Reintentar</button>
    </div>

    <template v-if="transcriptionState === 'done'">
      <p v-if="editedText.trim() === ''" data-testid="no-speech-detected">No se detectó voz en el audio.</p>
      <template v-else>
        <TranscriptEditor v-model="editedText" />
        <ExportMenu :result="{ text: editedText, chunks: transcriptionChunks }" />
      </template>
    </template>
  </main>
</template>
