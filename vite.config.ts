import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  clearScreen: false,
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    VitePWA({
      // Mode « prompt » : la mise à jour n'est appliquée qu'après action de l'utilisateur.
      registerType: 'prompt',
      manifest: {
        name: 'Invintory',
        short_name: 'Invintory',
        description: 'Gestion de cave à vin',
        lang: 'fr',
        display: 'standalone',
        start_url: '/',
        // Valeurs de tokens.css (--brand et --surface, thème clair) : un manifest ne lit pas les variables CSS.
        theme_color: '#5f1e45',
        background_color: '#f0e9ec',
        icons: [],
      },
      workbox: {
        // Précache des polices pour le hors-ligne (README du design system).
        globPatterns: ['**/*.{js,css,html,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['app/**/*.test.{ts,tsx}'],
  },
})
