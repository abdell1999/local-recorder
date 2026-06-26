import { describe, it, expect, beforeEach } from 'vitest'
import { useLanguageSelector } from '../../../app/composables/useLanguageSelector'

beforeEach(() => {
  localStorage.clear()
})

describe('useLanguageSelector', () => {
  it('defaults to auto when nothing is stored', () => {
    const { language } = useLanguageSelector()
    expect(language.value).toBe('auto')
  })

  it('persists the chosen language to localStorage', () => {
    const { language, setLanguage } = useLanguageSelector()
    setLanguage('es')
    expect(language.value).toBe('es')
    expect(localStorage.getItem('local-recorder:language')).toBe('es')
  })

  it('reads a previously stored language on init', () => {
    localStorage.setItem('local-recorder:language', 'fr')
    const { language } = useLanguageSelector()
    expect(language.value).toBe('fr')
  })
})
