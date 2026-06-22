import { describe, it, expect } from 'vitest'
import { formatElapsed } from '../../../app/utils/formatElapsed'

describe('formatElapsed', () => {
  it('formats seconds under a minute', () => {
    expect(formatElapsed(5)).toBe('00:05')
  })

  it('formats minutes and seconds', () => {
    expect(formatElapsed(125)).toBe('02:05')
  })
})
