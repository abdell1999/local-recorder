import { test, expect } from '@playwright/test'

function createSilentWav(durationSeconds: number): Buffer {
  const sampleRate = 16000
  const numSamples = sampleRate * durationSeconds
  const dataSize = numSamples * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  return buffer
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class FakeWhisperWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null
      onerror: (() => void) | null = null
      postMessage(message: { type: string }) {
        if (message.type !== 'transcribe') return
        setTimeout(() => this.onmessage?.({ data: { type: 'progress', status: 'loading-model' } }), 0)
        setTimeout(() => this.onmessage?.({ data: { type: 'progress', status: 'transcribing' } }), 10)
        setTimeout(
          () =>
            this.onmessage?.({
              data: {
                type: 'result',
                text: 'hola mundo de prueba',
                chunks: [{ text: 'hola mundo de prueba', timestamp: [0, 1] }],
              },
            }),
          20,
        )
      }
      terminate() {}
    }
    // @ts-expect-error overriding the global Worker with a test double
    window.Worker = FakeWhisperWorker
  })
})

test('importa un archivo, transcribe (worker mockeado) y exporta TXT', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.setInputFiles('[data-testid="file-input"]', {
    name: 'sample.wav',
    mimeType: 'audio/wav',
    buffer: createSilentWav(1),
  })

  await expect(page.getByTestId('transcript-editor')).toHaveValue('hola mundo de prueba', { timeout: 5000 })

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-txt').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('transcript.txt')
})

test('muestra un error al importar un archivo no soportado', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.setInputFiles('[data-testid="file-input"]', {
    name: 'doc.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('not audio'),
  })

  await expect(page.getByTestId('import-error')).toBeVisible()
})

test('grava desde el micrófono, transcribe (worker mockeado) y exporta SRT', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.getByTestId('record-button').click()
  await expect(page.getByTestId('recording-timer')).toBeVisible()
  await page.waitForTimeout(1200)
  await page.getByTestId('record-button').click()

  await expect(page.getByTestId('transcript-editor')).toHaveValue('hola mundo de prueba', { timeout: 5000 })

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-srt').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('transcript.srt')
})
