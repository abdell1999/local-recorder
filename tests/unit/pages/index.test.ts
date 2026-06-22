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

vi.mock('../../../app/composables/useRecorder', () => ({
  useRecorder: () => ({ state: recorderState, errorMessage: recorderError, start: startRecording, stop: stopRecording }),
}))
vi.mock('../../../app/composables/useFileImport', () => ({
  useFileImport: () => ({ state: ref('idle'), errorMessage: importError, importFile }),
}))
vi.mock('../../../app/composables/useModelSelector', () => ({
  useModelSelector: () => ({ modelSize, setModelSize: vi.fn() }),
}))
vi.mock('../../../app/composables/useTranscription', () => ({
  useTranscription: () => ({
    state: transcriptionState,
    text: transcriptionText,
    chunks: transcriptionChunks,
    errorMessage: transcriptionError,
    device: transcriptionDevice,
    transcribe,
    retry,
  }),
}))
vi.mock('../../../app/utils/audio/decodeAudioFile', () => ({
  decodeAudioFile: vi.fn().mockResolvedValue(new Float32Array([0])),
}))

import IndexPage from '../../../app/pages/index.vue'
import FileDropzone from '../../../app/components/importer/FileDropzone.vue'

function mountPage() {
  return mount(IndexPage, {
    global: {
      stubs: { RecordButton: true, RecordingTimer: true, TranscriptEditor: true, ExportMenu: true },
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
})
