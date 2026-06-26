import type { WhisperChunk } from '../workers/whisper.types'
import type { SpeakerSegment } from '../workers/speakerSegmentation.types'

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

function formatMd(seconds: number): string {
  const totalSeconds = Math.floor(seconds)
  const s = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const m = totalMinutes % 60
  const h = Math.floor(totalMinutes / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function assignSpeaker(chunk: WhisperChunk, segments: SpeakerSegment[]): number | null {
  const [chunkStart, chunkEndOrNull] = chunk.timestamp
  const chunkEnd = chunkEndOrNull ?? chunkStart
  let bestId: number | null = null
  let bestOverlap = 0
  for (const segment of segments) {
    if (segment.globalSpeakerId === null) continue
    const overlap = Math.min(chunkEnd, segment.end) - Math.max(chunkStart, segment.start)
    if (overlap > bestOverlap) {
      bestOverlap = overlap
      bestId = segment.globalSpeakerId
    }
  }
  return bestId
}

export function toMarkdown(result: TranscriptResult, segments?: SpeakerSegment[]): string {
  if (result.chunks.length === 0) return ''

  if (!segments || segments.length === 0) {
    return result.chunks
      .map((chunk) => {
        const [start] = chunk.timestamp
        return `**[${formatMd(start)}]** ${chunk.text.trim()}`
      })
      .join('\n\n')
  }

  type Group = { globalSpeakerId: number | null; chunks: WhisperChunk[] }
  const groups: Group[] = []
  for (const chunk of result.chunks) {
    const speakerId = assignSpeaker(chunk, segments)
    const last = groups[groups.length - 1]
    if (last !== undefined && last.globalSpeakerId === speakerId) {
      last.chunks.push(chunk)
    } else {
      groups.push({ globalSpeakerId: speakerId, chunks: [chunk] })
    }
  }

  return groups
    .map((group) => {
      const firstChunk = group.chunks[0]
      if (firstChunk === undefined) return ''
      if (group.globalSpeakerId !== null) {
        const [start] = firstChunk.timestamp
        const text = group.chunks.map((c) => c.text.trim()).join(' ')
        return `**Hablante ${group.globalSpeakerId + 1}** · ${formatMd(start)}\n\n${text}`
      }
      return group.chunks
        .map((c) => {
          const [cStart] = c.timestamp
          return `**[${formatMd(cStart)}]** ${c.text.trim()}`
        })
        .join('\n\n')
    })
    .filter((s) => s !== '')
    .join('\n\n---\n\n')
}
