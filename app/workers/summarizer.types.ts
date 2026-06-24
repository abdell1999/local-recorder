import type { LlmModelSize } from '../utils/llmModels'

export interface SummarizeRequest {
  type: 'summarize'
  text: string
  modelSize: LlmModelSize
}

export interface SummaryProgressMessage {
  type: 'progress'
  status: 'loading-model' | 'summarizing'
}

export interface SummaryDeviceMessage {
  type: 'device'
  device: 'webgpu' | 'wasm'
}

export interface SummaryModelProgressMessage {
  type: 'model-download-progress'
  percent: number
}

export interface SummaryResultMessage {
  type: 'result'
  summary: string
}

export interface SummaryErrorMessage {
  type: 'error'
  message: string
}

export type SummarizerWorkerRequest = SummarizeRequest
export type SummarizerWorkerResponse =
  | SummaryProgressMessage
  | SummaryDeviceMessage
  | SummaryModelProgressMessage
  | SummaryResultMessage
  | SummaryErrorMessage
