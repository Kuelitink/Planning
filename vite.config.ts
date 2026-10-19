import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// `base: './'` : chemins relatifs, l'app fonctionne quel que soit le dossier d'où elle est servie.
// `--mode native` (appli Android) : sans service worker, les fichiers sont dans l'APK.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    react(),
    mode !== 'native' &&
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'Planning',
          short_name: 'Planning',
          description: 'Calendrier, to-do, auto-planification, objectifs, chrono et suivi du cycle.',
          lang: 'fr',
          start_url: './',
          scope: './',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#ffeaf1',
          theme_color: '#ffeaf1',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallback: 'index.html',
        },
      }),
  ],
}));
