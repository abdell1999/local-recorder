<script setup lang="ts">
const emit = defineEmits<{ 'file-selected': [file: File]; rejected: [reason: string] }>()

function handleFiles(files: FileList | File[] | null) {
  const file = files?.[0]
  if (!file) return
  if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
    emit('rejected', 'unsupported-file-type')
    return
  }
  emit('file-selected', file)
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  handleFiles(event.dataTransfer?.files ?? null)
}

function onChange(event: Event) {
  handleFiles((event.target as HTMLInputElement).files)
}

defineExpose({ onDrop })
</script>

<template>
  <div
    data-testid="file-dropzone"
    class="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 text-center bg-slate-50 dark:bg-slate-800/50 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors cursor-pointer"
    @dragover.prevent
    @drop="onDrop"
  >
    <label class="flex flex-col items-center gap-2 cursor-pointer">
      <svg class="w-7 h-7 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      <p class="text-sm text-slate-500 dark:text-slate-400">
        Arrastra un archivo de audio o vídeo, o
        <span class="text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-700 dark:hover:text-indigo-300">selecciona uno</span>
      </p>
      <input type="file" accept="audio/*,video/*" class="hidden" data-testid="file-input" @change="onChange" />
    </label>
  </div>
</template>
