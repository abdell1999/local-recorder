# UI Refresh — Dark Mode + Layout en Cards

## Objetivo

Transformar la interfaz de lista plana en una app visualmente moderna con soporte de tema oscuro/claro/auto, layout organizado en tarjetas y polish de todos los componentes.

## Alcance

Solo cambios visuales (clases Tailwind, estructura de template, un composable nuevo y un componente nuevo). Sin cambios en lógica de negocio, sin dependencias nuevas, sin alteración de `data-testid` usados por los tests existentes.

---

## 1. Sistema de temas

### Composable `useTheme`

- Tipo: `'auto' | 'light' | 'dark'`, clave `localStorage`: `'local-recorder:theme'`, default `'auto'`
- Al llamarse, aplica el tema inmediatamente (sin esperar a `onMounted`) vía `document.documentElement.classList.toggle('dark', isDark)`
- En modo `auto` resuelve `prefers-color-scheme` mediante `window.matchMedia`
- Escucha cambios del sistema con `window.matchMedia(...).addEventListener('change', ...)` para actualizar en tiempo real
- Todos los accesos a DOM/localStorage están guardados con `typeof document !== 'undefined'`

### Configuración Tailwind

Fichero `tailwind.config.ts` en la raíz del proyecto con `darkMode: 'class'`. El módulo `@nuxtjs/tailwindcss` lo detecta automáticamente y gestiona `content` solo.

### Componente ThemeToggle

- Tres botones segmentados: Auto | Claro | Oscuro
- `data-testid`: `theme-option-auto`, `theme-option-light`, `theme-option-dark`
- El activo: `bg-gray-900 text-white dark:bg-white dark:text-gray-900`
- El inactivo: `bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400`

### Inicialización en `app.vue`

`useTheme()` se llama en el `<script setup>` de `app.vue` para que el tema se aplique antes del primer render de la página.

---

## 2. Layout general (index.vue)

### Wrapper externo

```
<div class="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  <main class="max-w-3xl mx-auto px-4 py-8 space-y-4">
```

### Header

```
<div class="flex items-center justify-between">
  <h1 class="text-2xl font-bold tracking-tight">Local Recorder</h1>
  <ThemeToggle />
</div>
```

### Card base

Todos los cards usan: `bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm`

### Secciones

1. **Configuración** (card) — Modelo + Idioma, con label de sección `text-xs font-semibold text-gray-500 uppercase tracking-wider`
2. **Captura** (card) — RecordButtons + errores de grabación + FileDropzone + error de importación
3. **Estado** (sin card) — mensajes de transcripción con spinner SVG + barra de progreso estilizada
4. **Transcripción** (card, visible cuando `done`) — header con label + ExportMenu alineado a la derecha + TranscriptEditor
5. **Acciones** (card) — sección Resumir (botón + LlmModelSizePicker + estado + SummaryEditor) + separador `border-t` + sección Diarizar (botón + estado + SpeakerTranscriptView)

### Progress bars estilizadas

Reemplaza `<progress>` nativo:
```html
<div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
  <div class="bg-indigo-500 h-1.5 rounded-full transition-all" :style="{ width: `${progress}%` }" />
</div>
```

### Spinner SVG (mensajes de estado)

```html
<svg class="animate-spin h-4 w-4 text-indigo-500 inline mr-2" .../>
```

---

## 3. Polish de componentes

### RecordButton
- Añadir: `hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors`
- Botón Detener: `hover:bg-red-700 focus-visible:ring-red-500`

### FileDropzone
- Añadir: `border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors`

### ExportMenu
- Botones pill: `bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full px-3 py-1 text-xs font-medium transition-colors`

### TranscriptEditor / SummaryEditor
- Añadir: `bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none`

### ModelSizePicker / LlmModelSizePicker
- Añadir: `bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100`

### LanguagePicker (input)
- Añadir: `bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100`
- Dropdown ul: `bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600`
- Hover ítem: `hover:bg-gray-100 dark:hover:bg-gray-600`

### SpeakerTranscriptView
- Cada bloque con avatar circular de color según `globalSpeakerId`:
  - 0 → `bg-indigo-500`, 1 → `bg-emerald-500`, 2 → `bg-amber-500`, 3 → `bg-rose-500`, 4+ → `bg-gray-500`
- Estructura del bloque:
  ```html
  <div class="flex gap-3">
    <span class="avatar...">N</span>
    <p class="text-gray-800 dark:text-gray-200">...</p>
  </div>
  ```

---

## Restricciones globales

- Sin dependencias npm nuevas
- Sin cambiar ni eliminar ningún `data-testid` existente
- Sin tocar lógica de negocio (composables de grabación, transcripción, diarización, etc.)
- Commits en español, sin Co-Authored-By
- Siempre en rama `main`
