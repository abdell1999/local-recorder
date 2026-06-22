import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RecordButton from '../../../app/components/recorder/RecordButton.vue'

describe('RecordButton', () => {
  it('shows "Grabar" and emits start when idle', async () => {
    const wrapper = mount(RecordButton, { props: { state: 'idle' } })
    expect(wrapper.text()).toContain('Grabar')
    await wrapper.get('[data-testid="record-button"]').trigger('click')
    expect(wrapper.emitted('start')).toHaveLength(1)
  })

  it('shows "Detener" and emits stop when recording', async () => {
    const wrapper = mount(RecordButton, { props: { state: 'recording' } })
    expect(wrapper.text()).toContain('Detener')
    await wrapper.get('[data-testid="record-button"]').trigger('click')
    expect(wrapper.emitted('stop')).toHaveLength(1)
  })
})
