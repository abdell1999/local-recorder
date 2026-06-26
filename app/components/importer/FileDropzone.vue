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
    class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center bg-gray-50 dark:bg-gray-800/50 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors cursor-pointer"
    @dragover.prevent
    @drop="onDrop"
  >
    <p class="text-sm text-gray-500 dark:text-gray-400">
      Arrastra un archivo de audio o vídeo, o
      <label class="text-indigo-600 dark:text-indigo-400 underline cursor-pointer hover:text-indigo-700 dark:hover:text-indigo-300">
        selecciona uno
        <input type="file" accept="audio/*,video/*" class="hidden" data-testid="file-input" @change="onChange" />
      </label>
    </p>
  </div>
</template>
