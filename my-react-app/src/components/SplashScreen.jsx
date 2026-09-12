import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import FoodIcon from './FoodIcon'

// Short, friendly lines that rotate while the page "warms up". Kept food-first
// so the intro feels like a kitchen getting ready — never mentions servers.
const MESSAGES = [
  'Firing up the tandoor…',
  'Flipping juicy burgers…',
  'Stretching the cheesy pizza…',
  'Frying golden fries…',
  'Plating your cashback…',
]

const ORBITERS = [
  { type: 'pizza', className: 'splash-orbiter-a', size: 30 },
  { type: 'fries', className: 'splash-orbiter-b', size: 28 },
  { type: 'drink', className: 'splash-orbiter-c', size: 26 },
  { type: 'icecream', className: 'splash-orbiter-d', size: 26 },
]

export default function SplashScreen() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % MESSAGES.length), 1150)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <motion.div
      className="surface-warm fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.03 }}
      transition={{ duration: 0.45, ease: 'easeInOut' }}
      role="status"
      aria-live="polite"
      aria-label="Loading the cashback form"
    >
      {/* soft warm blobs */}
      <div aria-hidden className="pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full bg-brand-200/40 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-24 top-16 h-80 w-80 rounded-full bg-gold-200/40 blur-3xl" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-[radial-gradient(circle_at_bottom,_rgba(255,196,31,0.14),_transparent_55%)]"
      />

      <div className="relative flex w-full max-w-sm flex-col items-center px-6 text-center">
        {/* brand pill */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-4 py-2 text-sm font-extrabold text-cocoa-900 shadow-soft backdrop-blur-sm"
        >
          <span className="text-base">🍔</span> Mahalaxmi Multi Cuisine
        </motion.div>

        {/* emblem: spinning rings + bobbing burger + floating food orbiters */}
        <div className="relative mt-8 h-44 w-44 sm:h-48 sm:w-48">
          <div
            aria-hidden
            className="animate-spin-slow absolute inset-0 rounded-full border border-dashed border-brand-300/70"
          />
          <div
            aria-hidden
            className="animate-spin-slow absolute inset-5 rounded-full border border-dashed border-gold-300/80"
            style={{ animationDirection: 'reverse' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-bob flex h-20 w-20 items-center justify-center rounded-[1.6rem] bg-gradient-to-br from-brand-500 to-gold-400 p-2 shadow-pop will-change-transform">
              <FoodIcon type="burger" size={52} />
            </div>
          </div>
          {ORBITERS.map((orbiter) => (
            <span
              key={orbiter.type}
              aria-hidden
              className={`absolute rounded-2xl bg-white p-2 shadow-soft will-change-transform ${orbiter.className}`}
            >
              <FoodIcon type={orbiter.type} size={orbiter.size} />
            </span>
          ))}
        </div>

        {/* headline + rotating message */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut', delay: 0.08 }}
          className="mt-8 font-display text-3xl font-black tracking-tight text-cocoa-950 sm:text-4xl"
        >
          Hold tight!
        </motion.h1>

        <div className="mt-3 flex h-6 items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={index}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="text-base font-semibold text-cocoa-600 sm:text-lg"
            >
              {MESSAGES[index]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* bouncing dots */}
        <div className="mt-5 flex items-center justify-center gap-2">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="animate-dot h-2.5 w-2.5 rounded-full bg-brand-500"
              style={{ animationDelay: `${dot * 0.15}s` }}
            />
          ))}
        </div>

        {/* progress bar — signals the splash is almost done */}
        <div className="mt-6 h-1.5 w-56 overflow-hidden rounded-full bg-cream-200/90">
          <div className="splash-progress h-full rounded-full bg-gradient-to-r from-brand-400 to-gold-400" />
        </div>
      </div>
    </motion.div>
  )
}
