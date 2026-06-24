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
vi.mock('../../../app/composables/useTranscription', () => ({
  useTranscription: () => ({
    state: transcriptionState,
    text: transcriptionText,
    chunks: transcriptionChunks,
    errorMessage: transcriptionError,
    device: transcriptionDevice,
    downloadProgress,
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

function mountPage() {
  return mount(IndexPage, {
    global: {
      stubs: {
        RecordingTimer: true,
        TranscriptEditor: true,
        ExportMenu: true,
        ModelSizePicker: true,
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
    expect(transcribe).toHaveBeenCalledWith(pcm, 'small')
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

    expect(retry).toHaveBeenCalledWith(pcm, 'small')
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

    downloadProgress.value = 42
    await wrapper.vm.$nextTick()

    const bar = wrapper.get<HTMLProgressElement>('[data-testid="model-download-progress"]')
    expect(bar.element.value).toBe(42)
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
})
