import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ImageIcon } from 'lucide-react'
import { resolveImageBlobUrl } from '../lib/firebase'
import { Lightbox, Spinner } from './ui'

export function StatCard({ icon, label, value, sub, tone = 'brand', delay = 0 }) {
  const tones = {
    brand: 'bg-brand-500/10 text-brand-600',
    gold: 'bg-gold-500/10 text-gold-600',
    green: 'bg-emerald-500/10 text-emerald-600',
    blue: 'bg-sky-500/10 text-sky-600',
    red: 'bg-red-500/10 text-red-600',
    cocoa: 'bg-cocoa-500/10 text-cocoa-600',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-3xl border border-cocoa-100 bg-white p-4 shadow-soft"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-cocoa-400">{label}</p>
          <p className="mt-1.5 truncate font-display text-2xl font-extrabold tracking-tight text-cocoa-900">{value}</p>
          {sub && <p className="mt-0.5 text-[11px] font-semibold text-cocoa-400">{sub}</p>}
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${tones[tone]}`}>{icon}</span>
      </div>
    </motion.div>
  )
}

// Lazily resolved image thumbnail (demo data-URLs / Firebase Storage paths)
export function ImageCell({ src, alt = 'proof', className = 'h-12 w-12' }) {
  // `res` is keyed by src so a change of image never shows a stale thumbnail.
  const [res, setRes] = useState(null)

  useEffect(() => {
    let alive = true
    if (!src) {
      Promise.resolve().then(() => {
        if (alive) setRes(null)
      })
      return () => {
        alive = false
      }
    }
    resolveImageBlobUrl(src)
      .then((u) => {
        // url === '' marks a failed/placeholder image (e.g. demo seed data
        // without a real picture) so we don't spin forever.
        if (alive) setRes({ key: src, url: u || '' })
      })
      .catch(() => {
        if (alive) setRes({ key: src, url: '' })
      })
    return () => {
      alive = false
    }
  }, [src])

  const resMatch = res && res.key === src ? res : null
  const url = resMatch && resMatch.url ? resMatch.url : null
  const failed = Boolean(src) && resMatch && resMatch.url === ''
  const loading = Boolean(src) && !resMatch

  if (!src || failed) {
    return (
      <span className={`flex items-center justify-center rounded-xl bg-cocoa-100 text-cocoa-300 ${className}`}>
        <ImageIcon size={16} />
      </span>
    )
  }
  if (loading) {
    return (
      <span className={`flex items-center justify-center rounded-xl bg-cocoa-100 text-cocoa-300 ${className}`}>
        <Spinner size={15} className="text-brand-400" />
      </span>
    )
  }
  return <img src={url} alt={alt} className={`rounded-xl border border-cocoa-100 object-cover ${className}`} loading="lazy" />
}

export function LightboxArea({ children, src, onClose }) {
  return (
    <>
      {children}
      <AnimatePresence>{src && <Lightbox src={src} onClose={onClose} />}</AnimatePresence>
    </>
  )
}
