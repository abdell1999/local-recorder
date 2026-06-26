<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import RecordButton from '../components/recorder/RecordButton.vue'
import RecordingTimer from '../components/recorder/RecordingTimer.vue'
import FileDropzone from '../components/importer/FileDropzone.vue'
import TranscriptEditor from '../components/transcript/TranscriptEditor.vue'
import ExportMenu from '../components/export/ExportMenu.vue'
import ModelSizePicker from '../components/settings/ModelSizePicker.vue'
import LanguagePicker from '../components/settings/LanguagePicker.vue'
import LlmModelSizePicker from '../components/settings/LlmModelSizePicker.vue'
import SummaryEditor from '../components/summary/SummaryEditor.vue'
import SpeakerTranscriptView from '../components/diarization/SpeakerTranscriptView.vue'
import { useRecorder, type RecorderSource } from '../composables/useRecorder'
import { useFileImport } from '../composables/useFileImport'
import { useModelSelector } from '../composables/useModelSelector'
import { useLanguageSelector } from '../composables/useLanguageSelector'
import { useLlmModelSelector } from '../composables/useLlmModelSelector'
import { useTranscription } from '../composables/useTranscription'
import { useSummarizer } from '../composables/useSummarizer'
import { useSpeakerSegmentation } from '../composables/useSpeakerSegmentation'
import { decodeAudioFile } from '../utils/audio/decodeAudioFile'
import { alignChunksWithSpeakers } from '../utils/speakerTranscriptAlignment'

const {
  state: recorderState,
  errorMessage: recorderError,
  start: startRecording,
  stop: stopRecording,
} = useRecorder()

const { errorMessage: importError, importFile } = useFileImport()

const { modelSize, setModelSize } = useModelSelector()

const { language, setLanguage } = useLanguageSelector()

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

const { modelSize: llmModelSize, setModelSize: setLlmModelSize } = useLlmModelSelector()

const {
  state: diarizationState,
  segments: diarizationSegments,
  errorMessage: diarizationError,
  downloadProgress: diarizationDownloadProgress,
  segment: segmentAudio,
  retry: retryDiarization,
  reset: resetDiarization,
} = useSpeakerSegmentation()

const speakerBlocks = computed(() =>
  alignChunksWithSpeakers(transcriptionChunks.value, diarizationSegments.value),
)

function handleDiarize() {
  segmentAudio(lastAudio.value!)
}

function handleDiarizeRetry() {
  retryDiarization(lastAudio.value!)
}

const {
  state: summarizerState,
  summary,
  errorMessage: summarizerError,
  downloadProgress: summaryDownloadProgress,
  summarize,
  retry: retrySummarize,
} = useSummarizer()

const editedSummary = ref('')

watch(summarizerState, (state) => {
  if (state === 'done') editedSummary.value = summary.value
})

function handleSummarize() {
  summarize(editedText.value, llmModelSize.value)
}

function handleSummarizeRetry() {
  retrySummarize(editedText.value, llmModelSize.value)
}

const elapsedSeconds = ref(0)
const editedText = ref('')
const importRejectedReason = ref<string | null>(null)
const lastAudio = ref<Float32Array | null>(null)
let timerInterval: ReturnType<typeof setInterval> | null = null

watch(transcriptionState, (state) => {
  if (state === 'done') editedText.value = transcriptionText.value
})

watch(transcriptionState, (state) => {
  if (state === 'loading-model') resetDiarization()
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
  transcribe(pcm, modelSize.value, language.value)
}

async function handleFileSelected(file: File) {
  importRejectedReason.value = null
  const pcm = await importFile(file)
  if (pcm) {
    lastAudio.value = pcm
    transcribe(pcm, modelSize.value, language.value)
  }
}

function handleFileRejected(reason: string) {
  importRejectedReason.value = reason
}

function handleRetry() {
  if (lastAudio.value) retry(lastAudio.value, modelSize.value, language.value)
}
</script>

<template>
  <main class="max-w-2xl mx-auto p-6 space-y-6">
    <h1 class="text-2xl font-bold">Local Recorder</h1>

    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-sm text-gray-600">Modelo:</span>
      <ModelSizePicker
        :model-value="modelSize"
        :disabled="transcriptionState === 'loading-model' || transcriptionState === 'transcribing'"
        @update:model-value="setModelSize"
      />
      <span class="text-sm text-gray-600">Idioma:</span>
      <LanguagePicker
        :model-value="language"
        :disabled="transcriptionState === 'loading-model' || transcriptionState === 'transcribing'"
        @update:model-value="setLanguage"
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
        <ExportMenu
          :result="{ text: editedText, chunks: transcriptionChunks }"
          :segments="diarizationState === 'done' ? diarizationSegments : undefined"
        />

        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-600">Modelo de resumen:</span>
          <LlmModelSizePicker
            :model-value="llmModelSize"
            :disabled="summarizerState === 'loading-model' || summarizerState === 'summarizing'"
            @update:model-value="setLlmModelSize"
          />
          <button
            data-testid="summarize-button"
            class="px-4 py-2 rounded font-semibold bg-blue-600 text-white"
            :disabled="summarizerState === 'loading-model' || summarizerState === 'summarizing'"
            @click="handleSummarize"
          >
            Resumir
          </button>
        </div>
        <p v-if="summarizerState === 'loading-model'" data-testid="status-loading-model-llm">Descargando modelo de resumen…</p>
        <progress
          v-if="summaryDownloadProgress !== null"
          data-testid="llm-download-progress"
          :value="summaryDownloadProgress"
          max="100"
        />
        <p v-if="summarizerState === 'summarizing'" data-testid="status-summarizing-llm">Generando resumen…</p>
        <div v-if="summarizerState === 'error'" data-testid="summarize-error">
          <p class="text-red-600">{{ summarizerError ?? 'Ocurrió un error al generar el resumen.' }}</p>
          <button data-testid="summarize-retry-button" class="underline" @click="handleSummarizeRetry">Reintentar</button>
        </div>
        <SummaryEditor v-if="summarizerState === 'done'" v-model="editedSummary" />

        <div class="flex items-center gap-2">
          <button
            data-testid="diarize-button"
            class="px-4 py-2 rounded font-semibold bg-purple-600 text-white"
            :disabled="diarizationState === 'loading-model' || diarizationState === 'segmenting' || diarizationState === 'identifying-speakers'"
            @click="handleDiarize"
          >
            Identificar hablantes
          </button>
        </div>
        <p v-if="diarizationState === 'loading-model'" data-testid="status-loading-model-diarization">
          Descargando modelo de diarización…
        </p>
        <progress
          v-if="diarizationDownloadProgress !== null"
          data-testid="diarization-download-progress"
          :value="diarizationDownloadProgress"
          max="100"
        />
        <p v-if="diarizationState === 'segmenting'" data-testid="status-segmenting">
          Segmentando audio…
        </p>
        <p v-if="diarizationState === 'identifying-speakers'" data-testid="status-identifying-speakers">
          Identificando hablantes…
        </p>
        <div v-if="diarizationState === 'error'" data-testid="diarization-error">
          <p class="text-red-600">{{ diarizationError ?? 'Ocurrió un error al identificar hablantes.' }}</p>
          <button data-testid="diarize-retry-button" class="underline" @click="handleDiarizeRetry">Reintentar</button>
        </div>
        <SpeakerTranscriptView
          v-if="diarizationState === 'done'"
          data-testid="speaker-transcript-view"
          :blocks="speakerBlocks"
        />
      </template>
    </template>
  </main>
</template>
