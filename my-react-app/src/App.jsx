import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import FeedbackApp from './pages/FeedbackApp'

// The admin portal is code-split so it never weighs down the customer page,
// and its route is intentionally non-obvious + configurable via
// VITE_ADMIN_ROUTE. The route itself is NOT security — real protection comes
// from Firebase Authentication + the admins whitelist + security rules.
const AdminApp = lazy(() => import('./pages/admin/AdminApp'))

const ADMIN_ROUTE = (import.meta.env.VITE_ADMIN_ROUTE || '/admin-portal-private').replace(/^\/?/, '/')

function AdminFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F3EE]">
      <p className="text-sm font-bold text-cocoa-400">Loading admin portal…</p>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<FeedbackApp />} />
        <Route
          path={ADMIN_ROUTE}
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
