import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Foxtail',
        short_name: 'Foxtail',
        description: 'A cozy houseplant collecting and world-transforming game.',
        theme_color: '#1b3a34',
        background_color: '#0d2420',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/foxtail-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/foxtail-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/foxtail-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
    }),
  ],
  build: {
    target: 'es2020',
  },
});
