import { describe, it, expect } from 'vitest'
import { LLM_MODELS, getLlmModelRepoId } from '../../../app/utils/llmModels'

describe('llmModels', () => {
  it('has exactly the two supported sizes', () => {
    expect(Object.keys(LLM_MODELS).sort()).toEqual(['0.5b', '1.5b'])
  })

  it('returns the matching repo id for each size', () => {
    expect(getLlmModelRepoId('0.5b')).toBe('onnx-community/Qwen2.5-0.5B-Instruct')
    expect(getLlmModelRepoId('1.5b')).toBe('onnx-community/Qwen2.5-1.5B-Instruct')
  })
})
