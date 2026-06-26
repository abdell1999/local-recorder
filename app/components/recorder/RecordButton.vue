<script setup lang="ts">
import type { RecorderSource } from '../../composables/useRecorder'

defineProps<{ state: 'idle' | 'recording' | 'stopped' | 'error'; source: RecorderSource; label: string }>()
const emit = defineEmits<{ start: [] }>()
</script>

<template>
  <button
    v-if="state !== 'recording'"
    :data-testid="`record-button-${source}`"
    class="px-4 py-2 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    @click="emit('start')"
  >
    {{ label }}
  </button>
</template>
