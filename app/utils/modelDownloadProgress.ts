import type { ProgressInfo } from '@huggingface/transformers'

export function createProgressAggregator(onPercent: (percent: number) => void) {
  const fileBytes = new Map<string, { loaded: number; total: number }>()
  let lastPostedPercent = -1
  return function onProgress(info: ProgressInfo) {
    if (info.status !== 'progress') return
    fileBytes.set(info.file, { loaded: info.loaded, total: info.total })
    let loadedSum = 0
    let totalSum = 0
    for (const entry of fileBytes.values()) {
      loadedSum += entry.loaded
      totalSum += entry.total
    }
    if (totalSum === 0) return
    const percent = Math.round((loadedSum / totalSum) * 100)
    if (percent !== lastPostedPercent) {
      lastPostedPercent = percent
      onPercent(percent)
    }
  }
}
