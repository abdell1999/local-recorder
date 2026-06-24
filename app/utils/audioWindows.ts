export interface AudioWindow {
  start: number
  end: number
}

export function computeWindows(
  totalSamples: number,
  sampleRate: number,
  windowSeconds: number,
  stepSeconds: number,
): AudioWindow[] {
  const windowSamples = Math.round(windowSeconds * sampleRate)
  const stepSamples = Math.round(stepSeconds * sampleRate)

  if (totalSamples <= windowSamples) {
    return [{ start: 0, end: totalSamples }]
  }

  const windows: AudioWindow[] = []
  let start = 0
  while (true) {
    const end = Math.min(start + windowSamples, totalSamples)
    windows.push({ start, end })
    if (end >= totalSamples) break
    start += stepSamples
  }
  return windows
}
