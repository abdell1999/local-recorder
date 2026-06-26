import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LanguagePicker from '../../../app/components/settings/LanguagePicker.vue'

describe('LanguagePicker', () => {
  it('displays the name of the selected language in the input', () => {
    const wrapper = mount(LanguagePicker, { props: { modelValue: 'auto' } })
    const input = wrapper.get<HTMLInputElement>('[data-testid="language-picker-input"]')
    expect(input.element.value).toBe('Auto-detectar')
  })

  it('displays the correct name for a non-auto language', () => {
    const wrapper = mount(LanguagePicker, { props: { modelValue: 'es' } })
    const input = wrapper.get<HTMLInputElement>('[data-testid="language-picker-input"]')
    expect(input.element.value).toBe('Español')
  })

  it('opens dropdown on focus', async () => {
    const wrapper = mount(LanguagePicker, { props: { modelValue: 'auto' } })
    expect(wrapper.find('[data-testid="language-picker-dropdown"]').exists()).toBe(false)
    await wrapper.get('[data-testid="language-picker-input"]').trigger('focus')
    expect(wrapper.find('[data-testid="language-picker-dropdown"]').exists()).toBe(true)
  })

  it('filters the list when typing', async () => {
    const wrapper = mount(LanguagePicker, { props: { modelValue: 'auto' } })
    await wrapper.get('[data-testid="language-picker-input"]').trigger('focus')
    const input = wrapper.get('[data-testid="language-picker-input"]')
    await input.setValue('español')
    await input.trigger('input')
    const options = wrapper.findAll('[data-testid^="language-option-"]')
    expect(options.length).toBe(1)
    expect(options[0]?.element.getAttribute('data-testid')).toBe('language-option-es')
  })

  it('emits update:modelValue with the code when an option is clicked', async () => {
    const wrapper = mount(LanguagePicker, { props: { modelValue: 'auto' } })
    await wrapper.get('[data-testid="language-picker-input"]').trigger('focus')
    await wrapper.get('[data-testid="language-option-es"]').trigger('mousedown')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['es'])
  })

  it('closes the dropdown after selecting an option', async () => {
    const wrapper = mount(LanguagePicker, { props: { modelValue: 'auto' } })
    await wrapper.get('[data-testid="language-picker-input"]').trigger('focus')
    await wrapper.get('[data-testid="language-option-es"]').trigger('mousedown')
    expect(wrapper.find('[data-testid="language-picker-dropdown"]').exists()).toBe(false)
  })

  it('closes the dropdown on Escape without emitting', async () => {
    const wrapper = mount(LanguagePicker, { props: { modelValue: 'auto' } })
    await wrapper.get('[data-testid="language-picker-input"]').trigger('focus')
    expect(wrapper.find('[data-testid="language-picker-dropdown"]').exists()).toBe(true)
    await wrapper.get('[data-testid="language-picker-input"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-testid="language-picker-dropdown"]').exists()).toBe(false)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('is disabled when the disabled prop is true', () => {
    const wrapper = mount(LanguagePicker, { props: { modelValue: 'auto', disabled: true } })
    expect(wrapper.get<HTMLInputElement>('[data-testid="language-picker-input"]').element.disabled).toBe(true)
  })
})
