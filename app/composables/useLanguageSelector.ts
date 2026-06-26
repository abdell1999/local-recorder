import { ref, watch } from 'vue'

const STORAGE_KEY = 'local-recorder:language'
const DEFAULT_LANGUAGE = 'auto'

export function useLanguageSelector() {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  const language = ref<string>(stored ?? DEFAULT_LANGUAGE)

  watch(
    language,
    (value) => {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, value)
    },
    { flush: 'sync' },
  )

  function setLanguage(lang: string) {
    language.value = lang
  }

  return { language, setLanguage }
}
