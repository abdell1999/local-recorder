<script setup lang="ts">
withDefaults(defineProps<{ level?: number }>(), { level: 0 })
</script>

<template>
  <div class="w-full h-2 bg-gray-200 rounded" data-testid="audio-visualizer">
    <div class="h-2 bg-green-500 rounded" :style="{ width: `${Math.min(level, 1) * 100}%` }" />
  </div>
</template>
