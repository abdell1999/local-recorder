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
import { formatElapsed } from '../utils/formatElapsed'

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
  elapsedSeconds: transcriptionElapsed,
  eta: transcriptionEta,
  transcriptionDuration,
  chunkProgress,
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
  <div class="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
    <main class="max-w-3xl mx-auto px-4 py-8 space-y-4">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-extrabold tracking-tight">Local<span class="text-indigo-500">Recorder</span></h1>
        <ThemeToggle />
      </div>

      <!-- Configuración -->
      <section class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
        <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
          Configuración
        </h2>
        <div class="flex items-center gap-4 flex-wrap">
          <div class="flex items-center gap-2">
            <span class="text-sm text-slate-600 dark:text-slate-400">Modelo:</span>
            <ModelSizePicker
              :model-value="modelSize"
              :disabled="transcriptionState === 'loading-model' || transcriptionState === 'transcribing'"
              @update:model-value="setModelSize"
            />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm text-slate-600 dark:text-slate-400">Idioma:</span>
            <LanguagePicker
              :model-value="language"
              :disabled="transcriptionState === 'loading-model' || transcriptionState === 'transcribing'"
              @update:model-value="setLanguage"
            />
          </div>
        </div>
      </section>

      <!-- Captura -->
      <section class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm space-y-4">
        <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
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
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm bg-red-600 hover:bg-red-700 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
            @click="handleRecordStop"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
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
      <div class="space-y-2">
        <p v-if="transcriptionDevice === 'wasm'" data-testid="wasm-fallback-notice" class="text-sm text-amber-600 dark:text-amber-400 px-1">
          Tu navegador no soporta WebGPU: usando modo compatibilidad (más lento).
        </p>
        <div
          v-if="transcriptionState === 'loading-model'"
          class="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 p-4 space-y-2"
        >
          <p data-testid="status-loading-model" class="text-sm text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
            <svg class="animate-spin h-4 w-4 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Descargando modelo de transcripción…
          </p>
          <div v-if="downloadProgress !== null" class="w-full bg-indigo-100 dark:bg-indigo-900/50 rounded-full h-1.5">
            <div
              data-testid="model-download-progress"
              class="bg-indigo-500 h-1.5 rounded-full transition-all"
              :style="{ width: `${downloadProgress}%` }"
            />
          </div>
        </div>
        <div
          v-if="transcriptionState === 'transcribing'"
          class="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 p-4 space-y-2"
        >
          <p data-testid="status-transcribing" class="text-sm text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
            <svg class="animate-spin h-4 w-4 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Transcribiendo… {{ formatElapsed(transcriptionElapsed) }}<span v-if="transcriptionEta !== null"> · ETA ~{{ formatElapsed(transcriptionEta) }}</span>
          </p>
          <div v-if="chunkProgress !== null" class="w-full bg-indigo-100 dark:bg-indigo-900/50 rounded-full h-1.5">
            <div
              data-testid="chunk-progress"
              class="bg-indigo-500 h-1.5 rounded-full transition-all"
              :style="{ width: `${(chunkProgress.done / chunkProgress.total) * 100}%` }"
            />
          </div>
        </div>
        <div v-if="transcriptionState === 'error'" data-testid="transcription-error" class="text-sm text-red-600 dark:text-red-400 flex items-center gap-2 px-1">
          <p>{{ transcriptionError ?? 'Ocurrió un error al transcribir.' }}</p>
          <button data-testid="retry-button" class="underline hover:no-underline" @click="handleRetry">Reintentar</button>
        </div>
      </div>

      <template v-if="transcriptionState === 'done'">
        <p v-if="editedText.trim() === ''" data-testid="no-speech-detected" class="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
          No se detectó voz en el audio.
        </p>
        <template v-else>

          <!-- Transcripción -->
          <section class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <div class="flex items-center gap-3">
                <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Transcripción
                </h2>
                <span
                  v-if="transcriptionDuration !== null"
                  data-testid="transcription-duration"
                  class="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {{ formatElapsed(transcriptionDuration) }}
                </span>
              </div>
              <ExportMenu
                :result="{ text: editedText, chunks: transcriptionChunks }"
                :segments="diarizationState === 'done' ? diarizationSegments : undefined"
              />
            </div>
            <div class="p-4">
              <TranscriptEditor v-model="editedText" />
            </div>
          </section>

          <!-- Acciones -->
          <section class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">

            <!-- Resumir -->
            <div class="p-4 space-y-3">
              <div class="flex items-center gap-3 flex-wrap">
                <button
                  data-testid="summarize-button"
                  class="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm bg-blue-600 hover:bg-blue-700 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  :disabled="summarizerState === 'loading-model' || summarizerState === 'summarizing'"
                  @click="handleSummarize"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>
                  Resumir
                </button>
                <div class="flex items-center gap-2">
                  <span class="text-sm text-slate-500 dark:text-slate-400">Modelo:</span>
                  <LlmModelSizePicker
                    :model-value="llmModelSize"
                    :disabled="summarizerState === 'loading-model' || summarizerState === 'summarizing'"
                    @update:model-value="setLlmModelSize"
                  />
                </div>
              </div>
              <p v-if="summarizerState === 'loading-model'" data-testid="status-loading-model-llm" class="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <svg class="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Descargando modelo de resumen…
              </p>
              <div v-if="summaryDownloadProgress !== null" class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                <div
                  data-testid="llm-download-progress"
                  class="bg-blue-500 h-1.5 rounded-full transition-all"
                  :style="{ width: `${summaryDownloadProgress}%` }"
                />
              </div>
              <p v-if="summarizerState === 'summarizing'" data-testid="status-summarizing-llm" class="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
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
            <div class="border-t border-slate-200 dark:border-slate-700 p-4 space-y-3">
              <button
                data-testid="diarize-button"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm bg-violet-600 hover:bg-violet-700 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="diarizationState === 'loading-model' || diarizationState === 'segmenting' || diarizationState === 'identifying-speakers'"
                @click="handleDiarize"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                Identificar hablantes
              </button>
              <p v-if="diarizationState === 'loading-model'" data-testid="status-loading-model-diarization" class="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <svg class="animate-spin h-4 w-4 text-violet-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Descargando modelo de diarización…
              </p>
              <div v-if="diarizationDownloadProgress !== null" class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                <div
                  data-testid="diarization-download-progress"
                  class="bg-violet-500 h-1.5 rounded-full transition-all"
                  :style="{ width: `${diarizationDownloadProgress}%` }"
                />
              </div>
              <p v-if="diarizationState === 'segmenting'" data-testid="status-segmenting" class="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <svg class="animate-spin h-4 w-4 text-violet-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Segmentando audio…
              </p>
              <p v-if="diarizationState === 'identifying-speakers'" data-testid="status-identifying-speakers" class="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <svg class="animate-spin h-4 w-4 text-violet-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
