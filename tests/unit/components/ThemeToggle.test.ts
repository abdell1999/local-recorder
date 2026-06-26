import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ThemeToggle from '../../../app/components/settings/ThemeToggle.vue'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() }),
  })
})

describe('ThemeToggle', () => {
  it('renders the three theme buttons', () => {
    const wrapper = mount(ThemeToggle)
    expect(wrapper.find('[data-testid="theme-option-auto"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="theme-option-light"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="theme-option-dark"]').exists()).toBe(true)
  })

  it('clicking dark adds dark class to documentElement', async () => {
    const wrapper = mount(ThemeToggle)
    await wrapper.find('[data-testid="theme-option-dark"]').trigger('click')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('clicking light removes dark class', async () => {
    document.documentElement.classList.add('dark')
    const wrapper = mount(ThemeToggle)
    await wrapper.find('[data-testid="theme-option-light"]').trigger('click')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
