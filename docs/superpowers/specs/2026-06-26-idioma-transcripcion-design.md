# Selector de idioma para transcripción — diseño

## Contexto

Whisper auto-detecta el idioma del audio a partir de los primeros 30 segundos. Si el
inicio contiene música, silencio o voz poco clara, la detección puede fallar y producir
una transcripción en inglés aunque el audio sea en otro idioma. Esta fase añade un
selector de idioma junto al selector de modelo, con "Auto-detectar" como opción por
defecto y los ~99 idiomas de Whisper disponibles via búsqueda.

## Alcance

1. `app/utils/whisperLanguages.ts` — lista de idiomas con código ISO 639-1 y nombre
   nativo, más la entrada `auto`.
2. `app/composables/useLanguageSelector.ts` — estado reactivo + persistencia en
   localStorage, siguiendo el patrón de `useModelSelector`.
3. `app/components/settings/LanguagePicker.vue` — combobox con búsqueda, sin
   dependencias externas.
4. Propagación del parámetro `language` a través de `whisper.types.ts`,
   `whisper.worker.ts` y `useTranscription.ts`.
5. Wiring en `index.vue`.

### Fuera de alcance

- Detección automática mejorada (el auto-detect de Whisper permanece sin cambios).
- Traducción (task `translate`): siempre se usa `transcribe`.
- Nombres de idiomas en español: se usan los nombres nativos (más reconocibles
  internacionalmente).

## Componentes y responsabilidades

### `app/utils/whisperLanguages.ts` (nuevo)

```ts
export interface WhisperLanguageEntry {
  code: string
  name: string
}

export const WHISPER_LANGUAGES: WhisperLanguageEntry[] = [
  { code: 'auto', name: 'Auto-detectar' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'am', name: 'አማርኛ' },
  { code: 'ar', name: 'العربية' },
  { code: 'as', name: 'অসমীয়া' },
  { code: 'az', name: 'Azərbaycanca' },
  { code: 'ba', name: 'Башҡортса' },
  { code: 'be', name: 'Беларуская' },
  { code: 'bg', name: 'Български' },
  { code: 'bn', name: 'বাংলা' },
  { code: 'bo', name: 'བོད་ཡིག' },
  { code: 'br', name: 'Brezhoneg' },
  { code: 'bs', name: 'Bosanski' },
  { code: 'ca', name: 'Català' },
  { code: 'cs', name: 'Čeština' },
  { code: 'cy', name: 'Cymraeg' },
  { code: 'da', name: 'Dansk' },
  { code: 'de', name: 'Deutsch' },
  { code: 'el', name: 'Ελληνικά' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'et', name: 'Eesti' },
  { code: 'eu', name: 'Euskara' },
  { code: 'fa', name: 'فارسی' },
  { code: 'fi', name: 'Suomi' },
  { code: 'fo', name: 'Føroyskt' },
  { code: 'fr', name: 'Français' },
  { code: 'gl', name: 'Galego' },
  { code: 'gu', name: 'ગુજરાતી' },
  { code: 'ha', name: 'Hausa' },
  { code: 'haw', name: 'ʻŌlelo Hawaiʻi' },
  { code: 'he', name: 'עברית' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'hr', name: 'Hrvatski' },
  { code: 'ht', name: 'Kreyòl ayisyen' },
  { code: 'hu', name: 'Magyar' },
  { code: 'hy', name: 'Հայերեն' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'is', name: 'Íslenska' },
  { code: 'it', name: 'Italiano' },
  { code: 'ja', name: '日本語' },
  { code: 'jw', name: 'Basa Jawa' },
  { code: 'ka', name: 'ქართული' },
  { code: 'kk', name: 'Қазақша' },
  { code: 'km', name: 'ខ្មែរ' },
  { code: 'kn', name: 'ಕನ್ನಡ' },
  { code: 'ko', name: '한국어' },
  { code: 'la', name: 'Latina' },
  { code: 'lb', name: 'Lëtzebuergesch' },
  { code: 'ln', name: 'Lingála' },
  { code: 'lo', name: 'ລາວ' },
  { code: 'lt', name: 'Lietuvių' },
  { code: 'lv', name: 'Latviešu' },
  { code: 'mg', name: 'Malagasy' },
  { code: 'mi', name: 'Te reo Māori' },
  { code: 'mk', name: 'Македонски' },
  { code: 'ml', name: 'മലയാളം' },
  { code: 'mn', name: 'Монгол' },
  { code: 'mr', name: 'मराठी' },
  { code: 'ms', name: 'Bahasa Melayu' },
  { code: 'mt', name: 'Malti' },
  { code: 'my', name: 'မြန်မာဘာသာ' },
  { code: 'ne', name: 'नेपाली' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'nn', name: 'Nynorsk' },
  { code: 'no', name: 'Norsk' },
  { code: 'oc', name: 'Occitan' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ' },
  { code: 'pl', name: 'Polski' },
  { code: 'ps', name: 'پښتو' },
  { code: 'pt', name: 'Português' },
  { code: 'ro', name: 'Română' },
  { code: 'ru', name: 'Русский' },
  { code: 'sa', name: 'संस्कृतम्' },
  { code: 'sd', name: 'سنڌي' },
  { code: 'si', name: 'සිංහල' },
  { code: 'sk', name: 'Slovenčina' },
  { code: 'sl', name: 'Slovenščina' },
  { code: 'sn', name: 'ChiShona' },
  { code: 'so', name: 'Soomaali' },
  { code: 'sq', name: 'Shqip' },
  { code: 'sr', name: 'Српски' },
  { code: 'su', name: 'Basa Sunda' },
  { code: 'sv', name: 'Svenska' },
  { code: 'sw', name: 'Kiswahili' },
  { code: 'ta', name: 'தமிழ்' },
  { code: 'te', name: 'తెలుగు' },
  { code: 'tg', name: 'Тоҷикӣ' },
  { code: 'th', name: 'ภาษาไทย' },
  { code: 'tk', name: 'Türkmen' },
  { code: 'tl', name: 'Tagalog' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'tt', name: 'Татарча' },
  { code: 'uk', name: 'Українська' },
  { code: 'ur', name: 'اردو' },
  { code: 'uz', name: "O'zbek" },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'yi', name: 'ייִדיש' },
  { code: 'yo', name: 'Yorùbá' },
  { code: 'zh', name: '中文' },
  { code: 'zu', name: 'IsiZulu' },
]
```

### `app/composables/useLanguageSelector.ts` (nuevo)

Sigue el mismo patrón que `useModelSelector.ts`:

```ts
const STORAGE_KEY = 'local-recorder:language'
const DEFAULT_LANGUAGE = 'auto'

export function useLanguageSelector() {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  const language = ref<string>(stored ?? DEFAULT_LANGUAGE)

  watch(language, (value) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, value)
  }, { flush: 'sync' })

  function setLanguage(lang: string) { language.value = lang }

  return { language, setLanguage }
}
```

### `app/components/settings/LanguagePicker.vue` (nuevo)

Combobox sin dependencias externas. Estructura interna:

- `inputValue: string` — texto del input (nombre del idioma seleccionado o lo que el
  usuario escribe para filtrar).
- `open: boolean` — controla si el dropdown es visible.
- `filtered: WhisperLanguageEntry[]` — computed, filtra `WHISPER_LANGUAGES` por
  `inputValue` (case-insensitive, sobre `name` y `code`).
- `pendingCode: string` — el `code` que está resaltado en la lista (para keyboard nav).

**Interacción:**

| Acción | Comportamiento |
|--------|----------------|
| Focus en input | Abre dropdown, limpia `inputValue` para escribir |
| Escribir | Filtra lista en tiempo real |
| Click en opción | Selecciona: emite `update:modelValue` con el `code`, cierra dropdown, restaura `inputValue` al `name` |
| Escape | Cierra dropdown sin cambiar selección, restaura `inputValue` |
| Blur (click fuera) | Igual que Escape |
| Disabled | Input deshabilitado, dropdown no se abre |

Props: `modelValue: string`, `disabled?: boolean`.  
Emite: `update:modelValue: [value: string]`.

### `app/workers/whisper.types.ts` (modificado)

Añadir `language?: string` al tipo `WhisperWorkerRequest`.

### `app/workers/whisper.worker.ts` (modificado)

Leer `language` del mensaje. Cuando no es `'auto'`, pasarlo al `asr()`:

```ts
const output = await asr(audio, {
  return_timestamps: true,
  chunk_length_s: CHUNK_LENGTH_S,
  stride_length_s: STRIDE_LENGTH_S,
  ...(language && language !== 'auto' ? { language } : {}),
})
```

### `app/composables/useTranscription.ts` (modificado)

```ts
function transcribe(audio: Float32Array, modelSize: WhisperModelSize, language: string) { ... }
function retry(audio: Float32Array, modelSize: WhisperModelSize, language: string) { ... }
```

El parámetro se pasa en el `postMessage` junto a `audio` y `modelSize`.

### `app/pages/index.vue` (modificado)

- Importar `useLanguageSelector` y `LanguagePicker`.
- Desestructurar `{ language, setLanguage }` de `useLanguageSelector()`.
- Añadir `<LanguagePicker>` junto a `<ModelSizePicker>` en la fila de controles.
- Pasar `language.value` a `transcribe()` y `retry()`.

## Flujo de datos

```
useLanguageSelector → language (ref<string>)
                          ↓
index.vue → transcribe(audio, modelSize, language)
                          ↓
useTranscription → postMessage({ audio, modelSize, language })
                          ↓
whisper.worker.ts → asr(audio, { ..., language })  ← omitido si 'auto'
```

## Testing

### `tests/unit/utils/whisperLanguages.test.ts` (nuevo)

- El primer elemento es `{ code: 'auto', name: 'Auto-detectar' }`.
- Todos los entries tienen `code` y `name` no vacíos.
- No hay códigos duplicados.
- Contiene `'es'` y `'en'`.

### `tests/unit/composables/useLanguageSelector.test.ts` (nuevo)

- Default es `'auto'`.
- `setLanguage('es')` actualiza `language.value`.
- Persiste en `localStorage` al cambiar.
- Lee el valor de `localStorage` al inicializar.

### `tests/unit/components/LanguagePicker.test.ts` (nuevo)

- Renderiza el `name` del idioma seleccionado en el input.
- Al hacer focus, muestra el dropdown.
- Escribir en el input filtra la lista (case-insensitive).
- Click en una opción emite `update:modelValue` con el `code`.
- Escape cierra el dropdown sin cambiar la selección.
- Con `disabled` el input está deshabilitado.

### `useTranscription` (tests existentes)

- Añadir `language` al mensaje del mock worker — los tests existentes pasan
  `language: 'auto'` al llamar a `transcribe`.
