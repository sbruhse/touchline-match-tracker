import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { getPwaCacheNamespace } from './src/app/config/pwaResources'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: './',
        name: 'Touchline — Match Tracker',
        short_name: 'Touchline',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f3f5f1',
        theme_color: '#f3f5f1',
        lang: 'en',
        icons: [
          {
            src: 'icons/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,ico,png,svg,webmanifest,woff2,txt,json}'],
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
        navigateFallback: 'index.html',
      },
      integration: {
        configureOptions: (viteConfig, options) => {
          options.scope = viteConfig.base
          options.workbox = {
            ...options.workbox,
            cacheId: getPwaCacheNamespace(viteConfig.base),
          }
        },
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    manifest: 'pwa-assets.json',
  },
  test: {
    environment: 'jsdom',
    clearMocks: true,
  },
})
