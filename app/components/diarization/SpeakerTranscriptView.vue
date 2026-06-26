<script setup lang="ts">
import type { AlignedSpeakerBlock } from '../../utils/speakerTranscriptAlignment'

defineProps<{ blocks: AlignedSpeakerBlock[] }>()

const SPEAKER_COLORS = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500']

function speakerColor(id: number | null): string {
  return id !== null ? (SPEAKER_COLORS[id] ?? 'bg-gray-500') : 'bg-gray-400'
}
</script>

<template>
  <div class="space-y-4">
    <div v-for="(block, index) in blocks" :key="index" class="flex gap-3">
      <div class="flex-shrink-0 mt-0.5">
        <span
          class="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white"
          :class="speakerColor(block.globalSpeakerId)"
        >
          {{ block.globalSpeakerId !== null ? block.globalSpeakerId + 1 : '?' }}
        </span>
      </div>
      <p class="text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{{ block.text }}</p>
    </div>
  </div>
</template>
