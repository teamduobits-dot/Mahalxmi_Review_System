import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AnimatedCheck, CopyButton } from '../components/ui'
import FoodIcon from '../components/FoodIcon'
import { money } from '../lib/format'

// Lightweight, dependency-free confetti — food-emoji + brand-color particles.
function useConfetti() {
  return useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => ({
        id: i,
        x: (i * 61) % 100,
        delay: (i % 9) * 0.18,
        dur: 2.6 + (i % 5) * 0.5,
        drift: ((i % 2 === 0 ? 1 : -1) * (14 + (i * 7) % 46)),
        emoji: ['🎉', '⭐', '🍔', '🍟', '🎊', '❤️', '✨'][i % 7],
        size: 13 + (i % 4) * 4,
      })),
    []
  )
}

export default function Success({ submission, settings, onRestart }) {
  const confetti = useConfetti()
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 200)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden surface-dark px-5 pb-safe pt-safe">
      {/* Confetti layer */}
      {show && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {confetti.map((c) => (
            <motion.span
              key={c.id}
              className="absolute top-[-6%]"
              style={{ left: `${c.x}%`, fontSize: c.size }}
              initial={{ y: -40, opacity: 0, rotate: 0 }}
              animate={{ y: '108vh', x: c.drift, opacity: [0, 1, 1, 0.7], rotate: [0, 180, 360] }}
              transition={{ duration: c.dur, delay: c.delay, repeat: Infinity, repeatDelay: 0.4, ease: 'linear' }}
            >
              {c.emoji}
            </motion.span>
          ))}
        </div>
      )}

      <div aria-hidden className="pointer-events-none absolute -left-28 top-10 h-96 w-96 rounded-full bg-brand-500/15 blur-3xl animate-drift" />
      <div aria-hidden className="pointer-events-none absolute -right-28 bottom-10 h-96 w-96 rounded-full bg-gold-400/10 blur-3xl animate-drift" />

      <main className="relative z-10 flex w-full max-w-xl flex-col items-center text-center">
        <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 190, damping: 14, delay: 0.1 }}>
          <AnimatedCheck size={112} color="#4ADE80" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.5 }}
          className="mt-6 font-display text-4xl font-extrabold tracking-tight text-cream-50"
        >
          Thank You! 🎉
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="mt-2 text-[15px] font-medium text-cream-200/80"
        >
          Your feedback has been received <span className="text-cream-50">❤️</span>
        </motion.p>

        {/* Cashback card */}
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.75, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 w-full rounded-[2rem] border border-white/10 bg-white/[0.07] p-6 backdrop-blur-md"
        >
          <div className="flex items-center justify-center gap-3">
            <motion.span
              animate={{ rotate: [0, -8, 8, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.2 }}
              className="text-3xl"
            >
              🎁
            </motion.span>
            <div className="text-left">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold-300">{money(settings.cashbackAmount)} Cashback</p>
              <p className="text-sm font-semibold text-cream-200/80">{settings.processingNote || 'Processed after verification.'}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/[0.06] p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-cream-200/60">Submission Status</p>
              <p className="mt-1.5 flex items-center justify-center gap-2 text-sm font-extrabold text-gold-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-gold-400" /> Under Verification
              </p>
            </div>
            <div className="rounded-2xl bg-white/[0.06] p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-cream-200/60">Reference ID</p>
              <p className="mt-1.5 font-mono text-sm font-extrabold tracking-wide text-cream-50">{submission.reference}</p>
            </div>
          </div>

          <div className="mt-4">
            <CopyButton
              text={submission.reference}
              label="📋 Copy Reference ID"
              copiedLabel="Reference copied!"
              variant="ghost"
              className="w-full justify-center border border-white/15 bg-white/[0.07] text-cream-50 hover:border-gold-300/50 hover:text-gold-200"
            />
          </div>
          <p className="mt-3 text-[11px] font-medium text-cream-200/50">
            Keep this ID safe — you can use it to check your cashback status.
          </p>
        </motion.div>

        {/* Floating food celebration */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="mt-7 flex items-end justify-center gap-5"
        >
          {['fries', 'burger', 'drink'].map((t, i) => (
            <motion.span
              key={t}
              animate={{ y: [0, -10, 0], rotate: [0, i % 2 ? 6 : -6, 0] }}
              transition={{ duration: 2.6 + i * 0.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <FoodIcon type={t} size={i === 1 ? 64 : 46} />
            </motion.span>
          ))}
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
          onClick={onRestart}
          className="mt-8 text-sm font-bold text-cream-200/60 underline-offset-4 transition hover:text-cream-50 hover:underline"
        >
          Submit feedback for another order?
        </motion.button>
      </main>
    </div>
  )
}
