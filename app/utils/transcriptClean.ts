import type { WhisperChunk } from '../workers/whisper.types'

const BRACKET_ANNOTATION = /^\[[^[\]]*\]$/
const PAREN_ANNOTATION = /^\([^()]*\)$/

export function isNonSpeechAnnotation(text: string): boolean {
  const trimmed = text.trim()
  return BRACKET_ANNOTATION.test(trimmed) || PAREN_ANNOTATION.test(trimmed)
}

export function filterNonSpeechChunks(chunks: WhisperChunk[]): WhisperChunk[] {
  return chunks.filter((chunk) => !isNonSpeechAnnotation(chunk.text))
}

export function deriveText(chunks: WhisperChunk[], fallbackText: string): string {
  if (chunks.length > 0) {
    return chunks
      .map((chunk) => chunk.text.trim())
      .join(' ')
      .trim()
  }
  const trimmedFallback = fallbackText.trim()
  if (isNonSpeechAnnotation(trimmedFallback)) {
    return ''
  }
  // Only use fallback if it contains multiple words
  return trimmedFallback.split(/\s+/).length > 1 ? trimmedFallback : ''
}
