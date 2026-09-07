import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Gift, ScanQrCode, Star, Wallet } from 'lucide-react'
import FloatingFood from '../components/FloatingFood'
import { Sparkles } from '../components/ui'
import { money } from '../lib/format'

const steps = [
  {
    icon: <Star size={22} />,
    emoji: '⭐',
    title: 'Share Feedback',
    desc: 'A few quick taps about your order',
    color: '#FF5A1F',
    bg: '#FFF0E4',
  },
  {
    icon: <ScanQrCode size={22} />,
    emoji: '📱',
    title: 'Rate & Review',
    desc: 'Post your genuine review in your food app',
    color: '#F5AB05',
    bg: '#FFF7DE',
  },
  {
    icon: <Wallet size={22} />,
    emoji: '🎁',
    title: 'Get ₹15 Cashback',
    desc: 'Upload proof & receive cashback after verification',
    color: '#16A34A',
    bg: '#EAF9EF',
  },
]

export default function Welcome({ settings, onStart }) {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden surface-warm">
      {/* Slow ambient gradient drift */}
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-300/25 blur-3xl animate-drift" />
      <div aria-hidden className="pointer-events-none absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-gold-300/25 blur-3xl animate-drift" style={{ animationDelay: '-8s' }} />
      <FloatingFood count={7} opacity={0.32} />
      <Sparkles count={10} />

      <main className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col items-center px-5 pb-10 pt-safe sm:px-8">
        {/* Brand + campaign badge */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="mt-4 flex items-center gap-2"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-lg shadow-pop">
            🍔
          </span>
          <div className="text-left leading-tight">
            <p className="text-[15px] font-extrabold tracking-tight text-cocoa-900">Mahalaxmi</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-600">Multi Cuisine</p>
          </div>
        </motion.div>

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 text-center"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-300 bg-gold-50 px-3.5 py-1.5 text-xs font-bold text-gold-700 shadow-soft">
            <Gift size={13} /> {money(settings.cashbackAmount)} Cashback Campaign
          </span>
          <h1 className="mt-4 font-display text-[2.6rem] font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
            {settings.welcomeTitle || 'Hello Foodie!'} <span className="inline-block animate-wiggle">👋</span>
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-[15px] font-medium leading-relaxed text-cocoa-600">
            Thank you for ordering from{' '}
            <span className="font-bold text-cocoa-800">Mahalaxmi Multi Cuisine</span>{' '}
            <span className="whitespace-nowrap">❤️</span>
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[15px] font-medium leading-relaxed text-cocoa-600">
            Your honest feedback helps us improve our food and serve you better.{' '}
            <span className="font-bold text-brand-600">Share your experience and receive {money(settings.cashbackAmount)} cashback</span> as a thank-you!
          </p>
        </motion.div>

        {/* Three-step explanation */}
        <div className="mt-8 w-full space-y-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, x: i % 2 === 0 ? -26 : 26 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.55, delay: 0.28 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-4 rounded-3xl border border-white/80 bg-white/80 p-4 shadow-card backdrop-blur-sm"
            >
              <motion.span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl"
                style={{ background: s.bg, color: s.color }}
                whileHover={{ rotate: [0, -8, 8, 0], transition: { duration: 0.4 } }}
              >
                {s.emoji}
              </motion.span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-cocoa-900">
                  <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black text-white" style={{ background: s.color }}>
                    {i + 1}
                  </span>
                  {s.title}
                </p>
                <p className="mt-0.5 text-[13px] font-medium text-cocoa-500">{s.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mt-9 w-full"
        >
          <motion.button
            onClick={onStart}
            whileTap={{ scale: 0.955 }}
            whileHover={{ scale: 1.015 }}
            className="btn-shine animate-pulse-glow flex w-full items-center justify-center gap-2 rounded-3xl bg-gradient-to-b from-brand-400 to-brand-600 px-8 py-4.5 text-lg font-extrabold tracking-wide text-white"
          >
            🚀 Start
            <motion.span
              animate={{ x: [0, 5, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              aria-hidden
            >
              →
            </motion.span>
          </motion.button>
          <p className="mt-4 text-center text-xs font-medium text-cocoa-400">
            Takes about 2 minutes · Honest feedback only · No fakes, promise 🤞
          </p>
        </motion.div>

        <footer className="mt-auto pt-10 text-center">
          <p className="text-[11px] font-medium text-cocoa-300">
            Made with ❤️ & fresh fries by Mahalaxmi Multi Cuisine
          </p>
        </footer>
      </main>
    </div>
  )
}
