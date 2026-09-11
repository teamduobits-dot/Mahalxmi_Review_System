import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import FoodIcon from './FoodIcon'

// Friendly, non-technical staged messages. Never mention Render, servers,
// backends, or cold starts — the user only ever sees reassurance while the
// form waits for readiness and submits exactly once.
const STAGES = [
  { at: 0, title: 'Submitting your details…', subtitle: 'Please give us a few seconds.' },
  { at: 8000, title: 'Almost there…', subtitle: "We're securely processing your details." },
  { at: 20000, title: 'Saving your details…', subtitle: 'This is taking a little longer than expected. Hang tight!' },
  { at: 45000, title: 'Still working on it…', subtitle: "Please don't close this page." },
]

// Full-screen, non-dismissible loading overlay shown from the moment the user
// taps Submit until the single submission request resolves. Blocks all
// interaction (no double-submit, no field edits mid-flight) while the user's
// form data stays safely preserved underneath.
export default function SubmitOverlay({ visible }) {
  // The current stage is DERIVED from elapsed time: mount time is the submit
  // moment (the parent remounts this per submission via `key`), the interval
  // only ticks `now`, and each render computes which stage that falls into.
  const [start] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!visible) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [visible])

  useEffect(() => {
    if (!visible) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [visible])

  const elapsed = visible ? Math.max(0, now - start) : 0
  let stageIndex = 0
  STAGES.forEach((entry, index) => {
    if (elapsed >= entry.at) stageIndex = index
  })
  const stage = STAGES[stageIndex]

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className="fixed inset-0 z-100 flex items-center justify-center bg-cocoa-950/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="status"
          aria-live="polite"
          aria-label="Submitting your details"
        >
          <motion.div
            initial={{ scale: 0.94, y: 14, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 8, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="w-full max-w-sm rounded-[2rem] border border-white/80 bg-white/95 p-6 text-center shadow-card backdrop-blur-md"
          >
            <motion.div
              className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.6rem] bg-gradient-to-br from-brand-500 to-gold-400 shadow-pop"
              animate={{ y: [0, -6, 0], rotate: [-2, 2, -2] }}
              transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
            >
              <FoodIcon type="burger" size={44} />
            </motion.div>

            <AnimatePresence mode="wait">
              <motion.div
                key={stageIndex}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
              >
                <p className="mt-4 font-display text-xl font-black tracking-tight text-cocoa-950">
                  {stage.title}
                </p>
                <p className="mt-1.5 text-sm font-semibold leading-6 text-cocoa-500">{stage.subtitle}</p>
              </motion.div>
            </AnimatePresence>

            <div className="mt-5 flex items-center justify-center gap-2">
              {[0, 1, 2].map((dot) => (
                <motion.span
                  key={dot}
                  className="h-2.5 w-2.5 rounded-full bg-brand-500"
                  animate={{ y: [0, -7, 0], opacity: [0.45, 1, 0.45] }}
                  transition={{ repeat: Infinity, duration: 1, delay: dot * 0.18, ease: 'easeInOut' }}
                />
              ))}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
