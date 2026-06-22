import { ref } from 'vue'
import { decodeAudioFile } from '../utils/audio/decodeAudioFile'

export type FileImportState = 'idle' | 'decoding' | 'done' | 'error'

const ACCEPTED_PREFIXES = ['audio/', 'video/']

export function useFileImport() {
  const state = ref<FileImportState>('idle')
  const errorMessage = ref<string | null>(null)

  async function importFile(file: File): Promise<Float32Array | null> {
    errorMessage.value = null
    const isAccepted = ACCEPTED_PREFIXES.some((prefix) => file.type.startsWith(prefix))
    if (!isAccepted) {
      state.value = 'error'
      errorMessage.value = 'unsupported-file-type'
      return null
    }
    state.value = 'decoding'
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pcm = await decodeAudioFile(arrayBuffer)
      state.value = 'done'
      return pcm
    } catch {
      state.value = 'error'
      errorMessage.value = 'decode-failed'
      return null
    }
  }

  return { state, errorMessage, importFile }
}
