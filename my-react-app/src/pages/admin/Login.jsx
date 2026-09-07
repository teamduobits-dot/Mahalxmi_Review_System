import { useState } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { IS_DEMO } from '../../lib/firebase'
import { Spinner } from '../../components/ui'

export default function Login({ onLogin, error }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (busy || !email || !password) return
    setBusy(true)
    await onLogin(email.trim(), password)
    setBusy(false)
  }

  return (
    <div className="surface-dark relative flex min-h-screen items-center justify-center overflow-hidden px-5">
      <div aria-hidden className="pointer-events-none absolute -left-28 top-16 h-96 w-96 rounded-full bg-brand-500/15 blur-3xl animate-drift" />
      <div aria-hidden className="pointer-events-none absolute -right-28 bottom-16 h-96 w-96 rounded-full bg-gold-400/10 blur-3xl animate-drift" />

      <motion.div
        initial={{ opacity: 0, y: 26, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-center gap-3">
          <motion.span
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-2xl shadow-pop"
            animate={{ rotate: [0, -6, 6, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            🍔
          </motion.span>
          <div>
            <h1 className="font-display text-xl font-extrabold tracking-tight text-cream-50">Admin Portal</h1>
            <p className="text-xs font-semibold text-cream-200/60">Mahalaxmi Multi Cuisine · Feedback & Cashback</p>
          </div>
        </div>

        {IS_DEMO && (
          <div className="mt-5 rounded-2xl border border-gold-300/25 bg-gold-400/10 px-4 py-3 text-xs font-semibold leading-relaxed text-gold-200">
            <span className="font-black text-gold-300">DEMO MODE</span> — log in with{' '}
            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-cream-50">admin@demo.mahalaxmi.in</span> /{' '}
            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-cream-50">mahalaxmi123</span>
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="text-[11px] font-bold uppercase tracking-wider text-cream-200/70">Email</label>
            <div className="relative mt-1.5">
              <Mail size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cream-200/40" />
              <input
                id="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full rounded-2xl border border-white/10 bg-white/[0.07] py-3.5 pl-11 pr-4 text-sm font-semibold text-cream-50 outline-none transition placeholder:text-cream-200/30 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/20"
              />
            </div>
          </div>
          <div>
            <label htmlFor="password" className="text-[11px] font-bold uppercase tracking-wider text-cream-200/70">Password</label>
            <div className="relative mt-1.5">
              <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cream-200/40" />
              <input
                id="password"
                type={show ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-2xl border border-white/10 bg-white/[0.07] py-3.5 pl-11 pr-12 text-sm font-semibold text-cream-50 outline-none transition placeholder:text-cream-200/30 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/20"
              />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-4 top-1/2 -translate-y-1/2 text-cream-200/40 transition hover:text-cream-100" aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-300" role="alert">
              {error}
            </motion.p>
          )}

          <motion.button
            type="submit"
            whileTap={{ scale: 0.97 }}
            disabled={busy}
            className="btn-shine flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-brand-400 to-brand-600 px-6 py-4 text-sm font-extrabold text-white shadow-pop transition hover:brightness-105 disabled:opacity-70"
          >
            {busy ? <Spinner size={17} /> : <>🔐 Sign in to Admin</>}
          </motion.button>
        </form>

        <p className="mt-6 text-center text-[11px] font-medium text-cream-200/40">
          Protected area · authorised administrators only
        </p>
      </motion.div>
    </div>
  )
}
