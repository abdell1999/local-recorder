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
    class="border rounded px-2 py-1 text-sm"
    :value="modelValue"
    :disabled="disabled"
    @change="onChange"
  >
    <option v-for="size in sizes" :key="size" :value="size">{{ size }}</option>
  </select>
</template>
