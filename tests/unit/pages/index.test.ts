import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const startRecording = vi.fn()
const stopRecording = vi.fn().mockResolvedValue(new Blob())
const importFile = vi.fn()
const transcribe = vi.fn()
const retry = vi.fn()

const recorderState = ref('idle')
const recorderError = ref<string | null>(null)
const importError = ref<string | null>(null)
const modelSize = ref('small')
const transcriptionState = ref('idle')
const transcriptionText = ref('')
const transcriptionChunks = ref<{ text: string; timestamp: [number, number | null] }[]>([])
const transcriptionError = ref<string | null>(null)
const transcriptionDevice = ref<'webgpu' | 'wasm' | null>(null)
const downloadProgress = ref<number | null>(null)
const transcriptionElapsed = ref(0)
const transcriptionEta = ref<number | null>(null)
const transcriptionDurationRef = ref<number | null>(null)
const chunkProgressRef = ref<{ done: number; total: number } | null>(null)

vi.mock('../../../app/composables/useRecorder', () => ({
  useRecorder: () => ({ state: recorderState, errorMessage: recorderError, start: startRecording, stop: stopRecording }),
}))
vi.mock('../../../app/composables/useFileImport', () => ({
  useFileImport: () => ({ state: ref('idle'), errorMessage: importError, importFile }),
}))
const setModelSize = vi.fn()

vi.mock('../../../app/composables/useModelSelector', () => ({
  useModelSelector: () => ({ modelSize, setModelSize }),
}))

const summarize = vi.fn()
const retrySummarize = vi.fn()
const setLlmModelSize = vi.fn()
const llmModelSize = ref('0.5b')
const summarizerState = ref('idle')
const summary = ref('')
const summarizerError = ref<string | null>(null)
const summaryDownloadProgress = ref<number | null>(null)

vi.mock('../../../app/composables/useLlmModelSelector', () => ({
  useLlmModelSelector: () => ({ modelSize: llmModelSize, setModelSize: setLlmModelSize }),
}))
vi.mock('../../../app/composables/useSummarizer', () => ({
  useSummarizer: () => ({
    state: summarizerState,
    summary,
    errorMessage: summarizerError,
    downloadProgress: summaryDownloadProgress,
    summarize,
    retry: retrySummarize,
  }),
}))
vi.mock('../../../app/composables/useTranscription', () => ({
  useTranscription: () => ({
    state: transcriptionState,
    text: transcriptionText,
    chunks: transcriptionChunks,
    errorMessage: transcriptionError,
    device: transcriptionDevice,
    downloadProgress,
    elapsedSeconds: transcriptionElapsed,
    eta: transcriptionEta,
    transcriptionDuration: transcriptionDurationRef,
    chunkProgress: chunkProgressRef,
    transcribe,
    retry,
  }),
}))
vi.mock('../../../app/utils/audio/decodeAudioFile', () => ({
  decodeAudioFile: vi.fn().mockResolvedValue(new Float32Array([0])),
}))

import IndexPage from '../../../app/pages/index.vue'
import FileDropzone from '../../../app/components/importer/FileDropzone.vue'
import ModelSizePicker from '../../../app/components/settings/ModelSizePicker.vue'
import RecordButton from '../../../app/components/recorder/RecordButton.vue'
import LlmModelSizePicker from '../../../app/components/settings/LlmModelSizePicker.vue'
import SummaryEditor from '../../../app/components/summary/SummaryEditor.vue'

function mountPage() {
  return mount(IndexPage, {
    global: {
      stubs: {
        RecordingTimer: true,
        TranscriptEditor: true,
        ExportMenu: true,
        ModelSizePicker: true,
        LlmModelSizePicker: true,
        SummaryEditor: true,
        ThemeToggle: true,
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  recorderState.value = 'idle'
  recorderError.value = null
  importError.value = null
  transcriptionState.value = 'idle'
  transcriptionError.value = null
  transcriptionDevice.value = null
  downloadProgress.value = null
  summarizerState.value = 'idle'
  summarizerError.value = null
  summaryDownloadProgress.value = null
  summary.value = ''
  transcriptionElapsed.value = 0
  transcriptionEta.value = null
  transcriptionDurationRef.value = null
  chunkProgressRef.value = null
})

describe('index page', () => {
  it('shows a banner when the microphone permission is denied', async () => {
    recorderError.value = 'mic-permission-denied'
    const wrapper = mountPage()
    expect(wrapper.find('[data-testid="recorder-error"]').exists()).toBe(true)
  })

  it('imports a file and starts transcription with the decoded PCM', async () => {
    const pcm = new Float32Array([1, 2, 3])
    importFile.mockResolvedValue(pcm)
    const wrapper = mountPage()

    await wrapper.findComponent(FileDropzone).vm.$emit('file-selected', new File(['x'], 'a.mp3', { type: 'audio/mpeg' }))
    await wrapper.vm.$nextTick()
    await Promise.resolve()

    expect(importFile).toHaveBeenCalled()
    expect(transcribe).toHaveBeenCalledWith(pcm, 'small', 'auto')
  })

  it('retries transcription with the last imported audio when the retry button is clicked', async () => {
    const pcm = new Float32Array([4, 5, 6])
    importFile.mockResolvedValue(pcm)
    const wrapper = mountPage()

    await wrapper.findComponent(FileDropzone).vm.$emit('file-selected', new File(['x'], 'a.mp3', { type: 'audio/mpeg' }))
    await wrapper.vm.$nextTick()
    await Promise.resolve()

    transcriptionState.value = 'error'
    await wrapper.vm.$nextTick()
    await wrapper.get('[data-testid="retry-button"]').trigger('click')

    expect(retry).toHaveBeenCalledWith(pcm, 'small', 'auto')
  })

  it('populates the editor with the transcribed text once done', async () => {
    transcriptionText.value = 'texto reconocido'
    const wrapper = mountPage()

    transcriptionState.value = 'done'
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent({ name: 'TranscriptEditor' }).props('modelValue')).toBe('texto reconocido')
    expect(wrapper.findComponent({ name: 'ExportMenu' }).exists()).toBe(true)
  })

  it('shows a compatibility notice when the worker falls back to wasm', async () => {
    const wrapper = mountPage()

    transcriptionDevice.value = 'wasm'
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="wasm-fallback-notice"]').exists()).toBe(true)
  })

  it('disables the model size picker while a transcription is loading or running', async () => {
    const wrapper = mountPage()
    expect(wrapper.findComponent(ModelSizePicker).props('disabled')).toBe(false)

    transcriptionState.value = 'loading-model'
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(ModelSizePicker).props('disabled')).toBe(true)

    transcriptionState.value = 'transcribing'
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(ModelSizePicker).props('disabled')).toBe(true)

    transcriptionState.value = 'done'
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(ModelSizePicker).props('disabled')).toBe(false)
  })

  it('calls setModelSize when the model size picker emits a new value', async () => {
    const wrapper = mountPage()
    await wrapper.findComponent(ModelSizePicker).vm.$emit('update:modelValue', 'medium')
    expect(setModelSize).toHaveBeenCalledWith('medium')
  })

  it('shows a progress bar while the model downloads', async () => {
    const wrapper = mountPage()
    expect(wrapper.find('[data-testid="model-download-progress"]').exists()).toBe(false)

    transcriptionState.value = 'loading-model'
    downloadProgress.value = 42
    await wrapper.vm.$nextTick()

    const bar = wrapper.get('[data-testid="model-download-progress"]')
    expect(bar.element.getAttribute('style')).toContain('42%')
  })

  it('shows a message instead of the editor when the transcription is empty', async () => {
    transcriptionText.value = '   '
    const wrapper = mountPage()

    transcriptionState.value = 'done'
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="no-speech-detected"]').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'TranscriptEditor' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ExportMenu' }).exists()).toBe(false)
  })

  it('renders one RecordButton per source with the right labels', () => {
    const wrapper = mountPage()
    const buttons = wrapper.findAllComponents(RecordButton)
    expect(buttons).toHaveLength(2)
    expect(buttons[0]?.props()).toMatchObject({ source: 'microphone', label: 'Grabar micrófono' })
    expect(buttons[1]?.props()).toMatchObject({ source: 'tab', label: 'Grabar pestaña' })
  })

  it('starts recording with the right source when each RecordButton emits start', async () => {
    const wrapper = mountPage()
    const buttons = wrapper.findAllComponents(RecordButton)

    await buttons[1]?.vm.$emit('start')
    expect(startRecording).toHaveBeenCalledWith('tab')

    await buttons[0]?.vm.$emit('start')
    expect(startRecording).toHaveBeenCalledWith('microphone')
  })

  it('shows the stop button only while recording', async () => {
    const wrapper = mountPage()
    expect(wrapper.find('[data-testid="stop-button"]').exists()).toBe(false)

    recorderState.value = 'recording'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="stop-button"]').exists()).toBe(true)

    await wrapper.get('[data-testid="stop-button"]').trigger('click')
    expect(stopRecording).toHaveBeenCalled()
  })

  it('shows tab-specific error messages and hides the microphone one', async () => {
    recorderError.value = 'tab-permission-denied'
    const wrapper = mountPage()
    expect(wrapper.find('[data-testid="tab-permission-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="recorder-error"]').exists()).toBe(false)

    recorderError.value = 'tab-audio-not-shared'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="tab-audio-error"]').exists()).toBe(true)
  })

  it('shows the summarize controls only once there is transcribed text', async () => {
    transcriptionText.value = 'texto reconocido'
    const wrapper = mountPage()
    expect(wrapper.find('[data-testid="summarize-button"]').exists()).toBe(false)

    transcriptionState.value = 'done'
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="summarize-button"]').exists()).toBe(true)
    expect(wrapper.findComponent(LlmModelSizePicker).exists()).toBe(true)
  })

  it('disables the summarize controls while the summary is loading or generating', async () => {
    transcriptionText.value = 'texto reconocido'
    const wrapper = mountPage()
    transcriptionState.value = 'done'
    await wrapper.vm.$nextTick()
    expect(wrapper.get<HTMLButtonElement>('[data-testid="summarize-button"]').element.disabled).toBe(false)

    summarizerState.value = 'loading-model'
    await wrapper.vm.$nextTick()
    expect(wrapper.get<HTMLButtonElement>('[data-testid="summarize-button"]').element.disabled).toBe(true)

    summarizerState.value = 'summarizing'
    await wrapper.vm.$nextTick()
    expect(wrapper.get<HTMLButtonElement>('[data-testid="summarize-button"]').element.disabled).toBe(true)
  })

  it('summarizes the edited transcript with the selected LLM size when clicked', async () => {
    transcriptionText.value = 'texto reconocido'
    const wrapper = mountPage()
    transcriptionState.value = 'done'
    await wrapper.vm.$nextTick()

    await wrapper.get('[data-testid="summarize-button"]').trigger('click')

    expect(summarize).toHaveBeenCalledWith('texto reconocido', '0.5b')
  })

  it('shows the summary editor once the summary is done', async () => {
    transcriptionText.value = 'texto reconocido'
    summary.value = 'TL;DR: resumen'
    const wrapper = mountPage()
    transcriptionState.value = 'done'
    await wrapper.vm.$nextTick()

    summarizerState.value = 'done'
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent(SummaryEditor).props('modelValue')).toBe('TL;DR: resumen')
  })

  it('shows a summarize error with a retry button', async () => {
    transcriptionText.value = 'texto reconocido'
    const wrapper = mountPage()
    transcriptionState.value = 'done'
    await wrapper.vm.$nextTick()

    summarizerState.value = 'error'
    summarizerError.value = 'boom'
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-testid="summarize-error"]').text()).toContain('boom')
    await wrapper.get('[data-testid="summarize-retry-button"]').trigger('click')
    expect(retrySummarize).toHaveBeenCalledWith('texto reconocido', '0.5b')
  })

  it('shows elapsed time in transcribing status', async () => {
    const wrapper = mountPage()
    transcriptionElapsed.value = 42
    transcriptionState.value = 'transcribing'
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-testid="status-transcribing"]').text()).toContain('00:42')
  })

  it('shows ETA when available during transcription', async () => {
    const wrapper = mountPage()
    transcriptionState.value = 'transcribing'
    transcriptionElapsed.value = 10
    transcriptionEta.value = 30
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-testid="status-transcribing"]').text()).toContain('00:30')
  })

  it('shows chunk progress bar when chunkProgress is set', async () => {
    const wrapper = mountPage()
    transcriptionState.value = 'transcribing'
    chunkProgressRef.value = { done: 3, total: 8 }
    await wrapper.vm.$nextTick()

    const bar = wrapper.get('[data-testid="chunk-progress"]')
    expect(bar.element.getAttribute('style')).toContain('37.5%')
  })

  it('hides chunk progress bar when chunkProgress is null', async () => {
    const wrapper = mountPage()
    transcriptionState.value = 'transcribing'
    chunkProgressRef.value = null
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="chunk-progress"]').exists()).toBe(false)
  })

  it('shows duration badge after transcription completes', async () => {
    transcriptionText.value = 'texto reconocido'
    const wrapper = mountPage()
    transcriptionState.value = 'done'
    transcriptionDurationRef.value = 83
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-testid="transcription-duration"]').text()).toContain('01:23')
  })

  it('hides duration badge when transcriptionDuration is null', async () => {
    transcriptionText.value = 'texto reconocido'
    const wrapper = mountPage()
    transcriptionState.value = 'done'
    transcriptionDurationRef.value = null
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="transcription-duration"]').exists()).toBe(false)
  })
})
