import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, CheckCircle2, Home, IndianRupee, Search, ShieldCheck, Sparkles } from 'lucide-react'
import FloatingFood from '../components/FloatingFood'
import { CopyButton } from '../components/ui'

// Fresh submission progress: submitted is done, review is the active step,
// paid is still ahead. Mirrors the real backend state machine.
const TRACK_STEPS = [
  { key: 'submitted', label: 'Submitted', icon: Check, state: 'done' },
  { key: 'review', label: 'Under review', icon: ShieldCheck, state: 'active' },
  { key: 'paid', label: 'Cashback paid', icon: IndianRupee, state: 'next' },
]

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
}
const rise = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
}

export default function Success() {
  const location = useLocation()
  const navigate = useNavigate()
  const reference = location.state?.reference || ''
  const note = location.state?.note || ''
  const businessName = location.state?.businessName || 'Mahalaxmi Multi Cuisine'

  // This page only makes sense right after a submission (it needs the new
  // reference ID). Landing here without one → send the visitor home.
  useEffect(() => {
    if (!reference) navigate('/', { replace: true })
  }, [reference, navigate])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  if (!reference) return null

  return (
    <div className="relative min-h-screen overflow-hidden surface-warm">
      <div aria-hidden className="pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full bg-brand-200/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-24 top-16 h-80 w-80 rounded-full bg-gold-200/30 blur-3xl" />
      <FloatingFood count={6} opacity={0.16} />

      <motion.main
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-4 py-10 text-center sm:px-6 lg:max-w-3xl"
      >
        <motion.div
          variants={rise}
          className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-4 py-2 text-xs font-extrabold text-cocoa-900 shadow-soft backdrop-blur-sm sm:text-sm"
        >
          <Sparkles size={14} className="text-brand-500" />
          {businessName}
        </motion.div>

        {/* Animated success emblem */}
        <motion.div variants={rise} className="relative mt-6 h-28 w-28 sm:h-32 sm:w-32">
          <motion.div
            className="absolute inset-0 rounded-full bg-emerald-200"
            animate={{ scale: [1, 1.18, 1], opacity: [0.65, 0.25, 0.65] }}
            transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
          />
          <motion.div
            initial={{ scale: 0.4, opacity: 0, rotate: -24 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 15, delay: 0.2 }}
            className="absolute inset-2 flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-2xl"
          >
            <CheckCircle2 size={52} />
          </motion.div>
          <motion.span
            className="absolute -right-1 top-1 text-gold-500"
            animate={{ scale: [1, 1.3, 1], opacity: [0.95, 0.5, 0.95], rotate: [0, 16, 0] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
          >
            <Sparkles size={20} />
          </motion.span>
          <motion.span
            className="absolute -left-2 bottom-2 text-brand-400"
            animate={{ scale: [1, 1.25, 1], opacity: [0.9, 0.45, 0.9], rotate: [0, -14, 0] }}
            transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut', delay: 0.4 }}
          >
            <Sparkles size={16} />
          </motion.span>
        </motion.div>

        <motion.h1
          variants={rise}
          className="mt-6 font-display text-3xl font-black leading-tight tracking-tight text-cocoa-950 sm:text-5xl"
        >
          Your cashback is <span className="text-gradient-brand">on its way!</span> 🎉
        </motion.h1>
        <motion.p
          variants={rise}
          className="mx-auto mt-3 max-w-md text-sm font-medium leading-7 text-cocoa-600 sm:text-base sm:leading-8 lg:max-w-xl lg:text-lg"
        >
          Thank you! Your review proof has been submitted successfully. Our team will verify it and
          send your cashback straight to your UPI — sit back and relax.
        </motion.p>

        {/* Cashback delivery run */}
        <motion.div
          variants={rise}
          className="mt-6 w-full rounded-[1.8rem] border border-cocoa-100 bg-white/85 p-4 shadow-soft sm:p-5"
        >
          <div className="relative h-16 overflow-hidden rounded-full border-2 border-dashed border-brand-200 bg-cream-50 sm:h-[4.5rem]">
            <motion.div
              className="absolute top-1/2 flex -translate-y-1/2 items-center gap-1 text-3xl sm:text-4xl"
              animate={{ left: ['5%', '68%'] }}
              transition={{ repeat: Infinity, repeatType: 'reverse', duration: 3.4, ease: 'easeInOut' }}
            >
              <span>🛵</span>
              <motion.span
                className="text-2xl sm:text-3xl"
                animate={{ y: [0, -5, 0], rotate: [0, -10, 0] }}
                transition={{ repeat: Infinity, duration: 1, ease: 'easeInOut' }}
              >
                💸
              </motion.span>
            </motion.div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-cocoa-400 sm:text-xs">
            <span>Restaurant</span>
            <span className="text-brand-600">Cashback delivery</span>
            <span>Your UPI</span>
          </div>
        </motion.div>

        {/* Reference ID */}
        <motion.div
          variants={rise}
          className="mt-5 w-full rounded-[1.8rem] border border-gold-200 bg-gold-50 p-5 shadow-soft sm:p-6"
        >
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-gold-700 sm:text-xs">
            Save your reference ID
          </p>
          <p className="mt-2 font-mono text-2xl font-extrabold tracking-wide text-cocoa-900 sm:text-3xl">
            {reference}
          </p>
          <div className="mt-3.5 flex justify-center">
            <CopyButton text={reference} label="Copy reference" copiedLabel="Copied" />
          </div>
          <p className="mt-3 text-[11px] font-semibold text-cocoa-500 sm:text-xs">
            Keep this ID safe — you will need it to track your cashback status.
          </p>
        </motion.div>

        {/* Progress track */}
        <motion.div
          variants={rise}
          className="mt-5 w-full rounded-[1.8rem] border border-cocoa-100 bg-white/85 p-5 shadow-soft sm:p-6"
        >
          <div className="flex items-start">
            {TRACK_STEPS.map((step, index) => {
              const Icon = step.icon
              const circle =
                step.state === 'done'
                  ? 'bg-emerald-500 text-white shadow-soft'
                  : step.state === 'active'
                    ? 'bg-amber-400 text-white shadow-soft'
                    : 'bg-cocoa-100 text-cocoa-300'
              const label =
                step.state === 'done'
                  ? 'text-cocoa-900'
                  : step.state === 'active'
                    ? 'text-amber-600'
                    : 'text-cocoa-300'
              return (
                <div key={step.key} className="flex flex-1 items-start last:flex-none">
                  <div className="flex w-16 flex-col items-center sm:w-24">
                    <div className="relative">
                      {step.state === 'active' ? (
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
                    <p className={`mt-2 text-[10px] font-black uppercase tracking-wide sm:text-xs ${label}`}>
                      {step.label}
                    </p>
                  </div>
                  {index < TRACK_STEPS.length - 1 ? (
                    <div
                      className={`mt-5 h-1 flex-1 rounded-full sm:mt-6 ${
                        TRACK_STEPS[index + 1].state === 'done' ? 'bg-emerald-400' : 'bg-cocoa-100'
                      }`}
                    />
                  ) : null}
                </div>
              )
            })}
          </div>
          {note ? (
            <p className="mt-4 rounded-2xl bg-cream-50 px-4 py-3 text-xs font-medium leading-6 text-cocoa-500 sm:text-sm">
              {note}
            </p>
          ) : null}
        </motion.div>

        {/* Actions */}
        <motion.div variants={rise} className="mt-6 grid w-full gap-3 sm:grid-cols-2">
          <Link
            to={`/status?ref=${encodeURIComponent(reference)}`}
            className="btn-shine flex items-center justify-center gap-2 rounded-[1.6rem] bg-gradient-to-b from-brand-400 to-brand-600 px-6 py-4 text-sm font-extrabold text-white shadow-pop transition hover:brightness-105 sm:text-base"
          >
            <Search size={18} /> Check cashback status
          </Link>
          <Link
            to="/"
            className="flex items-center justify-center gap-2 rounded-[1.6rem] border border-cocoa-200 bg-white px-6 py-4 text-sm font-bold text-cocoa-700 transition hover:border-brand-300 hover:text-brand-600 sm:text-base"
          >
            <Home size={17} /> Back to home
          </Link>
        </motion.div>

        <motion.p variants={rise} className="mt-5 text-[11px] font-semibold leading-relaxed text-cocoa-400 sm:text-xs">
          Genuine reviews only — every cashback is processed after a real verification.
        </motion.p>
      </motion.main>
    </div>
  )
}
