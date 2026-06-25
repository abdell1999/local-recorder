import { describe, it, expect } from 'vitest'
import { alignChunksWithSpeakers } from '../../../app/utils/speakerTranscriptAlignment'
import type { WhisperChunk } from '../../../app/workers/whisper.types'
import type { SpeakerSegment } from '../../../app/workers/speakerSegmentation.types'

const seg = (start: number, end: number, globalSpeakerId: number | null): SpeakerSegment => ({
  windowIndex: 0,
  localSpeakerId: 1,
  start,
  end,
  confidence: 1,
  globalSpeakerId,
})

const chunk = (start: number, end: number | null, text: string): WhisperChunk => ({
  text,
  timestamp: [start, end],
})

describe('alignChunksWithSpeakers', () => {
  it('returns an empty array for empty chunks', () => {
    expect(alignChunksWithSpeakers([], [])).toEqual([])
  })

  it('assigns null when there are no segments', () => {
    expect(alignChunksWithSpeakers([chunk(0, 2, ' hello')], [])).toEqual([
      { globalSpeakerId: null, text: ' hello' },
    ])
  })

  it('ignores segments with null globalSpeakerId', () => {
    expect(alignChunksWithSpeakers([chunk(0, 2, ' hello')], [seg(0, 2, null)])).toEqual([
      { globalSpeakerId: null, text: ' hello' },
    ])
  })

  it('groups all chunks of the same speaker into one block', () => {
    const chunks = [chunk(0, 2, ' hello'), chunk(2, 4, ' world')]
    const segments = [seg(0, 4, 0)]
    expect(alignChunksWithSpeakers(chunks, segments)).toEqual([
      { globalSpeakerId: 0, text: ' hello world' },
    ])
  })

  it('creates separate blocks for alternating speakers', () => {
    const chunks = [chunk(0, 2, ' hello'), chunk(2, 4, ' world')]
    const segments = [seg(0, 2, 0), seg(2, 4, 1)]
    expect(alignChunksWithSpeakers(chunks, segments)).toEqual([
      { globalSpeakerId: 0, text: ' hello' },
      { globalSpeakerId: 1, text: ' world' },
    ])
  })

  it('assigns a chunk to the segment with greater overlap', () => {
    // chunk 1–4: overlap with seg0 [0,2] = 1, overlap with seg1 [2,5] = 2 → seg1 wins
    const chunks = [chunk(1, 4, ' hi')]
    const segments = [seg(0, 2, 0), seg(2, 5, 1)]
    expect(alignChunksWithSpeakers(chunks, segments)).toEqual([
      { globalSpeakerId: 1, text: ' hi' },
    ])
  })

  it('assigns null to a chunk with no positive overlap with any segment', () => {
    // chunk 5–6 does not overlap with seg 0–4
    const chunks = [chunk(5, 6, ' hi')]
    const segments = [seg(0, 4, 0)]
    expect(alignChunksWithSpeakers(chunks, segments)).toEqual([
      { globalSpeakerId: null, text: ' hi' },
    ])
  })

  it('handles a chunk with null timestamp end without crashing', () => {
    // chunkEnd = chunkStart = 1; overlap with seg [0,2] = min(1,2) - max(1,0) = 0, not positive → null
    const chunks = [chunk(1, null, ' hi')]
    const segments = [seg(0, 2, 0)]
    expect(alignChunksWithSpeakers(chunks, segments)).toEqual([
      { globalSpeakerId: null, text: ' hi' },
    ])
  })

  it('merges non-consecutive same-speaker blocks separated by a null block', () => {
    // Two speaker-0 chunks separated by a chunk with no segment → three blocks, not two
    const chunks = [chunk(0, 2, ' A'), chunk(4, 6, ' B'), chunk(8, 10, ' C')]
    const segments = [seg(0, 2, 0), seg(8, 10, 0)]
    expect(alignChunksWithSpeakers(chunks, segments)).toEqual([
      { globalSpeakerId: 0, text: ' A' },
      { globalSpeakerId: null, text: ' B' },
      { globalSpeakerId: 0, text: ' C' },
    ])
  })
})
