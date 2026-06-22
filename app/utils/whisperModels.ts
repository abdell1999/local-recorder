export type WhisperModelSize = 'tiny' | 'base' | 'small' | 'medium'

export const WHISPER_MODELS: Record<WhisperModelSize, string> = {
  tiny: 'onnx-community/whisper-tiny',
  base: 'onnx-community/whisper-base',
  small: 'onnx-community/whisper-small',
  medium: 'onnx-community/whisper-medium',
}

export function getModelRepoId(size: WhisperModelSize): string {
  return WHISPER_MODELS[size]
}
