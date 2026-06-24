import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LlmModelSizePicker from '../../../app/components/settings/LlmModelSizePicker.vue'

describe('LlmModelSizePicker', () => {
  it('renders the two supported model sizes as options', () => {
    const wrapper = mount(LlmModelSizePicker, { props: { modelValue: '0.5b' } })
    const options = wrapper.findAll('option')
    expect(options.map((o) => o.element.value)).toEqual(['0.5b', '1.5b'])
  })

  it('emits update:modelValue when the selection changes', async () => {
    const wrapper = mount(LlmModelSizePicker, { props: { modelValue: '0.5b' } })
    await wrapper.get('[data-testid="llm-model-size-picker"]').setValue('1.5b')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['1.5b'])
  })

  it('disables the select when the disabled prop is true', () => {
    const wrapper = mount(LlmModelSizePicker, { props: { modelValue: '0.5b', disabled: true } })
    expect(wrapper.get<HTMLSelectElement>('[data-testid="llm-model-size-picker"]').element.disabled).toBe(true)
  })

  it('is enabled by default', () => {
    const wrapper = mount(LlmModelSizePicker, { props: { modelValue: '0.5b' } })
    expect(wrapper.get<HTMLSelectElement>('[data-testid="llm-model-size-picker"]').element.disabled).toBe(false)
  })
})
