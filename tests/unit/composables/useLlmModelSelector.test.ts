import { describe, it, expect, beforeEach } from 'vitest'
import { useLlmModelSelector } from '../../../app/composables/useLlmModelSelector'

beforeEach(() => {
  localStorage.clear()
})

describe('useLlmModelSelector', () => {
  it('defaults to 0.5b when nothing is stored', () => {
    const { modelSize } = useLlmModelSelector()
    expect(modelSize.value).toBe('0.5b')
  })

  it('persists the chosen size to localStorage', () => {
    const { modelSize, setModelSize } = useLlmModelSelector()
    setModelSize('1.5b')
    expect(modelSize.value).toBe('1.5b')
    expect(localStorage.getItem('local-recorder:llm-model-size')).toBe('1.5b')
  })

  it('reads a previously stored size on init', () => {
    localStorage.setItem('local-recorder:llm-model-size', '1.5b')
    const { modelSize } = useLlmModelSelector()
    expect(modelSize.value).toBe('1.5b')
  })
})
