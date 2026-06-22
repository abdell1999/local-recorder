import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RecordingTimer from '../../../app/components/recorder/RecordingTimer.vue'

describe('RecordingTimer', () => {
  it('renders the formatted elapsed time', () => {
    const wrapper = mount(RecordingTimer, { props: { seconds: 65 } })
    expect(wrapper.get('[data-testid="recording-timer"]').text()).toBe('01:05')
  })
})
