import { describe, it, expect } from 'vitest'
import { mixToMono, resampleTo16k, toPcm16kMono } from '../../../app/utils/audio/resample'

describe('mixToMono', () => {
  it('returns the single channel unchanged when there is only one', () => {
    const channel = new Float32Array([0.1, 0.2, 0.3])
    expect(mixToMono([channel])).toBe(channel)
  })

  it('averages two channels sample by sample', () => {
    const left = new Float32Array([1, 0])
    const right = new Float32Array([0, 1])
    expect(Array.from(mixToMono([left, right]))).toEqual([0.5, 0.5])
  })
})

describe('resampleTo16k', () => {
  it('returns the input unchanged when already at 16kHz', () => {
    const mono = new Float32Array([0.1, 0.2, 0.3])
    expect(resampleTo16k(mono, 16000)).toBe(mono)
  })

  it('halves the sample count when downsampling from 32kHz', () => {
    const mono = new Float32Array([0, 1, 0, 1, 0, 1, 0, 1])
    const result = resampleTo16k(mono, 32000)
    expect(result.length).toBe(4)
  })
})

describe('toPcm16kMono', () => {
  it('mixes down and resamples in one call', () => {
    const left = new Float32Array([1, 1, 1, 1])
    const right = new Float32Array([1, 1, 1, 1])
    const result = toPcm16kMono([left, right], 32000)
    expect(result.length).toBe(2)
    expect(Array.from(result)).toEqual([1, 1])
  })
})
