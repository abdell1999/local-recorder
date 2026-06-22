import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../app/utils/audio/decodeAudioFile')

import { useFileImport } from '../../../app/composables/useFileImport'
import { decodeAudioFile } from '../../../app/utils/audio/decodeAudioFile'

const decodeAudioFileMock = vi.mocked(decodeAudioFile)

beforeEach(() => {
  decodeAudioFileMock.mockReset()
})

describe('useFileImport', () => {
  it('rejects unsupported file types without decoding', async () => {
    const { state, errorMessage, importFile } = useFileImport()
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' })

    const result = await importFile(file)

    expect(result).toBeNull()
    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('unsupported-file-type')
    expect(decodeAudioFileMock).not.toHaveBeenCalled()
  })

  it('decodes accepted audio files and returns the PCM data', async () => {
    const pcm = new Float32Array([0.1, 0.2])
    decodeAudioFileMock.mockResolvedValue(pcm)
    const { state, importFile } = useFileImport()
    const file = new File(['x'], 'memo.mp3', { type: 'audio/mpeg' })

    const result = await importFile(file)

    expect(result).toBe(pcm)
    expect(state.value).toBe('done')
  })

  it('sets an error state when decoding fails', async () => {
    decodeAudioFileMock.mockRejectedValue(new Error('bad data'))
    const { state, errorMessage, importFile } = useFileImport()
    const file = new File(['x'], 'memo.mp4', { type: 'video/mp4' })

    const result = await importFile(file)

    expect(result).toBeNull()
    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('decode-failed')
  })
})
