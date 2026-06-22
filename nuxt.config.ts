export default defineNuxtConfig({
  compatibilityDate: '2026-06-22',
  modules: ['@nuxtjs/tailwindcss', '@vite-pwa/nuxt'],
  devtools: { enabled: true },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Local Recorder',
      short_name: 'LocalRecorder',
      description: 'Grabación, transcripción y exportación 100% local en el navegador',
      theme_color: '#1d4ed8',
      background_color: '#ffffff',
      display: 'standalone',
      icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,ico}'],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/huggingface\.co\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'whisper-models',
            cacheableResponse: { statuses: [0, 200] },
            expiration: { maxEntries: 20, maxAgeSeconds: 31536000 },
          },
        },
      ],
    },
  },
})
