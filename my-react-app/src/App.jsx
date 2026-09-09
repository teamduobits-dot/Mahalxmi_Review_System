import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import CustomerForm from './pages/CustomerForm'
import { ADMIN_ROUTE } from './lib/adminRoute'

const AdminApp = lazy(() => import('./pages/admin/AdminApp'))

function AdminFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F3EE]">
      <p className="text-sm font-bold text-cocoa-500">Opening admin dashboard...</p>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<CustomerForm />} />
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
