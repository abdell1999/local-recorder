<script setup lang="ts">
import type { RecorderSource } from '../../composables/useRecorder'

defineProps<{ state: 'idle' | 'recording' | 'stopped' | 'error'; source: RecorderSource; label: string }>()
const emit = defineEmits<{ start: [] }>()
</script>

<template>
  <button
    v-if="state !== 'recording'"
    :data-testid="`record-button-${source}`"
    class="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    :class="source === 'microphone'
      ? 'bg-indigo-600 hover:bg-indigo-700 text-white focus-visible:ring-indigo-500 shadow-[0_0_16px_rgba(99,102,241,0.3)]'
      : 'bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 focus-visible:ring-slate-400'"
    @click="emit('start')"
  >
    <!-- Microphone icon -->
    <svg v-if="source === 'microphone'" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
    <!-- Monitor icon -->
    <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <path d="M8 21h8M12 17v4"/>
    </svg>
    {{ label }}
  </button>
</template>
