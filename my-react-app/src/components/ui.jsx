import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ImagePlus, Loader2, RefreshCw, Trash2, X } from 'lucide-react'
import FoodIcon from './FoodIcon'
import { compressImageFile } from '../lib/firebase'
import { STATUS_META } from '../lib/status'

// ---------------------------------------------------------------------------
// Decorative animated sparkles/stars
// ---------------------------------------------------------------------------
export function Sparkles({ count = 12 }) {
  const stars = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: `${(i * 53) % 100}%`,
        top: `${(i * 37) % 100}%`,
        size: 10 + ((i * 7) % 14),
        delay: (i % 7) * 0.35,
        dur: 2 + (i % 4) * 0.5,
      })),
    [count]
  )
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {stars.map((s) => (
        <span
          key={s.id}
          className="absolute animate-twinkle text-gold-400"
          style={{ left: s.left, top: s.top, fontSize: s.size, animationDelay: `${s.delay}s`, animationDuration: `${s.dur}s` }}
        >
          ✦
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Progress dots (Step 1 of 4 style)
// ---------------------------------------------------------------------------
export function ProgressDots({ current, total }) {
  return (
    <div className="flex items-center justify-center gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current} aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const filled = i < current
        const active = i === current - 1
        return (
          <motion.span
            key={i}
            className={`block h-2.5 rounded-full transition-colors duration-500 ${filled ? 'bg-brand-500' : 'bg-cocoa-200'}`}
            animate={{ width: active ? 34 : 12 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          />
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Animated success check (premium, ring + check pop)
// ---------------------------------------------------------------------------
export function AnimatedCheck({ size = 88, color = '#16A34A' }) {
  return (
    <motion.div
      className="relative flex items-center justify-center rounded-full"
      style={{ width: size, height: size, background: `${color}14` }}
    >
      <motion.span
        className="absolute inset-0 rounded-full border-4"
        style={{ borderColor: color }}
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: [0.4, 1.12, 1], opacity: 1 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      />
      <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24" fill="none">
        <motion.path
          d="M4 12.5l5.2 5.2L20 7"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.45, delay: 0.25, ease: 'easeOut' }}
        />
      </svg>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Food-themed loading scene (burger assembling + plate progress)
// ---------------------------------------------------------------------------
const ASSEMBLY = [
  { icon: 'drink', label: 'Warming up the kitchen…', delay: 0 },
  { icon: 'fries', label: 'Packing your feedback…', delay: 1.1 },
  { icon: 'burger', label: 'Assembling your cashback…', delay: 2.2 },
]

export function FoodLoading({ message = 'Processing your request…' }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, ASSEMBLY.length - 1)), 1100)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="flex flex-col items-center py-4">
      <div className="relative flex h-24 items-end justify-center">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={step}
            initial={{ y: 46, opacity: 0, scale: 0.5 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -46, opacity: 0, scale: 0.6 }}
            transition={{ type: 'spring', stiffness: 210, damping: 20 }}
          >
            <FoodIcon type={ASSEMBLY[step].icon} size={84} className="animate-float" />
          </motion.div>
        </AnimatePresence>
      </div>
      <motion.p key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 text-sm font-semibold text-cocoa-700">
        {ASSEMBLY[step].label}
      </motion.p>
      <div className="mt-4 h-1.5 w-44 overflow-hidden rounded-full bg-cocoa-100">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
          initial={{ width: '8%' }}
          animate={{ width: '92%' }}
          transition={{ duration: 3.3, ease: 'easeInOut' }}
        />
      </div>
      <p className="mt-3 text-xs text-cocoa-400">{message}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Image upload card — gallery/tap, preview, replace/remove, progress
// ---------------------------------------------------------------------------
export function ImageUpload({
  label = 'Upload image',
  hint = 'Tap to choose from your gallery',
  value, // { previewUrl, fileName }
  onChange,
  onRemove,
  disabled = false,
  maxMB = 8,
  className = '',
}) {
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (progress >= 100) {
      const t = setTimeout(() => setProgress(0), 600)
      return () => clearTimeout(t)
    }
  }, [progress])

  const handleFiles = async (files) => {
    const file = files?.[0]
    if (!file || disabled) return
    setError('')
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.')
      return
    }
    if (file.size > maxMB * 1024 * 1024) {
      setError(`Please choose an image under ${maxMB} MB.`)
      return
    }
    setBusy(true)
    try {
      const compressed = await compressImageFile(file)
      const previewUrl = URL.createObjectURL(compressed)
      // A data-URL is persisted with the journey so the preview survives
      // page reloads (blob URLs do not).
      const dataUrl = await readFileAsDataUrl(compressed)
      const pct = { value: 0 }
      const tick = setInterval(() => {
        pct.value = Math.min(96, pct.value + 12 + Math.random() * 10)
        setProgress(pct.value)
      }, 90)
      // Allow UI to breathe while compression finishes
      await new Promise((r) => setTimeout(r, 300))
      clearInterval(tick)
      setProgress(100)
      onChange({ previewUrl, dataUrl, fileName: compressed.name, file: compressed, size: compressed.size })
    } catch (err) {
      setError(err?.message || 'Unable to process that image. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label={label}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {value ? (
        <div className="relative overflow-hidden rounded-3xl border-2 border-brand-200 bg-white shadow-card">
          <img src={value.dataUrl || value.previewUrl} alt="Uploaded preview" className="mx-auto max-h-72 w-full object-contain" />
          <div className="absolute right-2 top-2 flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-cocoa-700 shadow-md transition hover:scale-105 active:scale-95"
              aria-label="Replace image"
            >
              <RefreshCw size={16} />
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-red-600 shadow-md transition hover:scale-105 active:scale-95"
              aria-label="Remove image"
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/45 to-transparent p-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check size={13} strokeWidth={3} />
            </span>
            <span className="text-xs font-semibold text-white">{value.fileName || 'Image ready'}</span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
          className="group relative flex w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-brand-300 bg-brand-50/70 px-6 py-9 text-center transition hover:border-brand-500 hover:bg-brand-50 active:scale-[0.99] disabled:opacity-60"
        >
          {busy ? (
            <div className="flex flex-col items-center gap-3">
              <div className="relative h-14 w-14">
                <motion.div
                  className="absolute inset-0 rounded-full border-[3px] border-brand-200 border-t-brand-500"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-lg">📸</span>
              </div>
              <span className="text-sm font-semibold text-brand-600">
                {progress > 0 ? `Processing… ${Math.round(progress)}%` : 'Preparing…'}
              </span>
              {progress > 0 && (
                <div className="h-1.5 w-40 overflow-hidden rounded-full bg-brand-100">
                  <motion.div className="h-full rounded-full bg-brand-500" animate={{ width: `${progress}%` }} transition={{ ease: 'easeOut' }} />
                </div>
              )}
            </div>
          ) : (
            <>
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-500 shadow-soft transition group-hover:scale-110 group-hover:text-brand-600">
                <ImagePlus size={26} />
              </span>
              <span className="text-sm font-bold text-cocoa-800">{label}</span>
              <span className="text-xs text-cocoa-400">{hint}</span>
            </>
          )}
        </button>
      )}
      {error && <p className="mt-2 text-xs font-medium text-red-600" role="alert">{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status pill (admin)
// ---------------------------------------------------------------------------
export function StatusPill({ status, size = 'md' }) {
  const meta = STATUS_META[status] || STATUS_META.pending
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'}`}
      style={{ background: meta.bg, color: meta.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
      {meta.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Mini horizontal bar (analytics)
// ---------------------------------------------------------------------------
export function MiniBar({ value = 0, max = 5, color = '#FF5A1F', label, right }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-cocoa-600">{label}</span>
        <span className="font-bold" style={{ color }}>{right ?? value}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-cocoa-100">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Copy to clipboard button with "Copied!" feedback
// ---------------------------------------------------------------------------
export function CopyButton({ text, label = 'Copy', copiedLabel = 'Copied!', className = '', variant = 'primary' }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }
  const styles =
    variant === 'primary'
      ? copied
        ? 'bg-emerald-500 text-white shadow-pop'
        : 'bg-brand-500 text-white hover:bg-brand-600 shadow-pop'
      : variant === 'ghost'
      ? copied
        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
        : 'border border-white/15 bg-white/[0.07] text-cream-50 hover:border-gold-300/50 hover:text-gold-200'
      : copied
      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
      : 'border-cocoa-200 bg-white text-cocoa-700 hover:border-brand-300 hover:text-brand-600'
  return (
    <button type="button" onClick={copy} className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition active:scale-[0.97] ${styles} ${className}`}>
      {copied ? (
        <>
          <Check size={17} strokeWidth={3} /> {copiedLabel}
        </>
      ) : (
        label
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Lightbox for viewing screenshots / QR images
// ---------------------------------------------------------------------------
export function Lightbox({ src, onClose }) {
  return (
    <motion.div
      className="fixed inset-0 z-100 flex items-center justify-center bg-cocoa-950/85 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      <motion.img
        src={src}
        alt="Enlarged view"
        className="max-h-[88vh] max-w-full rounded-2xl object-contain shadow-2xl"
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
        aria-label="Close viewer"
      >
        <X size={20} />
      </button>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Friendly error box
// ---------------------------------------------------------------------------
export function ErrorBox({ children, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-red-100 bg-red-50/70 p-6 text-center">
      <span className="text-3xl">🍟</span>
      <p className="text-sm font-semibold text-red-700">{children}</p>
      {onRetry && (
        <button onClick={onRetry} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 active:scale-95">
          Try again
        </button>
      )}
    </div>
  )
}

export function Spinner({ size = 18, className = '' }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read the image.'))
    reader.readAsDataURL(file)
  })
}
