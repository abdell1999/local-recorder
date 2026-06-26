import { describe, it, expect } from 'vitest'
import { WHISPER_MODELS, getModelRepoId } from '../../../app/utils/whisperModels'

describe('whisperModels', () => {
  it('has exactly the four supported sizes', () => {
    expect(Object.keys(WHISPER_MODELS).sort()).toEqual(['base', 'large-v3-turbo', 'small', 'tiny'])
  })

  it('returns the matching repo id for each size', () => {
    expect(getModelRepoId('tiny')).toBe('onnx-community/whisper-tiny')
    expect(getModelRepoId('small')).toBe('onnx-community/whisper-small')
    expect(getModelRepoId('large-v3-turbo')).toBe('onnx-community/whisper-large-v3-turbo')
  })
})
