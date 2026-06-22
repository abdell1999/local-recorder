import { ref, watch } from 'vue'
import type { WhisperModelSize } from '../utils/whisperModels'

const STORAGE_KEY = 'local-recorder:model-size'
const DEFAULT_SIZE: WhisperModelSize = 'small'

export function useModelSelector() {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  const modelSize = ref<WhisperModelSize>((stored as WhisperModelSize) || DEFAULT_SIZE)

  watch(modelSize, (value) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, value)
    }
  }, { flush: 'sync' })

  function setModelSize(size: WhisperModelSize) {
    modelSize.value = size
  }

  return { modelSize, setModelSize }
}
