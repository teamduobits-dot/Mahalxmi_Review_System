import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check, Home, IndianRupee, Search, ShieldCheck, Sparkles, XCircle } from 'lucide-react'
import FloatingFood from '../components/FloatingFood'
import { ErrorBox, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { formatDateTime } from '../lib/format'

const STATUS_VIEW = {
  pending: {
    emoji: '⏳',
    title: 'Under review',
    message: 'Your cashback request is submitted and waiting for verification. Our team is on it!',
    chip: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  approved: {
    emoji: '✅',
    title: 'Approved!',
    message: 'Great news — your review is verified. Your cashback is being processed to your UPI.',
    chip: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  paid: {
    emoji: '🎉',
    title: 'Cashback paid!',
    message: 'All done! The cashback has been sent to your UPI. Check your UPI app and enjoy!',
    chip: 'border-lime-200 bg-lime-50 text-lime-700',
  },
  rejected: {
    emoji: '😕',
    title: 'Not eligible',
    message:
      'This request could not be approved. If you think this is a mistake, please contact the restaurant with your reference ID.',
    chip: 'border-red-200 bg-red-50 text-red-600',
  },
}

function Timeline({ status, createdAt, approvedAt, paidAt, updatedAt }) {
  if (status === 'rejected') {
    return (
      <div className="mt-5 flex items-center gap-3 rounded-[1.6rem] border border-red-100 bg-red-50 p-4 text-left">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-500 text-white sm:h-12 sm:w-12">
          <XCircle size={20} />
        </span>
        <div>
          <p className="text-sm font-extrabold text-red-700 sm:text-base">Request not approved</p>
          <p className="text-xs font-medium text-red-500/90 sm:text-sm">Updated {formatDateTime(updatedAt)}</p>
        </div>
      </div>
    )
  }

  const steps = [
    { key: 'submitted', label: 'Submitted', icon: Check, at: createdAt, done: true },
    { key: 'approved', label: 'Approved', icon: ShieldCheck, at: approvedAt, done: status === 'approved' || status === 'paid' },
    { key: 'paid', label: 'Paid', icon: IndianRupee, at: paidAt, done: status === 'paid' },
  ]
  const activeIndex = steps.findIndex((step) => !step.done)

  return (
    <div className="mt-5">
      <div className="flex items-start">
        {steps.map((step, index) => {
          const Icon = step.icon
          const isActive = index === activeIndex
          const circle = step.done
            ? 'bg-emerald-500 text-white shadow-soft'
            : isActive
              ? 'bg-amber-400 text-white shadow-soft'
              : 'bg-cocoa-100 text-cocoa-300'
          const label = step.done ? 'text-cocoa-900' : isActive ? 'text-amber-600' : 'text-cocoa-300'
          return (
            <div key={step.key} className="flex flex-1 items-start last:flex-none">
              <div className="flex w-16 flex-col items-center sm:w-24">
                <div className="relative">
                  {isActive ? (
                    <motion.span
                      className="absolute inset-0 rounded-full bg-amber-300"
                      animate={{ scale: [1, 1.5], opacity: [0.55, 0] }}
                      transition={{ repeat: Infinity, duration: 1.6, ease: 'easeOut' }}
                    />
                  ) : null}
                  <span className={`relative flex h-10 w-10 items-center justify-center rounded-full sm:h-12 sm:w-12 ${circle}`}>
                    <Icon size={18} />
                  </span>
                </div>
                <p className={`mt-2 text-[10px] font-black uppercase tracking-wide sm:text-xs ${label}`}>{step.label}</p>
                {step.done && step.at ? (
                  <p className="mt-0.5 text-center text-[9px] font-semibold text-cocoa-400 sm:text-[11px]">
                    {formatDateTime(step.at)}
                  </p>
                ) : null}
              </div>
              {index < steps.length - 1 ? (
                <div className={`mt-5 h-1 flex-1 rounded-full sm:mt-6 ${steps[index + 1].done ? 'bg-emerald-400' : 'bg-cocoa-100'}`} />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Status() {
  const [searchParams] = useSearchParams()
  const initialRef = (searchParams.get('ref') || '').trim().toUpperCase()
  const [brand, setBrand] = useState('Mahalaxmi Multi Cuisine')
  const [reference, setReference] = useState(initialRef)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [networkError, setNetworkError] = useState(false)

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  // Brand name only — the status check itself works even if this fails.
  useEffect(() => {
    api
      .getSettings()
      .then((data) => {
        if (data?.businessName) setBrand(data.businessName)
      })
      .catch(() => {})
  }, [])

  const checkStatus = useCallback(async (rawRef) => {
    const cleaned = (rawRef || '').trim().toUpperCase()
    if (!cleaned) {
      setError('Please enter your reference ID first.')
      setResult(null)
      setNetworkError(false)
      return
    }
    setBusy(true)
    setError('')
    setResult(null)
    setNetworkError(false)
    try {
      const data = await api.getSubmissionStatus(cleaned)
      setResult(data)
    } catch (fetchError) {
      setNetworkError(Boolean(fetchError?.isNetwork))
      setError(fetchError?.message || 'Unable to check the status right now.')
    } finally {
      setBusy(false)
    }
  }, [])

  // Auto-check when arriving from the success page with ?ref=... (deferred one
  // tick so the state updates happen in a callback, not in the effect body)
  useEffect(() => {
    if (!initialRef) return undefined
    const timer = window.setTimeout(() => checkStatus(initialRef), 0)
    return () => window.clearTimeout(timer)
  }, [initialRef, checkStatus])

  const view = result ? STATUS_VIEW[result.status] || STATUS_VIEW.pending : null

  return (
    <div className="relative min-h-screen overflow-hidden surface-warm">
      <div aria-hidden className="pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full bg-brand-200/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-24 top-16 h-80 w-80 rounded-full bg-gold-200/30 blur-3xl" />
      <FloatingFood count={5} opacity={0.14} />

      <main className="relative z-10 mx-auto w-full max-w-2xl px-4 pb-16 pt-safe sm:px-6 lg:max-w-3xl">
        <div className="pt-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white/85 px-4 py-2.5 text-xs font-bold text-cocoa-700 shadow-soft backdrop-blur-sm transition hover:border-brand-300 hover:text-brand-600 sm:text-sm"
          >
            <ArrowLeft size={15} /> Back to home
          </Link>
        </div>

        <section className="mt-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-4 py-2 text-xs font-extrabold text-cocoa-900 shadow-soft backdrop-blur-sm sm:text-sm"
          >
            <Sparkles size={14} className="text-brand-500" />
            {brand}
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.06 }}
            className="mt-4 font-display text-3xl font-black tracking-tight text-cocoa-950 sm:text-4xl"
          >
            Track your <span className="text-gradient-brand">cashback</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.12 }}
            className="mx-auto mt-2 max-w-md text-sm font-medium leading-7 text-cocoa-600 sm:text-base sm:leading-8"
          >
            Enter the reference ID you received after submitting your review proof.
          </motion.p>
        </section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.18 }}
          className="mt-6 rounded-[2rem] border border-white/90 bg-white/90 p-5 shadow-card backdrop-blur-sm sm:p-6"
        >
          <label className="text-[11px] font-black uppercase tracking-wider text-cocoa-500 sm:text-xs">
            Reference ID
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value.toUpperCase().replace(/\s/g, ''))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !busy) checkStatus(reference)
              }}
              placeholder="MMC-2026-000123"
              className="w-full flex-1 rounded-2xl border-2 border-cocoa-200/80 bg-white px-4 py-3.5 text-center font-mono text-sm font-bold tracking-[0.14em] text-cocoa-900 outline-none transition placeholder:text-cocoa-300 focus:border-brand-400 focus:ring-4 focus:ring-brand-100 sm:py-4 sm:text-base"
            />
            <button
              type="button"
              onClick={() => checkStatus(reference)}
              disabled={busy}
              className="btn-shine flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-brand-400 to-brand-600 px-6 py-3.5 text-sm font-extrabold text-white shadow-pop transition hover:brightness-105 disabled:opacity-70 sm:py-4 sm:text-base"
            >
              {busy ? <Spinner size={17} /> : <Search size={17} />}
              {busy ? 'Checking…' : 'Check status'}
            </button>
          </div>
          <p className="mt-2.5 text-[11px] font-medium leading-5 text-cocoa-400 sm:text-xs">
            You can find the reference ID on the success screen right after submitting the form.
          </p>

          <AnimatePresence>
            {error ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mt-4"
              >
                <ErrorBox>
                  {networkError
                    ? 'Cannot reach the server right now. Please check your connection and try again.'
                    : error}
                </ErrorBox>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.section>

        <AnimatePresence mode="wait">
          {result && view ? (
            <motion.section
              key={result.reference + result.status}
              initial={{ opacity: 0, y: 22, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="mt-5 rounded-[2rem] border border-white/90 bg-white/90 p-5 text-center shadow-card backdrop-blur-sm sm:p-6"
            >
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 240, damping: 14, delay: 0.08 }}
                className="text-6xl sm:text-7xl"
              >
                <motion.span
                  className="inline-block"
                  animate={{ y: [0, -6, 0] }}
                  transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
                >
                  {view.emoji}
                </motion.span>
              </motion.div>

              <span className={`mt-4 inline-flex items-center rounded-full border px-4 py-1.5 text-xs font-black uppercase tracking-wider sm:text-sm ${view.chip}`}>
                {view.title}
              </span>
              <p className="mx-auto mt-3 max-w-md text-sm font-medium leading-7 text-cocoa-600 sm:text-base sm:leading-8">
                {view.message}
              </p>

              <div className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-cream-50 px-4 py-2.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-cocoa-400 sm:text-xs">Ref</span>
                <span className="font-mono text-sm font-extrabold tracking-wide text-brand-600 sm:text-base">
                  {result.reference}
                </span>
              </div>

              <Timeline
                status={result.status}
                createdAt={result.createdAt}
                approvedAt={result.approvedAt}
                paidAt={result.paidAt}
                updatedAt={result.updatedAt}
              />
            </motion.section>
          ) : null}
        </AnimatePresence>

        <div className="mt-8 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-bold text-cocoa-500 transition hover:text-brand-600 sm:text-sm"
          >
            <Home size={14} /> Go back to the cashback form
          </Link>
        </div>
      </main>
    </div>
  )
}
