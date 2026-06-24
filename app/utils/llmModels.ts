export type LlmModelSize = '0.5b' | '1.5b'

export const LLM_MODELS: Record<LlmModelSize, string> = {
  '0.5b': 'onnx-community/Qwen2.5-0.5B-Instruct',
  '1.5b': 'onnx-community/Qwen2.5-1.5B-Instruct',
}

export function getLlmModelRepoId(size: LlmModelSize): string {
  return LLM_MODELS[size]
}
