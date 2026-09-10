import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// ---------------------------------------------------------------------------
// Ports (fixed, canonical):
//   frontend dev  → 5173   (backend dev API → 8000, proxied below)
//   frontend preview → 4173
// `strictPort: true` makes Vite FAIL LOUDLY instead of silently shifting to
// 5174/5175 when the port is busy — a silent shift breaks the /api proxy,
// every doc, and the preview URL. Kill whatever holds the port instead.
//
// VITE_BACKEND_URL (in my-react-app/.env, dev-server only) overrides where the
// /api and /uploads proxy points. Default: http://127.0.0.1:8000.
// ---------------------------------------------------------------------------

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

  return {
    base: '/',
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      allowedHosts: true,
      headers: {
        // Local approximation of the production headers (backend + Firebase
        // Hosting) so CSP problems show up in dev instead of after deploying.
        'Content-Security-Policy':
          "default-src 'self'; img-src 'self' data: blob: https:; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src https://fonts.gstatic.com; script-src 'self'; " +
          "connect-src 'self' ws://localhost:5173 http://127.0.0.1:8000 http://localhost:8000 https://oauth2.googleapis.com; " +
          "frame-src https://accounts.google.com",
      },
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
        },
        '/uploads': {
          target: backend,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: true,
      port: 4173,
      strictPort: true,
    },
  }
})
