import { motion } from 'framer-motion'
import { ImageIcon } from 'lucide-react'

export function StatCard({ icon, label, value, sub, tone = 'brand', delay = 0 }) {
  const tones = {
    brand: 'bg-brand-500/10 text-brand-600',
    gold: 'bg-gold-500/10 text-gold-600',
    green: 'bg-emerald-500/10 text-emerald-600',
    blue: 'bg-sky-500/10 text-sky-600',
    red: 'bg-red-500/10 text-red-600',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="rounded-3xl border border-cocoa-100 bg-white p-4 shadow-soft"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wider text-cocoa-400">{label}</p>
          <p className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-cocoa-900">{value}</p>
          {sub && <p className="mt-1 text-[11px] font-semibold text-cocoa-400">{sub}</p>}
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tones[tone]}`}>{icon}</span>
      </div>
    </motion.div>
  )
}

export function ImageCell({ src, alt = 'proof', className = 'h-12 w-12' }) {
  if (!src) {
    return (
      <span className={`flex items-center justify-center rounded-xl bg-cocoa-100 text-cocoa-300 ${className}`}>
        <ImageIcon size={16} />
      </span>
    )
  }

  return <img src={src} alt={alt} className={`rounded-xl border border-cocoa-100 object-cover ${className}`} loading="lazy" />
}
