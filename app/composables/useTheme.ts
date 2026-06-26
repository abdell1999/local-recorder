import { ref, watch } from 'vue'

export type Theme = 'auto' | 'light' | 'dark'

const STORAGE_KEY = 'local-recorder:theme'
const DEFAULT_THEME: Theme = 'auto'

export function useTheme() {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  const theme = ref<Theme>((stored as Theme) ?? DEFAULT_THEME)

  function applyTheme(t: Theme) {
    if (typeof document === 'undefined') return
    const prefersDark =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = t === 'dark' || (t === 'auto' && prefersDark)
    document.documentElement.classList.toggle('dark', isDark)
  }

  applyTheme(theme.value)

  watch(
    theme,
    (t) => {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, t)
      applyTheme(t)
    },
    { flush: 'sync' },
  )

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (theme.value === 'auto') applyTheme('auto')
    })
  }

  function setTheme(t: Theme) {
    theme.value = t
  }

  return { theme, setTheme, applyTheme }
}
