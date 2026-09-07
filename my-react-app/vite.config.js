import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    // Accept requests from any host so the app works behind preview proxies.
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 4173,
  },
})
