import { ref } from 'vue'

export type RecorderState = 'idle' | 'recording' | 'stopped' | 'error'

export function useRecorder() {
  const state = ref<RecorderState>('idle')
  const errorMessage = ref<string | null>(null)
  let mediaRecorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let stream: MediaStream | null = null

  async function start() {
    errorMessage.value = null
    chunks = []
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      state.value = 'error'
      errorMessage.value = 'mic-permission-denied'
      return
    }
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
