import { describe, it, expect, vi } from 'vitest'
import type { ProgressInfo } from '@huggingface/transformers'
import { createProgressAggregator } from '../../../app/utils/modelDownloadProgress'

const progressEvent = (file: string, loaded: number, total: number): ProgressInfo => ({
  status: 'progress',
  name: 'model',
  file,
  progress: total === 0 ? 0 : (loaded / total) * 100,
  loaded,
  total,
})

describe('createProgressAggregator', () => {
  it('reports the aggregated percent across multiple files', () => {
    const onPercent = vi.fn()
    const onProgress = createProgressAggregator(onPercent)

    onProgress(progressEvent('a.bin', 50, 100))
    onProgress(progressEvent('b.bin', 0, 100))

    expect(onPercent).toHaveBeenLastCalledWith(25)
  })

  it('only calls onPercent when the rounded value changes', () => {
    const onPercent = vi.fn()
    const onProgress = createProgressAggregator(onPercent)

    onProgress(progressEvent('a.bin', 50, 100))
    onProgress(progressEvent('a.bin', 50, 100))

    expect(onPercent).toHaveBeenCalledTimes(1)
  })

  it('ignores non-progress status events', () => {
    const onPercent = vi.fn()
    const onProgress = createProgressAggregator(onPercent)

    onProgress({ status: 'initiate', name: 'model', file: 'a.bin' })

    expect(onPercent).not.toHaveBeenCalled()
  })

  it('does not call onPercent while the total is zero', () => {
    const onPercent = vi.fn()
    const onProgress = createProgressAggregator(onPercent)

    onProgress(progressEvent('a.bin', 0, 0))

    expect(onPercent).not.toHaveBeenCalled()
  })
})
