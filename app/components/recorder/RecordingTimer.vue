<script setup lang="ts">
import { formatElapsed } from '../../utils/formatElapsed'
const props = defineProps<{ seconds: number }>()
</script>

<template>
  <span data-testid="recording-timer">{{ formatElapsed(props.seconds) }}</span>
</template>
