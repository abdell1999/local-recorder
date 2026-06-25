<script setup lang="ts">
import type { AlignedSpeakerBlock } from '../../utils/speakerTranscriptAlignment'

defineProps<{
  blocks: AlignedSpeakerBlock[]
}>()
</script>

<template>
  <div class="space-y-4">
    <div v-for="(block, index) in blocks" :key="index" class="space-y-1">
      <p
        v-if="block.globalSpeakerId !== null"
        class="text-sm font-semibold text-gray-700"
      >
        Hablante {{ block.globalSpeakerId + 1 }}
      </p>
      <p class="text-gray-900 whitespace-pre-wrap">{{ block.text }}</p>
    </div>
  </div>
</template>
