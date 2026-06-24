import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRecorder } from '../../../app/composables/useRecorder'

class FakeMediaRecorder {
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(public stream: MediaStream) {}
  start() {}
  stop() {
    this.ondataavailable?.({ data: new Blob(['chunk']) })
    this.onstop?.()
  }
}

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder as unknown as typeof MediaRecorder)
})

describe('useRecorder', () => {
  it('transitions to recording after a successful start', async () => {
    const fakeTrack = { stop: vi.fn() }
    const fakeStream = { getTracks: () => [fakeTrack] } as unknown as MediaStream
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) } })

    const { state, start } = useRecorder()
    await start()

    expect(state.value).toBe('recording')
  })

  it('resolves stop() with a Blob and moves to stopped', async () => {
    const fakeTrack = { stop: vi.fn() }
    const fakeStream = { getTracks: () => [fakeTrack] } as unknown as MediaStream
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) } })

    const { state, start, stop } = useRecorder()
    await start()
    const blob = await stop()

    expect(blob).toBeInstanceOf(Blob)
    expect(state.value).toBe('stopped')
    expect(fakeTrack.stop).toHaveBeenCalled()
  })

  it('sets an error state when microphone permission is denied', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) },
    })

    const { state, errorMessage, start } = useRecorder()
    await start()

    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('mic-permission-denied')
  })

  it('starts recording from a shared tab and stops its video track', async () => {
    const audioTrack = { stop: vi.fn() }
    const videoTrack = { stop: vi.fn() }
    const fakeStream = {
      getTracks: () => [audioTrack, videoTrack],
      getAudioTracks: () => [audioTrack],
      getVideoTracks: () => [videoTrack],
    } as unknown as MediaStream
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(fakeStream) } })

    const { state, start } = useRecorder()
    await start('tab')

    expect(state.value).toBe('recording')
    expect(videoTrack.stop).toHaveBeenCalled()
  })

  it('sets an error state when the shared tab has no audio track', async () => {
    const videoTrack = { stop: vi.fn() }
    const fakeStream = {
      getTracks: () => [videoTrack],
      getAudioTracks: () => [],
      getVideoTracks: () => [videoTrack],
    } as unknown as MediaStream
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(fakeStream) } })

    const { state, errorMessage, start } = useRecorder()
    await start('tab')

    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('tab-audio-not-shared')
    expect(videoTrack.stop).toHaveBeenCalled()
  })

  it('sets an error state when the tab share picker is cancelled', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getDisplayMedia: vi.fn().mockRejectedValue(new Error('cancelled')) },
    })

    const { state, errorMessage, start } = useRecorder()
    await start('tab')

    expect(state.value).toBe('error')
    expect(errorMessage.value).toBe('tab-permission-denied')
  })
})
