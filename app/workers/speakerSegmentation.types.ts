export interface SegmentRequest {
  type: 'segment'
  audio: Float32Array
}

export interface SegmentationProgressMessage {
  type: 'progress'
  status: 'loading-model' | 'segmenting' | 'identifying-speakers'
}

export interface SegmentationDeviceMessage {
  type: 'device'
  device: 'webgpu' | 'wasm'
}

export interface SegmentationModelProgressMessage {
  type: 'model-download-progress'
  percent: number
}

export interface LocalSpeakerSegment {
  windowIndex: number
  localSpeakerId: number
  start: number
  end: number
  confidence: number
}

export interface SpeakerSegment extends LocalSpeakerSegment {
  globalSpeakerId: number | null
}

export interface SegmentationResultMessage {
  type: 'result'
  segments: SpeakerSegment[]
}

export interface SegmentationErrorMessage {
  type: 'error'
  message: string
}

export type SpeakerSegmentationWorkerRequest = SegmentRequest
export type SpeakerSegmentationWorkerResponse =
  | SegmentationProgressMessage
  | SegmentationDeviceMessage
  | SegmentationModelProgressMessage
  | SegmentationResultMessage
  | SegmentationErrorMessage
