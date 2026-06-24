import { ref, watch } from 'vue'
import type { LlmModelSize } from '../utils/llmModels'

const STORAGE_KEY = 'local-recorder:llm-model-size'
const DEFAULT_SIZE: LlmModelSize = '0.5b'

export function useLlmModelSelector() {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  const modelSize = ref<LlmModelSize>((stored as LlmModelSize) || DEFAULT_SIZE)

  watch(modelSize, (value) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, value)
    }
  }, { flush: 'sync' })

  function setModelSize(size: LlmModelSize) {
    modelSize.value = size
  }

  return { modelSize, setModelSize }
}
