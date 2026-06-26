<script setup lang="ts">
import { ref, computed } from 'vue'
import { WHISPER_LANGUAGES, type WhisperLanguageEntry } from '../../utils/whisperLanguages'

const props = withDefaults(defineProps<{ modelValue: string; disabled?: boolean }>(), { disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const query = ref('')

function getNameByCode(code: string): string {
  return WHISPER_LANGUAGES.find((l) => l.code === code)?.name ?? code
}

const filtered = computed(() => {
  if (query.value === '') return WHISPER_LANGUAGES
  const q = query.value.toLowerCase()
  return WHISPER_LANGUAGES.filter(
    (l) => l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q),
  )
})

function onFocus() {
  if (props.disabled) return
  open.value = true
  query.value = ''
}

function onInput(e: Event) {
  query.value = (e.target as HTMLInputElement).value
}

function select(entry: WhisperLanguageEntry) {
  emit('update:modelValue', entry.code)
  open.value = false
  query.value = ''
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    open.value = false
    query.value = ''
  }
}

function onBlur() {
  setTimeout(() => {
    open.value = false
    query.value = ''
  }, 150)
}
</script>

<template>
  <div class="relative">
    <input
      data-testid="language-picker-input"
      type="text"
      class="border rounded px-2 py-1 text-sm w-48"
      :value="open ? query : getNameByCode(modelValue)"
      :disabled="disabled"
      @focus="onFocus"
      @input="onInput"
      @keydown="onKeydown"
      @blur="onBlur"
    />
    <ul
      v-if="open && filtered.length > 0"
      data-testid="language-picker-dropdown"
      class="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded border bg-white shadow text-sm"
    >
      <li
        v-for="entry in filtered"
        :key="entry.code"
        :data-testid="`language-option-${entry.code}`"
        class="cursor-pointer px-2 py-1 hover:bg-gray-100"
        @mousedown.prevent="select(entry)"
      >
        {{ entry.name }}
      </li>
    </ul>
  </div>
</template>
