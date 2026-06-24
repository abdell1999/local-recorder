import { ref } from 'vue'

export type RecorderState = 'idle' | 'recording' | 'stopped' | 'error'
export type RecorderSource = 'microphone' | 'tab'

export function useRecorder() {
  const state = ref<RecorderState>('idle')
  const errorMessage = ref<string | null>(null)
  let mediaRecorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let stream: MediaStream | null = null

  async function getMicrophoneStream(): Promise<MediaStream | null> {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      state.value = 'error'
      errorMessage.value = 'mic-permission-denied'
      return null
    }
  }

  async function getTabStream(): Promise<MediaStream | null> {
    let tabStream: MediaStream
    try {
      tabStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    } catch {
      state.value = 'error'
      errorMessage.value = 'tab-permission-denied'
      return null
    }
    tabStream.getVideoTracks().forEach((track) => track.stop())
    if (tabStream.getAudioTracks().length === 0) {
      state.value = 'error'
      errorMessage.value = 'tab-audio-not-shared'
      return null
    }
    return tabStream
  }

  async function start(source: RecorderSource = 'microphone') {
    errorMessage.value = null
    chunks = []
    stream = source === 'tab' ? await getTabStream() : await getMicrophoneStream()
    if (!stream) return

    mediaRecorder = new MediaRecorder(stream)
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    mediaRecorder.start()
    state.value = 'recording'
  }

  function stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!mediaRecorder) {
        resolve(new Blob())
        return
      }
      mediaRecorder.onstop = () => {
        state.value = 'stopped'
        stream?.getTracks().forEach((track) => track.stop())
        resolve(new Blob(chunks, { type: 'audio/webm' }))
      }
      mediaRecorder.stop()
    })
  }

  return { state, errorMessage, start, stop }
}
