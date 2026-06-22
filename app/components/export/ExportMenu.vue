<script setup lang="ts">
import { toTxt, toSrt, toVtt, toJson, type TranscriptResult } from '../../utils/transcriptExport'

const props = defineProps<{ result: TranscriptResult }>()

const formats = [
  { key: 'txt', label: 'TXT', mime: 'text/plain', extension: 'txt', generate: toTxt },
  { key: 'srt', label: 'SRT', mime: 'text/plain', extension: 'srt', generate: toSrt },
  { key: 'vtt', label: 'VTT', mime: 'text/vtt', extension: 'vtt', generate: toVtt },
  { key: 'json', label: 'JSON', mime: 'application/json', extension: 'json', generate: toJson },
] as const

function download(format: (typeof formats)[number]) {
  const content = format.generate(props.result)
  const blob = new Blob([content], { type: format.mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `transcript.${format.extension}`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="flex gap-2">
    <button
      v-for="format in formats"
      :key="format.key"
      :data-testid="`export-${format.key}`"
      class="px-3 py-1 border rounded"
      @click="download(format)"
    >
      {{ format.label }}
    </button>
  </div>
</template>
