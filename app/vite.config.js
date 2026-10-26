import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
