import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ModelSizePicker from '../../../app/components/settings/ModelSizePicker.vue'

describe('ModelSizePicker', () => {
  it('renders the four supported model sizes as options', () => {
    const wrapper = mount(ModelSizePicker, { props: { modelValue: 'small' } })
    const options = wrapper.findAll('option')
    expect(options.map((o) => o.element.value)).toEqual(['tiny', 'base', 'small', 'large-v3-turbo'])
  })

  it('emits update:modelValue when the selection changes', async () => {
    const wrapper = mount(ModelSizePicker, { props: { modelValue: 'small' } })
    await wrapper.get('[data-testid="model-size-picker"]').setValue('large-v3-turbo')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['large-v3-turbo'])
  })

  it('disables the select when the disabled prop is true', () => {
    const wrapper = mount(ModelSizePicker, { props: { modelValue: 'small', disabled: true } })
    expect(wrapper.get<HTMLSelectElement>('[data-testid="model-size-picker"]').element.disabled).toBe(true)
  })

  it('is enabled by default', () => {
    const wrapper = mount(ModelSizePicker, { props: { modelValue: 'small' } })
    expect(wrapper.get<HTMLSelectElement>('[data-testid="model-size-picker"]').element.disabled).toBe(false)
  })
})
