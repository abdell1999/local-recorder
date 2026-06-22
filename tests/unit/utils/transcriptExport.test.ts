import { describe, it, expect } from 'vitest'
import { toTxt, toSrt, toVtt, toJson, type TranscriptResult } from '../../../app/utils/transcriptExport'

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
