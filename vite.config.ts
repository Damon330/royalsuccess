import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'Royal Success',
        short_name: 'RoyalSuccess',
        description: 'Phone inventory and field sales tracking',
        theme_color: '#0F4C35',
        background_color: '#0F4C35',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable any'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable any'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MiB — @react-pdf/renderer increases bundle size
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Cache database REST responses as a short-lived offline fallback.
            // Auth endpoints (/auth/v1/*) are intentionally excluded — JWT tokens
            // must NEVER be served from a cache (stale tokens cause HTTP 400 on
            // the next refresh attempt and sign users out across all tabs).
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/rest\/v1\//i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-rest-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
