import { describe, it, expect, beforeEach } from 'vitest'
import { useModelSelector } from '../../../app/composables/useModelSelector'

beforeEach(() => {
  localStorage.clear()
})

describe('useModelSelector', () => {
  it('defaults to small when nothing is stored', () => {
    const { modelSize } = useModelSelector()
    expect(modelSize.value).toBe('small')
  })

  it('persists the chosen size to localStorage', () => {
    const { modelSize, setModelSize } = useModelSelector()
    setModelSize('medium')
    expect(modelSize.value).toBe('medium')
    expect(localStorage.getItem('local-recorder:model-size')).toBe('medium')
  })

  it('reads a previously stored size on init', () => {
    localStorage.setItem('local-recorder:model-size', 'tiny')
    const { modelSize } = useModelSelector()
    expect(modelSize.value).toBe('tiny')
  })
})
