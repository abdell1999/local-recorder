<script setup lang="ts">
import { LLM_MODELS, type LlmModelSize } from '../../utils/llmModels'

withDefaults(defineProps<{ modelValue: LlmModelSize; disabled?: boolean }>(), { disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: LlmModelSize] }>()

const sizes = Object.keys(LLM_MODELS) as LlmModelSize[]

function onChange(event: Event) {
  emit('update:modelValue', (event.target as HTMLSelectElement).value as LlmModelSize)
}
</script>

<template>
  <select
    data-testid="llm-model-size-picker"
    class="border rounded px-2 py-1 text-sm"
    :value="modelValue"
    :disabled="disabled"
    @change="onChange"
  >
    <option v-for="size in sizes" :key="size" :value="size">{{ size }}</option>
  </select>
</template>
