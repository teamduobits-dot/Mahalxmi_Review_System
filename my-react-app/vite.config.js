import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/Mahalxmi_Review_System/',

  plugins: [react(), tailwindcss()],

  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },

  preview: {
    host: true,
    port: 4173,
  },
})