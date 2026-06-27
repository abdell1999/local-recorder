import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTheme, _resetThemeForTesting } from '../../../app/composables/useTheme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() }),
  })
  _resetThemeForTesting()
})

describe('useTheme', () => {
  it('defaults to auto when nothing is stored', () => {
    const { theme } = useTheme()
    expect(theme.value).toBe('auto')
  })

  it('setTheme updates theme ref', () => {
    const { theme, setTheme } = useTheme()
    setTheme('dark')
    expect(theme.value).toBe('dark')
  })

  it('persists theme to localStorage', () => {
    const { setTheme } = useTheme()
    setTheme('dark')
    expect(localStorage.getItem('local-recorder:theme')).toBe('dark')
  })

  it('reads a previously stored theme on init', () => {
    localStorage.setItem('local-recorder:theme', 'dark')
    _resetThemeForTesting()
    const { theme } = useTheme()
    expect(theme.value).toBe('dark')
  })

  it('applies dark class when setTheme("dark")', () => {
    const { setTheme } = useTheme()
    setTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes dark class when setTheme("light")', () => {
    document.documentElement.classList.add('dark')
    const { setTheme } = useTheme()
    setTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('applies dark class in auto mode when system is dark', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn() }),
    })
    const { setTheme } = useTheme()
    setTheme('light')
    setTheme('auto')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
