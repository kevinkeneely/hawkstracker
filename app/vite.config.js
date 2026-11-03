import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Pin the CSS target so Vite's minifier doesn't rewrite legacy media
    // queries like `@media (max-width: 640px)` into the Media Queries Level 4
    // range syntax `@media (width<=640px)`, which is only supported on
    // Safari 16.4+ (Mar 2023) and would silently break mobile layouts for
    // anyone on an older iPhone. Keep this at the oldest iOS Safari we're
    // willing to support; raise it later when sunsetting older devices.
    cssTarget: ['safari15'],
  },
  server: {
    // Dev-time proxy: forward /nba-headshots/:id.png to cdn.nba.com
    // (production uses the equivalent rewrite in vercel.json)
    proxy: {
      '/nba-headshots': {
        target: 'https://cdn.nba.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nba-headshots/, '/headshots/nba/latest/1040x760'),
      },
    },
  },
})
