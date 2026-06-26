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
import ThemeToggle from '../components/settings/ThemeToggle.vue'
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
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
    <main class="max-w-3xl mx-auto px-4 py-8 space-y-4">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold tracking-tight">Local Recorder</h1>
        <ThemeToggle />
      </div>

      <!-- Configuración -->
      <section class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
        <h2 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Configuración
        </h2>
        <div class="flex items-center gap-4 flex-wrap">
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600 dark:text-gray-400">Modelo:</span>
            <ModelSizePicker
              :model-value="modelSize"
              :disabled="transcriptionState === 'loading-model' || transcriptionState === 'transcribing'"
              @update:model-value="setModelSize"
            />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600 dark:text-gray-400">Idioma:</span>
            <LanguagePicker
              :model-value="language"
              :disabled="transcriptionState === 'loading-model' || transcriptionState === 'transcribing'"
              @update:model-value="setLanguage"
            />
          </div>
        </div>
      </section>

      <!-- Captura -->
      <section class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm space-y-4">
        <h2 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Captura
        </h2>
        <div class="flex items-center gap-3 flex-wrap">
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
            class="px-4 py-2 rounded-lg font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
            @click="handleRecordStop"
          >
            Detener
          </button>
          <RecordingTimer v-if="recorderState === 'recording'" :seconds="elapsedSeconds" />
        </div>
        <p v-if="recorderError === 'mic-permission-denied'" data-testid="recorder-error" class="text-sm text-red-600 dark:text-red-400">
          No se pudo acceder al micrófono. Revisa los permisos del navegador.
        </p>
        <p v-if="recorderError === 'tab-permission-denied'" data-testid="tab-permission-error" class="text-sm text-red-600 dark:text-red-400">
          No se concedió permiso para compartir la pestaña.
        </p>
        <p v-if="recorderError === 'tab-audio-not-shared'" data-testid="tab-audio-error" class="text-sm text-red-600 dark:text-red-400">
          No se compartió audio. Vuelve a intentarlo y marca "Compartir audio de la pestaña".
        </p>
        <FileDropzone @file-selected="handleFileSelected" @rejected="handleFileRejected" />
        <p v-if="importRejectedReason || importError" data-testid="import-error" class="text-sm text-red-600 dark:text-red-400">
          Formato de archivo no soportado. Prueba con mp3, wav, m4a, mp4 o webm.
        </p>
      </section>

      <!-- Estado de transcripción -->
      <div class="space-y-2 px-1">
        <p v-if="transcriptionDevice === 'wasm'" data-testid="wasm-fallback-notice" class="text-sm text-amber-600 dark:text-amber-400">
          Tu navegador no soporta WebGPU: usando modo compatibilidad (más lento).
        </p>
        <p v-if="transcriptionState === 'loading-model'" data-testid="status-loading-model" class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <svg class="animate-spin h-4 w-4 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Descargando modelo de transcripción…
        </p>
        <div v-if="downloadProgress !== null" class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
          <div
            data-testid="model-download-progress"
            class="bg-indigo-500 h-1.5 rounded-full transition-all"
            :style="{ width: `${downloadProgress}%` }"
          />
        </div>
        <p v-if="transcriptionState === 'transcribing'" data-testid="status-transcribing" class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <svg class="animate-spin h-4 w-4 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Transcribiendo…
        </p>
        <div v-if="transcriptionState === 'error'" data-testid="transcription-error" class="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
          <p>{{ transcriptionError ?? 'Ocurrió un error al transcribir.' }}</p>
          <button data-testid="retry-button" class="underline hover:no-underline" @click="handleRetry">Reintentar</button>
        </div>
      </div>

      <template v-if="transcriptionState === 'done'">
        <p v-if="editedText.trim() === ''" data-testid="no-speech-detected" class="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
          No se detectó voz en el audio.
        </p>
        <template v-else>

          <!-- Transcripción -->
          <section class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm space-y-3">
            <div class="flex items-center justify-between">
              <h2 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Transcripción
              </h2>
              <ExportMenu
                :result="{ text: editedText, chunks: transcriptionChunks }"
                :segments="diarizationState === 'done' ? diarizationSegments : undefined"
              />
            </div>
            <TranscriptEditor v-model="editedText" />
          </section>

          <!-- Acciones -->
          <section class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm space-y-4">

            <!-- Resumir -->
            <div class="space-y-3">
              <div class="flex items-center gap-3 flex-wrap">
                <button
                  data-testid="summarize-button"
                  class="px-4 py-2 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  :disabled="summarizerState === 'loading-model' || summarizerState === 'summarizing'"
                  @click="handleSummarize"
                >
                  Resumir
                </button>
                <div class="flex items-center gap-2">
                  <span class="text-sm text-gray-500 dark:text-gray-400">Modelo:</span>
                  <LlmModelSizePicker
                    :model-value="llmModelSize"
                    :disabled="summarizerState === 'loading-model' || summarizerState === 'summarizing'"
                    @update:model-value="setLlmModelSize"
                  />
                </div>
              </div>
              <p v-if="summarizerState === 'loading-model'" data-testid="status-loading-model-llm" class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <svg class="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Descargando modelo de resumen…
              </p>
              <div v-if="summaryDownloadProgress !== null" class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div
                  data-testid="llm-download-progress"
                  class="bg-blue-500 h-1.5 rounded-full transition-all"
                  :style="{ width: `${summaryDownloadProgress}%` }"
                />
              </div>
              <p v-if="summarizerState === 'summarizing'" data-testid="status-summarizing-llm" class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <svg class="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Generando resumen…
              </p>
              <div v-if="summarizerState === 'error'" data-testid="summarize-error" class="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                <p>{{ summarizerError ?? 'Ocurrió un error al generar el resumen.' }}</p>
                <button data-testid="summarize-retry-button" class="underline hover:no-underline" @click="handleSummarizeRetry">Reintentar</button>
              </div>
              <SummaryEditor v-if="summarizerState === 'done'" v-model="editedSummary" />
            </div>

            <!-- Diarizar -->
            <div class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
              <button
                data-testid="diarize-button"
                class="px-4 py-2 rounded-lg font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="diarizationState === 'loading-model' || diarizationState === 'segmenting' || diarizationState === 'identifying-speakers'"
                @click="handleDiarize"
              >
                Identificar hablantes
              </button>
              <p v-if="diarizationState === 'loading-model'" data-testid="status-loading-model-diarization" class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <svg class="animate-spin h-4 w-4 text-purple-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Descargando modelo de diarización…
              </p>
              <div v-if="diarizationDownloadProgress !== null" class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div
                  data-testid="diarization-download-progress"
                  class="bg-purple-500 h-1.5 rounded-full transition-all"
                  :style="{ width: `${diarizationDownloadProgress}%` }"
                />
              </div>
              <p v-if="diarizationState === 'segmenting'" data-testid="status-segmenting" class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <svg class="animate-spin h-4 w-4 text-purple-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Segmentando audio…
              </p>
              <p v-if="diarizationState === 'identifying-speakers'" data-testid="status-identifying-speakers" class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <svg class="animate-spin h-4 w-4 text-purple-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Identificando hablantes…
              </p>
              <div v-if="diarizationState === 'error'" data-testid="diarization-error" class="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                <p>{{ diarizationError ?? 'Ocurrió un error al identificar hablantes.' }}</p>
                <button data-testid="diarize-retry-button" class="underline hover:no-underline" @click="handleDiarizeRetry">Reintentar</button>
              </div>
              <SpeakerTranscriptView
                v-if="diarizationState === 'done'"
                data-testid="speaker-transcript-view"
                :blocks="speakerBlocks"
              />
            </div>

          </section>

        </template>
      </template>

    </main>
  </div>
</template>
