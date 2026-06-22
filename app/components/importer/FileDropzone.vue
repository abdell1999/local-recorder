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
  <div data-testid="file-dropzone" class="border-2 border-dashed rounded p-6 text-center" @dragover.prevent @drop="onDrop">
    <p>Arrastra un archivo de audio o vídeo, o</p>
    <label class="text-blue-600 underline cursor-pointer">
      selecciona uno
      <input type="file" accept="audio/*,video/*" class="hidden" data-testid="file-input" @change="onChange" />
    </label>
  </div>
</template>
