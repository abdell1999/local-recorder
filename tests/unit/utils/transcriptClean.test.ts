import { describe, it, expect } from 'vitest'
import { isNonSpeechAnnotation, filterNonSpeechChunks, deriveText } from '../../../app/utils/transcriptClean'
import type { WhisperChunk } from '../../../app/workers/whisper.types'

const chunk = (text: string): WhisperChunk => ({ text, timestamp: [0, 1] })

describe('isNonSpeechAnnotation', () => {
  it('matches a whole chunk wrapped in square brackets', () => {
    expect(isNonSpeechAnnotation('[MUSIC]')).toBe(true)
  })

  it('matches a whole chunk wrapped in parentheses', () => {
    expect(isNonSpeechAnnotation('(applause)')).toBe(true)
  })

  it('ignores surrounding whitespace', () => {
    expect(isNonSpeechAnnotation('  [ Music playing ]  ')).toBe(true)
  })

  it('does not look at the words, only the structure', () => {
    expect(isNonSpeechAnnotation('[Blank_Audio]')).toBe(true)
    expect(isNonSpeechAnnotation('[anything at all]')).toBe(true)
  })

  it('does not match normal spoken text', () => {
    expect(isNonSpeechAnnotation('Hola, ¿cómo estás?')).toBe(false)
  })

  it('does not match text that only partially contains parentheses', () => {
    expect(isNonSpeechAnnotation('hola (en serio)')).toBe(false)
  })
})

describe('filterNonSpeechChunks', () => {
  it('drops chunks that are entirely a non-speech annotation', () => {
    const chunks = [chunk('Hola mundo'), chunk('[MUSIC]'), chunk('Adiós')]
    expect(filterNonSpeechChunks(chunks)).toEqual([chunk('Hola mundo'), chunk('Adiós')])
  })

  it('returns an empty array when every chunk is an annotation', () => {
    const chunks = [chunk('[MUSIC]'), chunk('(applause)')]
    expect(filterNonSpeechChunks(chunks)).toEqual([])
  })

  it('returns all chunks unchanged when none are annotations', () => {
    const chunks = [chunk('Hola'), chunk('Adiós')]
    expect(filterNonSpeechChunks(chunks)).toEqual(chunks)
  })
})

describe('deriveText', () => {
  it('joins the trimmed text of the surviving chunks', () => {
    expect(deriveText([chunk(' Hola '), chunk('mundo')], 'irrelevant')).toBe('Hola mundo')
  })

  it('falls back to the trimmed fallback text when there are no chunks and it is not an annotation', () => {
    expect(deriveText([], '  hola mundo  ')).toBe('hola mundo')
  })

  it('returns an empty string when there are no chunks and the fallback text is itself an annotation', () => {
    expect(deriveText([], '[MUSIC]')).toBe('')
  })
})
