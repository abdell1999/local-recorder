import { toPcm16kMono } from './resample'

export async function decodeAudioFile(arrayBuffer: ArrayBuffer): Promise<Float32Array> {
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const audioContext = new AudioContextClass()
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    const channelData: Float32Array[] = []
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      channelData.push(audioBuffer.getChannelData(i))
    }
    return toPcm16kMono(channelData, audioBuffer.sampleRate)
  } finally {
    await audioContext.close()
  }
}
