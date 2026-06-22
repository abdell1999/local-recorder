<script setup lang="ts">
defineProps<{ state: 'idle' | 'recording' | 'stopped' | 'error' }>()
const emit = defineEmits<{ start: []; stop: [] }>()
</script>

<template>
  <button
    data-testid="record-button"
    class="px-4 py-2 rounded font-semibold"
    :class="state === 'recording' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'"
    @click="state === 'recording' ? emit('stop') : emit('start')"
  >
    {{ state === 'recording' ? 'Detener' : 'Grabar' }}
  </button>
</template>
