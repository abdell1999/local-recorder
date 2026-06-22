import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ExportMenu from '../../../app/components/export/ExportMenu.vue'

const sample = {
  text: 'Hola mundo.',
  chunks: [{ text: 'Hola mundo.', timestamp: [0, 1] as [number, number] }],
}

beforeEach(() => {
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

describe('ExportMenu', () => {
  it('triggers a TXT download when the TXT button is clicked', async () => {
    const wrapper = mount(ExportMenu, { props: { result: sample } })
    await wrapper.get('[data-testid="export-txt"]').trigger('click')
    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled()
  })

  it('triggers a JSON download when the JSON button is clicked', async () => {
    const wrapper = mount(ExportMenu, { props: { result: sample } })
    await wrapper.get('[data-testid="export-json"]').trigger('click')
    expect(URL.createObjectURL).toHaveBeenCalled()
  })
})
