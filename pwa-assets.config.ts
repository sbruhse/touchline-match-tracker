import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  images: ['public/icons/touchline.svg'],
  preset: minimal2023Preset,
  manifestIconsEntry: false,
})
