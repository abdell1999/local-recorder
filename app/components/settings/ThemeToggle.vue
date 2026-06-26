<script setup lang="ts">
import { useTheme, type Theme } from '../../composables/useTheme'

const { theme, setTheme } = useTheme()

const options: { value: Theme; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
]
</script>

<template>
  <div class="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs font-medium">
    <button
      v-for="opt in options"
      :key="opt.value"
      :data-testid="`theme-option-${opt.value}`"
      class="px-3 py-1.5 transition-colors"
      :class="
        theme === opt.value
          ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
          : 'bg-white text-gray-500 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
      "
      @click="setTheme(opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>
