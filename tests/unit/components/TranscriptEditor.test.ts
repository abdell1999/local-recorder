import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TranscriptEditor from '../../../app/components/transcript/TranscriptEditor.vue'

describe('TranscriptEditor', () => {
  it('renders the current text', () => {
    const wrapper = mount(TranscriptEditor, { props: { modelValue: 'hola' } })
    expect(wrapper.get('[data-testid="transcript-editor"]').element.value).toBe('hola')
  })

  it('emits update:modelValue on input', async () => {
    const wrapper = mount(TranscriptEditor, { props: { modelValue: 'hola' } })
    const textarea = wrapper.get('[data-testid="transcript-editor"]')
    await textarea.setValue('hola mundo')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['hola mundo'])
  })
})
