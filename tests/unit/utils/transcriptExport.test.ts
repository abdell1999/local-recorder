import { describe, it, expect } from 'vitest'
import { toTxt, toSrt, toVtt, toJson, toMarkdown, type TranscriptResult } from '../../../app/utils/transcriptExport'
import type { SpeakerSegment } from '../../../app/workers/speakerSegmentation.types'

const sample: TranscriptResult = {
  text: 'Hola mundo. Adiós.',
  chunks: [
    { text: 'Hola mundo.', timestamp: [0, 1.5] },
    { text: 'Adiós.', timestamp: [1.5, 2.25] },
  ],
}

describe('toTxt', () => {
  it('returns the trimmed plain text', () => {
    expect(toTxt(sample)).toBe('Hola mundo. Adiós.')
  })
})

describe('toSrt', () => {
  it('numbers each chunk and formats timestamps with a comma', () => {
    const srt = toSrt(sample)
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:01,500\nHola mundo.')
    expect(srt).toContain('2\n00:00:01,500 --> 00:00:02,250\nAdiós.')
  })
})

describe('toVtt', () => {
  it('starts with the WEBVTT header and uses dot timestamps', () => {
    const vtt = toVtt(sample)
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true)
    expect(vtt).toContain('00:00:00.000 --> 00:00:01.500\nHola mundo.')
  })
})

describe('toJson', () => {
  it('serializes the full result', () => {
    expect(JSON.parse(toJson(sample))).toEqual(sample)
  })
})

const seg = (start: number, end: number, globalSpeakerId: number | null): SpeakerSegment => ({
  windowIndex: 0,
  localSpeakerId: 1,
  start,
  end,
  confidence: 1,
  globalSpeakerId,
})

describe('toMarkdown', () => {
  it('returns empty string for empty chunks', () => {
    expect(toMarkdown({ text: '', chunks: [] })).toBe('')
  })

  it('returns fallback timestamp format for a single chunk without segments', () => {
    const chunks = [{ text: ' hello', timestamp: [5, 10] as [number, number | null] }]
    expect(toMarkdown({ text: 'hello', chunks })).toBe('**[00:05]** hello')
  })

  it('separates multiple fallback chunks with blank lines', () => {
    const chunks = [
      { text: ' hello', timestamp: [0, 5] as [number, number | null] },
      { text: ' world', timestamp: [5, 10] as [number, number | null] },
    ]
    expect(toMarkdown({ text: 'hello world', chunks })).toBe('**[00:00]** hello\n\n**[00:05]** world')
  })

  it('formats timestamps >= 3600s as HH:MM:SS', () => {
    const chunks = [{ text: ' hi', timestamp: [3661, 3670] as [number, number | null] }]
    expect(toMarkdown({ text: 'hi', chunks })).toBe('**[01:01:01]** hi')
  })

  it('groups consecutive chunks of the same speaker into one block', () => {
    const chunks = [
      { text: ' hello', timestamp: [0, 5] as [number, number | null] },
      { text: ' world', timestamp: [5, 10] as [number, number | null] },
    ]
    expect(toMarkdown({ text: 'hello world', chunks }, [seg(0, 10, 0)])).toBe(
      '**Hablante 1** · 00:00\n\nhello world',
    )
  })

  it('separates alternating speakers with ---', () => {
    const chunks = [
      { text: ' hello', timestamp: [0, 5] as [number, number | null] },
      { text: ' hi', timestamp: [5, 10] as [number, number | null] },
    ]
    expect(toMarkdown({ text: 'hello hi', chunks }, [seg(0, 5, 0), seg(5, 10, 1)])).toBe(
      '**Hablante 1** · 00:00\n\nhello\n\n---\n\n**Hablante 2** · 00:05\n\nhi',
    )
  })

  it('renders null-speaker chunks in fallback format within speaker output', () => {
    // First chunk has no overlapping segment → null speaker
    const chunks = [
      { text: ' overlap', timestamp: [0, 5] as [number, number | null] },
      { text: ' clear', timestamp: [5, 10] as [number, number | null] },
    ]
    expect(toMarkdown({ text: 'overlap clear', chunks }, [seg(5, 10, 0)])).toBe(
      '**[00:00]** overlap\n\n---\n\n**Hablante 1** · 00:05\n\nclear',
    )
  })

  it('with all-null globalSpeakerId behaves identically to no-segments fallback', () => {
    const chunks = [{ text: ' hello', timestamp: [0, 5] as [number, number | null] }]
    expect(toMarkdown({ text: 'hello', chunks }, [seg(0, 5, null)])).toBe(
      toMarkdown({ text: 'hello', chunks }),
    )
  })
})
