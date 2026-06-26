export type WhisperModelSize = 'tiny' | 'base' | 'small' | 'large-v3-turbo'

export const WHISPER_MODELS: Record<WhisperModelSize, string> = {
  tiny: 'onnx-community/whisper-tiny',
  base: 'onnx-community/whisper-base',
  small: 'onnx-community/whisper-small',
  'large-v3-turbo': 'onnx-community/whisper-large-v3-turbo',
}

export function getModelRepoId(size: WhisperModelSize): string {
  return WHISPER_MODELS[size]
}
