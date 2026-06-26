<script setup lang="ts">
import { WHISPER_MODELS, type WhisperModelSize } from '../../utils/whisperModels'

withDefaults(defineProps<{ modelValue: WhisperModelSize; disabled?: boolean }>(), { disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: WhisperModelSize] }>()

const sizes = Object.keys(WHISPER_MODELS) as WhisperModelSize[]

function onChange(event: Event) {
  emit('update:modelValue', (event.target as HTMLSelectElement).value as WhisperModelSize)
}
</script>

<template>
  <select
    data-testid="model-size-picker"
    class="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    :value="modelValue"
    :disabled="disabled"
    @change="onChange"
  >
    <option v-for="size in sizes" :key="size" :value="size">{{ WHISPER_MODELS[size] }}</option>
  </select>
</template>
