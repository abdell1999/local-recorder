import type { WhisperModelSize } from '../utils/whisperModels'

export interface WhisperChunk {
  text: string
  timestamp: [number, number | null]
}

export interface WhisperTranscribeRequest {
  type: 'transcribe'
  audio: Float32Array
  modelSize: WhisperModelSize
}

export interface WhisperProgressMessage {
  type: 'progress'
  status: 'loading-model' | 'transcribing'
}

export interface WhisperDeviceMessage {
  type: 'device'
  device: 'webgpu' | 'wasm'
}

export interface WhisperResultMessage {
  type: 'result'
  text: string
  chunks: WhisperChunk[]
}

export interface WhisperErrorMessage {
  type: 'error'
  message: string
}

export interface WhisperModelProgressMessage {
  type: 'model-download-progress'
  percent: number
}

export type WhisperWorkerRequest = WhisperTranscribeRequest
export type WhisperWorkerResponse =
  | WhisperProgressMessage
  | WhisperDeviceMessage
  | WhisperModelProgressMessage
  | WhisperResultMessage
  | WhisperErrorMessage
