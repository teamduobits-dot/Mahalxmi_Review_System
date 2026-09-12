import { lazy, Suspense, useEffect, useRef } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import CustomerForm from './pages/CustomerForm'
import Success from './pages/Success'
import Status from './pages/Status'
import { ADMIN_ROUTE } from './lib/adminRoute'
import { API_BASE } from './lib/api'

const AdminApp = lazy(() => import('./pages/admin/AdminApp'))

function AdminFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F3EE]">
      <p className="text-sm font-bold text-cocoa-500">Opening admin dashboard...</p>
    </div>
  )
}

export default function App() {
  // Background wake-up for Render free tier: fire-and-forget GET /health.
  // No blocking, no polling loop — at most one immediate request plus one
  // delayed retry. Never shows UI, never disables the form.
  // Spec: GET https://mahalxmi-api.onrender.com/health cache:no-store
  const wakeRef = useRef(false)
  useEffect(() => {
    if (wakeRef.current) return
    wakeRef.current = true

    let retryTimer = null

    const wake = async (isRetry = false) => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      try {
        const res = await fetch(`${API_BASE}/health`, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'omit',
          signal: controller.signal,
        })
        // Any 2xx with JSON is considered awake; failure triggers at most one retry.
        if (!res.ok) throw new Error('health not ok')
        const ct = res.headers.get('content-type') || ''
        if (!ct.includes('application/json')) throw new Error('not json')
        await res.json().catch(() => null)
      } catch {
        // Single retry only, fire-and-forget as well.
        if (!isRetry) {
          retryTimer = setTimeout(() => wake(true), 4000)
        }
      } finally {
        clearTimeout(timeout)
      }
    }

    wake()
    return () => {
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [])

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<CustomerForm />} />
        <Route path="/success" element={<Success />} />
        <Route path="/status" element={<Status />} />
        <Route
          path={`${ADMIN_ROUTE}/*`}
          element={
            <Suspense fallback={<AdminFallback />}>
              <AdminApp />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
