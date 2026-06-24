import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SummaryEditor from '../../../app/components/summary/SummaryEditor.vue'

describe('SummaryEditor', () => {
  it('renders the current text', () => {
    const wrapper = mount(SummaryEditor, { props: { modelValue: 'TL;DR: hola' } })
    expect(wrapper.get('[data-testid="summary-editor"]').element.value).toBe('TL;DR: hola')
  })

  it('emits update:modelValue on input', async () => {
    const wrapper = mount(SummaryEditor, { props: { modelValue: 'TL;DR: hola' } })
    const textarea = wrapper.get('[data-testid="summary-editor"]')
    await textarea.setValue('TL;DR: hola mundo')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['TL;DR: hola mundo'])
  })
})
