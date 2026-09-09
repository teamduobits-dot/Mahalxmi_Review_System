import { useCallback, useEffect, useState } from 'react'
import { Home, LogOut, Settings as SettingsIcon } from 'lucide-react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Login from './Login'
import Dashboard from './Dashboard'
import Detail from './Detail'
import Settings from './Settings'
import { ADMIN_ROUTE } from '../../lib/adminRoute'
import { api } from '../../lib/api'
import { ErrorBox, Spinner } from '../../components/ui'

function AdminShell({ user, onLogout, children }) {
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
            <button onClick={onLogout} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-red-600">
              <LogOut size={14} /> Logout
            </button>
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
  const [authState, setAuthState] = useState({ loading: true, user: null })
  const [authError, setAuthError] = useState('')
  const [settings, setSettings] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [loadingData, setLoadingData] = useState(false)
  const [dataError, setDataError] = useState('')

  const loadData = useCallback(async () => {
    setLoadingData(true)
    setDataError('')
    try {
      const [submissionList, adminSettings] = await Promise.all([
        api.getSubmissions(),
        api.getAdminSettings(),
      ])
      setSubmissions(submissionList)
      setSettings(adminSettings)
    } catch (error) {
      setDataError(error.message)
      throw error
    } finally {
      setLoadingData(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const response = await api.me()
        if (!active) return
        const user = response.authenticated ? response.admin : null
        setAuthState({ loading: false, user })
        if (user) {
          await loadData()
        }
      } catch {
        if (active) setAuthState({ loading: false, user: null })
      }
    })()
    return () => {
      active = false
    }
  }, [loadData])

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
    setAuthState({ loading: false, user: admin })
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
    setAuthState({ loading: false, user: null })
    setSubmissions([])
    setSettings(null)
    setDataError('')
  }

  if (authState.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F3EE]">
        <Spinner size={28} className="text-brand-500" />
      </div>
    )
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

  return (
    <AdminShell user={authState.user} onLogout={logout}>
      {dataError ? (
        <div className="mb-4">
          <ErrorBox>{dataError}</ErrorBox>
        </div>
      ) : null}
      <Routes>
        <Route index element={<Dashboard submissions={submissions} settings={settings} onRefresh={loadData} loading={loadingData} />} />
        <Route path="submission/:id" element={<Detail settings={settings} onUpdated={loadData} />} />
        <Route path="settings" element={<Settings settings={settings} onSaved={(updated) => setSettings(updated)} />} />
        <Route path="*" element={<Navigate to={ADMIN_ROUTE} replace />} />
      </Routes>
    </AdminShell>
  )
}
