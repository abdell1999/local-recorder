import { describe, it, expect } from 'vitest'
import { computeWindows } from '../../../app/utils/audioWindows'

const SAMPLE_RATE = 16000

describe('computeWindows', () => {
  it('returns a single window when the audio is shorter than one window', () => {
    const totalSamples = 3 * SAMPLE_RATE
    expect(computeWindows(totalSamples, SAMPLE_RATE, 10, 5)).toEqual([{ start: 0, end: totalSamples }])
  })

  it('returns a single window when the audio is exactly one window long', () => {
    const totalSamples = 10 * SAMPLE_RATE
    expect(computeWindows(totalSamples, SAMPLE_RATE, 10, 5)).toEqual([{ start: 0, end: totalSamples }])
  })

  it('covers audio that aligns exactly with the step, ending exactly on the last window', () => {
    const totalSamples = 25 * SAMPLE_RATE
    const windows = computeWindows(totalSamples, SAMPLE_RATE, 10, 5)
    expect(windows).toEqual([
      { start: 0, end: 10 * SAMPLE_RATE },
      { start: 5 * SAMPLE_RATE, end: 15 * SAMPLE_RATE },
      { start: 10 * SAMPLE_RATE, end: 20 * SAMPLE_RATE },
      { start: 15 * SAMPLE_RATE, end: 25 * SAMPLE_RATE },
    ])
  })

  it('shortens the final window when the audio does not align exactly with the step', () => {
    const totalSamples = 23 * SAMPLE_RATE
    const windows = computeWindows(totalSamples, SAMPLE_RATE, 10, 5)
    expect(windows).toEqual([
      { start: 0, end: 10 * SAMPLE_RATE },
      { start: 5 * SAMPLE_RATE, end: 15 * SAMPLE_RATE },
      { start: 10 * SAMPLE_RATE, end: 20 * SAMPLE_RATE },
      { start: 15 * SAMPLE_RATE, end: 23 * SAMPLE_RATE },
    ])
  })
})
