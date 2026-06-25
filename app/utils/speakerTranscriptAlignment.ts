import type { WhisperChunk } from '../workers/whisper.types'
import type { SpeakerSegment } from '../workers/speakerSegmentation.types'

export interface AlignedSpeakerBlock {
  globalSpeakerId: number | null
  text: string
}

export function alignChunksWithSpeakers(
  chunks: WhisperChunk[],
  segments: SpeakerSegment[],
): AlignedSpeakerBlock[] {
  const blocks: AlignedSpeakerBlock[] = []

  for (const chunk of chunks) {
    const [chunkStart, chunkEndOrNull] = chunk.timestamp
    const chunkEnd = chunkEndOrNull ?? chunkStart

    let bestSpeakerId: number | null = null
    let bestOverlap = 0

    for (const segment of segments) {
      if (segment.globalSpeakerId === null) continue
      const overlap = Math.min(chunkEnd, segment.end) - Math.max(chunkStart, segment.start)
      if (overlap > bestOverlap) {
        bestOverlap = overlap
        bestSpeakerId = segment.globalSpeakerId
      }
    }

    const last = blocks[blocks.length - 1]
    if (last !== undefined && last.globalSpeakerId === bestSpeakerId) {
      last.text += chunk.text
    } else {
      blocks.push({ globalSpeakerId: bestSpeakerId, text: chunk.text })
    }
  }

  return blocks
}
