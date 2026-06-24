import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RecordButton from '../../../app/components/recorder/RecordButton.vue'

describe('RecordButton', () => {
  it('shows the given label and emits start when clicked', async () => {
    const wrapper = mount(RecordButton, { props: { state: 'idle', source: 'microphone', label: 'Grabar micrófono' } })
    expect(wrapper.text()).toContain('Grabar micrófono')
    await wrapper.get('[data-testid="record-button-microphone"]').trigger('click')
    expect(wrapper.emitted('start')).toHaveLength(1)
  })

  it('uses a distinct data-testid per source', () => {
    const wrapper = mount(RecordButton, { props: { state: 'idle', source: 'tab', label: 'Grabar pestaña' } })
    expect(wrapper.find('[data-testid="record-button-tab"]').exists()).toBe(true)
  })

  it('renders nothing while recording', () => {
    const wrapper = mount(RecordButton, { props: { state: 'recording', source: 'microphone', label: 'Grabar micrófono' } })
    expect(wrapper.find('[data-testid="record-button-microphone"]').exists()).toBe(false)
  })
})
