import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { BarChart3, LayoutDashboard, LogOut, Settings as SettingsIcon } from 'lucide-react'
import Login from './Login'
import Dashboard from './Dashboard'
import Detail from './Detail'
import Analytics from './Analytics'
import Settings from './Settings'
import { ADMIN_ROUTE } from '../../lib/adminRoute'
import {
  IS_DEMO,
  fetchSettings,
  fetchSubmissions,
  loginAdmin,
  logoutAdmin,
  onAdminAuthChange,
  saveAdminNotes,
  saveSettings,
  seedDemoIfEmpty,
  updateSubmissionStatus,
} from '../../lib/firebase'
import { Spinner } from '../../components/ui'

function AdminShell({ user, onLogout, children }) {
  const location = useLocation()
  const nav = [
    { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
    { to: '/analytics', label: 'Analytics', icon: <BarChart3 size={17} /> },
    { to: '/settings', label: 'Settings', icon: <SettingsIcon size={17} /> },
  ]
  // Path relative to the admin route prefix.
  const relPath = (location.pathname || '/').replace(ADMIN_ROUTE, '') || '/'
  const isActive = (to) => (to === '/' ? relPath === '/' : relPath.startsWith(to))
  return (
    <div className="flex min-h-screen bg-[#F7F3EE]">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-cocoa-100 bg-white lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-xl shadow-pop">🍔</span>
          <div className="leading-tight">
            <p className="text-sm font-extrabold text-cocoa-900">Mahalaxmi</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-600">Admin Portal</p>
          </div>
        </div>
        <nav className="mt-2 flex-1 space-y-1 px-3">
          {nav.map((n) => {
            const active = isActive(n.to)
            return (
              <a
                key={n.to}
                href={`#${ADMIN_ROUTE}${n.to}`}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${
                  active ? 'bg-brand-50 text-brand-600' : 'text-cocoa-500 hover:bg-cream-100 hover:text-cocoa-800'
                }`}
              >
                {n.icon} {n.label}
              </a>
            )
          })}
        </nav>
        <div className="border-t border-cocoa-100 p-4">
          <div className="flex items-center gap-3 rounded-2xl bg-cream-100/70 p-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-sm font-black text-white">
              {(user?.email || 'A')[0].toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-extrabold text-cocoa-900">{user?.email || 'Admin'}</p>
              <p className="text-[10px] font-semibold text-cocoa-400">Administrator</p>
            </div>
            <button onClick={onLogout} className="text-cocoa-400 transition hover:text-red-600" aria-label="Log out" title="Log out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="min-w-0 flex-1 lg:pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-cocoa-100 bg-white/85 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2.5 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-lg">🍔</span>
              <p className="text-sm font-extrabold text-cocoa-900">Admin Portal</p>
            </div>
            <p className="hidden text-sm font-bold text-cocoa-500 lg:block">
              {nav.find((n) => isActive(n.to))?.label || 'Dashboard'}
            </p>
            {IS_DEMO && (
              <span className="rounded-full bg-gold-100 px-3 py-1 text-[11px] font-black text-gold-700">DEMO MODE · LOCAL DATA</span>
            )}
            <button onClick={onLogout} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-cocoa-500 transition hover:bg-cream-100 hover:text-red-600 lg:hidden">
              <LogOut size={15} /> Logout
            </button>
          </div>
          {/* Mobile nav */}
          <nav className="flex gap-2 overflow-x-auto px-4 pb-2 no-scrollbar lg:hidden">
            {nav.map((n) => {
              const active = isActive(n.to)
              return (
                <a
                  key={n.to}
                  href={`#${ADMIN_ROUTE}${n.to}`}
                  className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                    active ? 'bg-brand-500 text-white' : 'bg-cream-100 text-cocoa-600'
                  }`}
                >
                  {n.icon} {n.label}
                </a>
              )
            })}
          </nav>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}

export default function AdminApp() {
  const [user, setUser] = useState(undefined) // undefined = checking
  const [authError, setAuthError] = useState('')
  const [subs, setSubs] = useState([])
  const [settings, setSettings] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const unsub = onAdminAuthChange(setUser)
    return unsub
  }, [])

  const refresh = useCallback(async () => {
    try {
      seedDemoIfEmpty()
      const [list, s] = await Promise.all([fetchSubmissions(), fetchSettings()])
      setSubs(list)
      setSettings(s)
      setError('')
    } catch (err) {
      console.error(err)
      setError('Could not load submissions. Check your connection and try again.')
    }
  }, [])

  useEffect(() => {
    if (!user) return
    queueMicrotask(refresh)
  }, [user, refresh])

  const handleLogin = async (email, password) => {
    setAuthError('')
    try {
      const loggedIn = await loginAdmin(email, password)
      // Update state directly — storage events don't fire in the same tab.
      if (loggedIn) {
        setUser({ uid: loggedIn.uid, email: loggedIn.email, displayName: loggedIn.displayName })
      }
    } catch (err) {
      setAuthError(err?.message || 'Login failed. Please try again.')
    }
  }

  const handleLogout = async () => {
    await logoutAdmin()
    setUser(null)
  }

  const handleStatus = async (id, status, notes) => {
    await updateSubmissionStatus(id, status, notes)
    await refresh()
  }

  const handleNotes = async (id, notes) => {
    await saveAdminNotes(id, notes)
    await refresh()
  }

  const handleSaveSettings = async (next) => {
    await saveSettings(next)
    await refresh()
  }

  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F3EE]">
        <Spinner className="text-brand-500" size={28} />
      </div>
    )
  }

  if (!user) {
    return <Login onLogin={handleLogin} error={authError} />
  }

  return (
    <AdminShell user={user} onLogout={handleLogout}>
      {error && (
        <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
          <button onClick={refresh} className="ml-3 underline underline-offset-2">Retry</button>
        </div>
      )}
      <AnimatePresence mode="wait">
        <Routes>
          <Route
            index
            element={<Dashboard submissions={subs} onRefresh={refresh} cashbackAmount={settings?.cashbackAmount || 15} />}
          />
          <Route
            path="submission/:id"
            element={
              <Detail
                submissions={subs}
                onStatus={handleStatus}
                onNotes={handleNotes}
                cashbackAmount={settings?.cashbackAmount || 15}
              />
            }
          />
          <Route path="analytics" element={<Analytics submissions={subs} />} />
          <Route path="settings" element={<Settings settings={settings} onSave={handleSaveSettings} />} />
          <Route path="*" element={<Navigate to=".." replace />} />
        </Routes>
      </AnimatePresence>
    </AdminShell>
  )
}
