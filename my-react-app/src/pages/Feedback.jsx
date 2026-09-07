import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Sparkles as SparklesIcon } from 'lucide-react'
import { QUESTIONS } from '../lib/ratings'
import { generateReview, reviewTone } from '../lib/review'
import { suggestedStars } from '../lib/ratings'
import { ProgressDots } from '../components/ui'

const TOTAL_STEPS = 5 // 4 rating questions + optional improvement

const direction = (idx) => (idx % 2 === 0 ? 70 : -70)

export default function Feedback({ ratings, onChange, onComplete, onBack }) {
  // Start at the first unanswered question (or the improvement step when all
  // four are answered) — the frame remounts on every visit, so this also
  // restores progress correctly when customers come back.
  const [step, setStep] = useState(() => {
    const firstUnanswered = QUESTIONS.findIndex((q) => !ratings?.[q.id])
    return firstUnanswered !== -1 ? firstUnanswered : 4
  })
  const advanceTimer = useRef(null)

  useEffect(() => () => clearTimeout(advanceTimer.current), [])

  const isImprovementStep = step === 4

  const goNext = () => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1))
  const goBack = () => {
    if (step === 0) return onBack?.()
    clearTimeout(advanceTimer.current)
    setStep((s) => Math.max(0, s - 1))
  }

  const select = (key, value) => {
    clearTimeout(advanceTimer.current)
    onChange({ ...ratings, [key]: value })
    advanceTimer.current = setTimeout(() => {
      goNext()
    }, 340)
  }

  const finish = () => {
    const review = generateReview(ratings)
    const tone = reviewTone(ratings)
    const stars = suggestedStars(ratings)
    onComplete({ generatedReview: review, tone, suggestedStars: stars })
  }

  const q = QUESTIONS[step]

  return (
    <div className="relative flex min-h-screen flex-col surface-warm">
      <div aria-hidden className="pointer-events-none absolute -right-24 top-24 h-72 w-72 rounded-full bg-brand-200/30 blur-3xl animate-drift" />

      <main className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pb-safe pt-safe sm:px-8">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={goBack}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cocoa-200/70 bg-white/85 text-cocoa-700 shadow-soft transition hover:text-brand-600 active:scale-90"
            aria-label="Go back"
          >
            <ArrowLeft size={19} />
          </button>
          <div className="flex-1 text-center">
            <ProgressDots current={step + 1} total={TOTAL_STEPS} />
            <p className="mt-1.5 text-xs font-bold uppercase tracking-[0.14em] text-cocoa-400">
              Step {step + 1} of {TOTAL_STEPS}
            </p>
          </div>
          <div className="w-11" aria-hidden />
        </div>

        {/* Card body */}
        <div className="flex flex-1 flex-col justify-center py-6">
          <AnimatePresence mode="wait" custom={step}>
            <motion.div
              key={step}
              custom={step}
              initial={{ opacity: 0, x: direction(step) }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -direction(step) }}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            >
              {isImprovementStep ? (
                <div className="text-center">
                  <motion.span
                    className="inline-block text-6xl"
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 14 }}
                  >
                    💬
                  </motion.span>
                  <h2 className="mt-4 font-display text-[1.75rem] font-extrabold leading-tight tracking-tight">
                    Anything you think we can improve?
                  </h2>
                  <p className="mt-2 text-sm font-medium text-cocoa-500">
                    Completely optional — you can skip this and we won't mind 🙌
                  </p>
                  <textarea
                    autoFocus
                    rows={4}
                    value={ratings?.improvement || ''}
                    onChange={(e) => onChange({ ...ratings, improvement: e.target.value })}
                    placeholder="Tell us anything you'd like us to improve…"
                    className="mt-6 w-full resize-none rounded-3xl border-2 border-cocoa-200/80 bg-white/90 p-4 text-[15px] font-medium text-cocoa-900 shadow-soft outline-none transition placeholder:text-cocoa-300 focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                    maxLength={600}
                  />
                  <button
                    onClick={finish}
                    className="btn-shine mt-5 flex w-full items-center justify-center gap-2 rounded-3xl bg-gradient-to-b from-brand-400 to-brand-600 px-6 py-4 text-base font-extrabold text-white shadow-pop transition hover:brightness-105 active:scale-[0.97]"
                  >
                    <SparklesIcon size={18} /> See my review suggestion
                    <ArrowRight size={18} />
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <motion.span
                    key={q.id}
                    className="inline-block text-6xl"
                    initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 13 }}
                  >
                    {q.emoji}
                  </motion.span>
                  <h2 className="mt-4 font-display text-[1.75rem] font-extrabold leading-tight tracking-tight">
                    {q.title}
                  </h2>
                  <p className="mt-1.5 text-sm font-medium text-cocoa-500">{q.subtitle}</p>

                  <div className="mt-7 grid gap-3">
                    {Object.entries(q.options).map(([value, meta], i) => {
                      const selected = ratings?.[q.id] === value
                      return (
                        <motion.button
                          key={value}
                          initial={{ opacity: 0, y: 18 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.08 + i * 0.055, type: 'spring', stiffness: 260, damping: 22 }}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => select(q.id, value)}
                          aria-pressed={selected}
                          className={`flex items-center gap-4 rounded-3xl border-2 px-5 py-3.5 text-left transition-all duration-200 ${
                            selected
                              ? 'border-brand-500 bg-brand-50 shadow-pop'
                              : 'border-cocoa-200/70 bg-white/85 shadow-soft hover:border-brand-300 hover:bg-brand-50/40'
                          }`}
                        >
                          <motion.span
                            animate={selected ? { scale: [1, 1.35, 1.12], rotate: [0, -10, 0] } : { scale: 1 }}
                            transition={{ duration: 0.35 }}
                            className="text-[26px] leading-none"
                          >
                            {meta.emoji}
                          </motion.span>
                          <span className={`flex-1 text-[15px] font-bold ${selected ? 'text-brand-700' : 'text-cocoa-800'}`}>
                            {meta.label}
                          </span>
                          {selected && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-sm text-white"
                            >
                              ✓
                            </motion.span>
                          )}
                        </motion.button>
                      )
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
