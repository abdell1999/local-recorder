export function mixToMono(channelData: Float32Array[]): Float32Array {
  if (channelData.length === 1) return channelData[0]
  const length = channelData[0].length
  const mono = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    let sum = 0
    for (const channel of channelData) sum += channel[i]
    mono[i] = sum / channelData.length
  }
  return mono
}

export function resampleTo16k(mono: Float32Array, originalSampleRate: number): Float32Array {
  const targetRate = 16000
  if (originalSampleRate === targetRate) return mono
  const ratio = originalSampleRate / targetRate
  const newLength = Math.round(mono.length / ratio)
  const result = new Float32Array(newLength)
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio
    const lower = Math.floor(srcIndex)
    const upper = Math.min(lower + 1, mono.length - 1)
    const frac = srcIndex - lower
    result[i] = mono[lower] + (mono[upper] - mono[lower]) * frac
  }
  return result
}

export function toPcm16kMono(channelData: Float32Array[], originalSampleRate: number): Float32Array {
  return resampleTo16k(mixToMono(channelData), originalSampleRate)
}
