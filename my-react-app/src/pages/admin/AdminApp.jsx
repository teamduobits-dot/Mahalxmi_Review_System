import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Home, LogOut, RefreshCw, Settings as SettingsIcon, WifiOff } from 'lucide-react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Login from './Login'
import Dashboard from './Dashboard'
import Detail from './Detail'
import Settings from './Settings'
import { ADMIN_ROUTE } from '../../lib/adminRoute'
import { api, clearToken } from '../../lib/api'
import { Spinner } from '../../components/ui'

// Pure probe of /api/auth/me — no setState, so it can be awaited from any
// context. Resolves to exactly one of:
//   { user: admin | null }   server reachable (user null = not logged in)
//   { serverError: string }  server unreachable (network error)
async function probeAuth() {
  try {
    const response = await api.me()
    return { user: response.authenticated ? response.admin : null }
  } catch (error) {
    if (error?.isNetwork) return { serverError: error.message }
    return { user: null }
  }
}

function ConnectionBadge({ offline }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${offline ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}
      title={offline ? 'Last data refresh failed — retrying automatically' : 'Connected to backend'}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${offline ? 'bg-red-500' : 'bg-emerald-500'}`} />
      {offline ? 'Offline' : 'Online'}
    </span>
  )
}

function ServerOfflineScreen({ onRetry }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F3EE] px-5">
      <div className="w-full max-w-md rounded-[2rem] border border-cocoa-100 bg-white p-8 text-center shadow-soft">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-red-50 text-red-500">
          <WifiOff size={30} />
        </div>
        <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-cocoa-950">Cannot reach the server</h1>
        <p className="mt-2 text-sm font-medium leading-6 text-cocoa-500">
          The admin panel could not connect to the backend. If you are running locally, make sure the API is up
          (<span className="font-mono text-cocoa-700">uvicorn main:app --port 8000</span>) and that you are opening
          the Vite dev URL on port <span className="font-mono text-cocoa-700">5173</span>, not port 8000.
        </p>
        <p className="mt-3 text-xs font-semibold text-cocoa-400">Retrying automatically every 5 seconds…</p>
        <button
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-cocoa-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-cocoa-800"
        >
          <RefreshCw size={15} /> Retry now
        </button>
      </div>
    </div>
  )
}

function PollBanner({ message, isSession, onSignInAgain }) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <AlertTriangle size={16} className="shrink-0 text-amber-600" />
        {message}
      </p>
      {isSession ? (
        <button onClick={onSignInAgain} className="shrink-0 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-amber-700">
          Sign in again
        </button>
      ) : (
        <p className="shrink-0 text-xs font-semibold text-amber-700">You stay logged in — retrying automatically.</p>
      )}
    </div>
  )
}

function AdminShell({ user, onLogout, offline, children }) {
  const location = useLocation()
  const nav = [
    { to: '/admin', label: 'Dashboard', icon: <Home size={16} /> },
    { to: '/admin/settings', label: 'Settings', icon: <SettingsIcon size={16} /> },
  ]

  return (
    <div className="flex min-h-screen bg-[#F7F3EE]">
      <aside className="hidden w-64 shrink-0 border-r border-cocoa-100 bg-white lg:flex lg:flex-col">
        <div className="px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-xl shadow-pop">🍔</span>
            <div>
              <p className="text-sm font-extrabold text-cocoa-900">Mahalaxmi Admin</p>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand-600">Cashback dashboard</p>
            </div>
          </div>
        </div>
        <nav className="space-y-1 px-3">
          {nav.map((item) => {
            const active = location.pathname === item.to
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${active ? 'bg-brand-50 text-brand-600' : 'text-cocoa-500 hover:bg-cream-100 hover:text-cocoa-800'}`}
              >
                {item.icon} {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="mt-auto border-t border-cocoa-100 p-4">
          <div className="rounded-2xl bg-cream-100/70 p-3">
            <p className="truncate text-sm font-extrabold text-cocoa-900">{user?.email}</p>
            <div className="mt-2">
              <ConnectionBadge offline={offline} />
            </div>
            <button onClick={onLogout} className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-red-600">
              <LogOut size={14} /> Logout
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-cocoa-100 bg-white/85 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:hidden">
            <p className="font-extrabold text-cocoa-900">Mahalaxmi Admin</p>
            <div className="flex items-center gap-2">
              <ConnectionBadge offline={offline} />
              <button onClick={onLogout} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-red-600">
                <LogOut size={14} /> Logout
              </button>
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto px-4 pb-3 pt-0 no-scrollbar lg:hidden">
            {nav.map((item) => {
              const active = location.pathname === item.to
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${active ? 'bg-brand-500 text-white' : 'bg-cream-100 text-cocoa-600'}`}
                >
                  {item.icon} {item.label}
                </Link>
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
  const [authState, setAuthState] = useState({ loading: true, user: null, serverError: '' })
  const [authError, setAuthError] = useState('')
  const [settings, setSettings] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [loadingData, setLoadingData] = useState(false)
  const [pollError, setPollError] = useState({ message: '', status: 0 })

  const loadData = useCallback(async () => {
    setLoadingData(true)
    try {
      const [submissionList, adminSettings] = await Promise.all([
        api.getSubmissions(),
        api.getAdminSettings(),
      ])
      setSubmissions(submissionList)
      setSettings(adminSettings)
      setPollError({ message: '', status: 0 })
    } catch (error) {
      // Keep the user logged in — a failed refresh is not a logout. The banner
      // explains the problem and the next poll (or manual refresh) retries.
      setPollError({ message: error.message || 'Unable to refresh data.', status: error.status || 0 })
      throw error
    } finally {
      setLoadingData(false)
    }
  }, [])

  // Initial auth probe on mount. "Backend unreachable" (network error) is
  // tracked separately from "not logged in" — a dead server must not look
  // like a bad login, and a stale token must not look like an outage.
  useEffect(() => {
    let active = true
    ;(async () => {
      const result = await probeAuth()
      if (!active) return
      if (!result.user && !result.serverError) clearToken() // stale/invalid token
      setAuthState({
        loading: false,
        user: result.user || null,
        serverError: result.serverError || '',
      })
      if (result.user) {
        // A failed first data load must not boot the user out; the banner shows it.
        loadData().catch(() => {})
      }
    })()
    return () => {
      active = false
    }
  }, [loadData])

  // While the backend is unreachable, keep retrying in the background.
  useEffect(() => {
    if (!authState.serverError) return undefined
    const timer = setInterval(() => {
      ;(async () => {
        const result = await probeAuth()
        if (!result.user && !result.serverError) clearToken()
        setAuthState({
          loading: false,
          user: result.user || null,
          serverError: result.serverError || '',
        })
        if (result.user) loadData().catch(() => {})
      })()
    }, 5000)
    return () => clearInterval(timer)
  }, [authState.serverError, loadData])

  const retryNow = () => {
    setAuthState((current) => ({ ...current, loading: true, serverError: '' }))
    ;(async () => {
      const result = await probeAuth()
      if (!result.user && !result.serverError) clearToken()
      setAuthState({
        loading: false,
        user: result.user || null,
        serverError: result.serverError || '',
      })
      if (result.user) loadData().catch(() => {})
    })()
  }

  // Data polling while logged in — failures only update the banner.
  useEffect(() => {
    if (!authState.user) return undefined
    const timer = setInterval(() => {
      loadData().catch(() => {})
    }, 15000)
    return () => clearInterval(timer)
  }, [authState.user, loadData])

  const finishLogin = async (loginResponse) => {
    const admin = loginResponse?.admin
    if (!admin?.email) {
      throw new Error('Admin login failed. Please try again.')
    }
    setAuthState({ loading: false, user: admin, serverError: '' })
    await loadData()
  }

  const login = async (email, password) => {
    setAuthError('')
    try {
      const response = await api.login(email, password)
      await finishLogin(response)
    } catch (error) {
      setAuthError(error.message)
      throw error
    }
  }

  const loginWithGoogle = async (credential) => {
    setAuthError('')
    try {
      const response = await api.loginWithGoogle(credential)
      await finishLogin(response)
    } catch (error) {
      setAuthError(error.message)
      throw error
    }
  }

  const logout = async () => {
    await api.logout()
    setAuthState({ loading: false, user: null, serverError: '' })
    setSubmissions([])
    setSettings(null)
    setPollError({ message: '', status: 0 })
  }

  if (authState.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F3EE]">
        <Spinner size={28} className="text-brand-500" />
      </div>
    )
  }

  if (authState.serverError) {
    return <ServerOfflineScreen onRetry={retryNow} />
  }

  if (!authState.user) {
    return (
      <Login
        defaultEmail="team.duobits@gmail.com"
        onLogin={login}
        onGoogleLogin={loginWithGoogle}
        error={authError}
      />
    )
  }

  const sessionExpired = pollError.status === 401

  return (
    <AdminShell user={authState.user} onLogout={logout} offline={Boolean(pollError.message)}>
      {pollError.message ? (
        <PollBanner
          message={
            sessionExpired
              ? 'Your session is no longer valid (the server may have restarted). Please sign in again.'
              : `Could not refresh data: ${pollError.message}`
          }
          isSession={sessionExpired}
          onSignInAgain={logout}
        />
      ) : null}
      <Routes>
        <Route index element={<Dashboard submissions={submissions} settings={settings} onRefresh={() => loadData().catch(() => {})} loading={loadingData} />} />
        <Route path="submission/:id" element={<Detail settings={settings} onUpdated={() => loadData().catch(() => {})} />} />
        <Route path="settings" element={<Settings settings={settings} onSaved={(updated) => setSettings(updated)} />} />
        <Route path="*" element={<Navigate to={ADMIN_ROUTE} replace />} />
      </Routes>
    </AdminShell>
  )
}
