import { ref, watch } from 'vue'

export type Theme = 'auto' | 'light' | 'dark'

const STORAGE_KEY = 'local-recorder:theme'
const DEFAULT_THEME: Theme = 'auto'

function readStored(): Theme {
  if (typeof localStorage === 'undefined') return DEFAULT_THEME
  return (localStorage.getItem(STORAGE_KEY) as Theme) ?? DEFAULT_THEME
}

const theme = ref<Theme>(readStored())

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

watch(theme, (t) => {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, t)
  applyTheme(t)
}, { flush: 'sync' })

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (theme.value === 'auto') applyTheme('auto')
  })
}

function setTheme(t: Theme) {
  theme.value = t
}

export function useTheme() {
  return { theme, setTheme, applyTheme }
}

export function _resetThemeForTesting() {
  theme.value = readStored()
}
