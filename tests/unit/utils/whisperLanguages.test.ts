import { describe, it, expect } from 'vitest'
import { WHISPER_LANGUAGES } from '../../../app/utils/whisperLanguages'

describe('whisperLanguages', () => {
  it('first entry is auto-detect', () => {
    const first = WHISPER_LANGUAGES[0]
    expect(first).toEqual({ code: 'auto', name: 'Auto-detectar' })
  })

  it('all entries have non-empty code and name', () => {
    for (const entry of WHISPER_LANGUAGES) {
      expect(entry.code.length).toBeGreaterThan(0)
      expect(entry.name.length).toBeGreaterThan(0)
    }
  })

  it('has no duplicate codes', () => {
    const codes = WHISPER_LANGUAGES.map((l) => l.code)
    expect(codes.length).toBe(new Set(codes).size)
  })

  it('contains Spanish and English', () => {
    const codes = WHISPER_LANGUAGES.map((l) => l.code)
    expect(codes).toContain('es')
    expect(codes).toContain('en')
  })
})
