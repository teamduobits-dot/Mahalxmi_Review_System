import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, Mail } from 'lucide-react'
import { Spinner } from '../../components/ui'
import { API_BASE } from '../../lib/api'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google)

    const existing = document.querySelector('script[data-google-signin="true"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google))
      existing.addEventListener('error', () => reject(new Error('Could not load Google sign-in.')))
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.googleSignin = 'true'
    script.onload = () => resolve(window.google)
    script.onerror = () => reject(new Error('Could not load Google sign-in.'))
    document.head.appendChild(script)
  })
}

export default function Login({ onLogin, onGoogleLogin, error }) {
  // The admin email is never pre-filled and never shown — the login form must
  // not reveal which account is allowed to sign in.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [googleError, setGoogleError] = useState('')
  const [googleReady, setGoogleReady] = useState(false)
  const googleButtonRef = useRef(null)

  useEffect(() => {
    let active = true
    if (!GOOGLE_CLIENT_ID || !googleButtonRef.current) return undefined

    loadGoogleScript()
      .then((google) => {
        if (!active || !googleButtonRef.current) return
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async ({ credential }) => {
            if (!credential || busy) return
            setBusy(true)
            setGoogleError('')
            try {
              await onGoogleLogin?.(credential)
            } catch (loginError) {
              setGoogleError(loginError?.message || 'Google sign-in failed.')
            } finally {
              setBusy(false)
            }
          },
        })
        googleButtonRef.current.innerHTML = ''
        google.accounts.id.renderButton(googleButtonRef.current, {
          theme: 'outline',
          size: 'large',
          width: 320,
          text: 'continue_with',
          shape: 'pill',
        })
        setGoogleReady(true)
      })
      .catch((loadError) => {
        if (active) setGoogleError(loadError.message)
      })

    return () => {
      active = false
    }
  }, [busy, onGoogleLogin])

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    if (!email.trim() || !password) {
      return
    }
    setBusy(true)
    try {
      await onLogin(email.trim(), password)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="surface-dark relative flex min-h-screen items-center justify-center overflow-hidden px-5">
      <div aria-hidden className="pointer-events-none absolute -left-28 top-16 h-96 w-96 rounded-full bg-brand-500/15 blur-3xl animate-drift" />
      <div aria-hidden className="pointer-events-none absolute -right-28 bottom-16 h-96 w-96 rounded-full bg-gold-400/10 blur-3xl animate-drift" />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-2xl shadow-pop">🍔</span>
          <div>
            <h1 className="font-display text-xl font-extrabold tracking-tight text-cream-50">Admin login</h1>
            <p className="text-xs font-semibold text-cream-200/60">Only the registered admin account is allowed</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
          <p className="text-[11px] font-black uppercase tracking-wider text-cream-200/60">Google Sign-In</p>
          {GOOGLE_CLIENT_ID ? (
            <>
              <div className="mt-3 flex justify-center" ref={googleButtonRef} />
              {!googleReady && !googleError ? <p className="mt-3 text-center text-xs font-medium text-cream-200/50">Loading Google sign-in...</p> : null}
            </>
          ) : (
            <p className="mt-3 text-xs font-medium leading-relaxed text-cream-200/60">
              Google login button is added, but it needs <span className="font-mono text-cream-50">VITE_GOOGLE_CLIENT_ID</span> to be set before it can work.
            </p>
          )}
          {googleError ? <p className="mt-3 text-xs font-semibold text-red-300">{googleError}</p> : null}
        </div>

        <div className="my-5 flex items-center gap-3 text-cream-200/40">
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-[11px] font-black uppercase tracking-wider">or use password</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-cream-200/70">Email</label>
            <div className="relative mt-1.5">
              <Mail size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cream-200/35" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                placeholder="Enter admin email"
                className="w-full rounded-2xl border border-white/10 bg-white/[0.07] py-3.5 pl-11 pr-4 text-sm font-semibold text-cream-50 outline-none transition placeholder:text-cream-200/30 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/20"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-cream-200/70">Password</label>
            <div className="relative mt-1.5">
              <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cream-200/35" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Enter admin password"
                className="w-full rounded-2xl border border-white/10 bg-white/[0.07] py-3.5 pl-11 pr-4 text-sm font-semibold text-cream-50 outline-none transition placeholder:text-cream-200/30 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/20"
              />
            </div>
          </div>

          {error ? <p className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-300">{error}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="btn-shine flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-brand-400 to-brand-600 px-6 py-4 text-sm font-extrabold text-white shadow-pop transition hover:brightness-105 disabled:opacity-70"
          >
            {busy ? <Spinner size={17} /> : 'Sign in to admin'}
          </button>
        </form>

        <p className="mt-5 text-center text-[10px] font-semibold leading-4 text-cream-200/40">
          Login requests go to:{' '}
          <span className="font-mono text-cream-200/60">
            {API_BASE ? `${API_BASE}/api` : 'same origin (/api — Vite proxy → port 8000)'}
          </span>
          {error ? ' If login fails here but the API works in Swagger/docs, the page you are on is not talking to that backend.' : null}
        </p>
      </motion.div>
    </div>
  )
}
