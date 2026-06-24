<script setup lang="ts">
import type { RecorderSource } from '../../composables/useRecorder'

defineProps<{ state: 'idle' | 'recording' | 'stopped' | 'error'; source: RecorderSource; label: string }>()
const emit = defineEmits<{ start: [] }>()
</script>

<template>
  <button
    v-if="state !== 'recording'"
    :data-testid="`record-button-${source}`"
    class="px-4 py-2 rounded font-semibold bg-blue-600 text-white"
    @click="emit('start')"
  >
    {{ label }}
  </button>
</template>
