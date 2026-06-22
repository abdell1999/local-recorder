import type { WhisperChunk } from '../workers/whisper.types'

export interface TranscriptResult {
  text: string
  chunks: WhisperChunk[]
}

export function toTxt(result: TranscriptResult): string {
  return result.text.trim()
}

function formatTimestamp(seconds: number, separator: ',' | '.'): string {
  const totalMs = Math.round(seconds * 1000)
  const ms = totalMs % 1000
  const totalSeconds = Math.floor(totalMs / 1000)
  const s = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const m = totalMinutes % 60
  const h = Math.floor(totalMinutes / 60)
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms, 3)}`
}

export function toSrt(result: TranscriptResult): string {
  return result.chunks
    .map((chunk, index) => {
      const [start, end] = chunk.timestamp
      const endTime = end ?? start
      return `${index + 1}\n${formatTimestamp(start, ',')} --> ${formatTimestamp(endTime, ',')}\n${chunk.text.trim()}\n`
    })
    .join('\n')
}

export function toVtt(result: TranscriptResult): string {
  const body = result.chunks
    .map((chunk) => {
      const [start, end] = chunk.timestamp
      const endTime = end ?? start
      return `${formatTimestamp(start, '.')} --> ${formatTimestamp(endTime, '.')}\n${chunk.text.trim()}\n`
    })
    .join('\n')
  return `WEBVTT\n\n${body}`
}

export function toJson(result: TranscriptResult): string {
  return JSON.stringify(result, null, 2)
}
