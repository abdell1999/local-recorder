import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FileDropzone from '../../../app/components/importer/FileDropzone.vue'

function dropEventWith(file: File) {
  return { preventDefault: () => {}, dataTransfer: { files: [file] } } as unknown as DragEvent
}

describe('FileDropzone', () => {
  it('emits file-selected when an accepted file is dropped', async () => {
    const wrapper = mount(FileDropzone)
    const file = new File(['x'], 'memo.mp3', { type: 'audio/mpeg' })
    await wrapper.get('[data-testid="file-dropzone"]').trigger('drop', {} as Event)
    ;(wrapper.vm as unknown as { onDrop: (e: DragEvent) => void }).onDrop?.(dropEventWith(file))
    expect(wrapper.emitted('file-selected')?.[0]).toEqual([file])
  })

  it('emits rejected for an unsupported file type via the file input', async () => {
    const wrapper = mount(FileDropzone)
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
    const input = wrapper.get<HTMLInputElement>('[data-testid="file-input"]')
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    expect(wrapper.emitted('rejected')?.[0]).toEqual(['unsupported-file-type'])
  })
})
