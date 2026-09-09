import { forwardRef, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, ImagePlus, Loader2, RefreshCw, Trash2, X } from 'lucide-react'
import { compressImageFile } from '../lib/image'
import { STATUS_META } from '../lib/status'

export function Spinner({ size = 18, className = '' }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />
}

export function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.pending
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
      style={{ background: meta.bg, color: meta.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
      {meta.label}
    </span>
  )
}

export function ErrorBox({ children }) {
  return (
    <div className="rounded-3xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
      {children}
    </div>
  )
}

export const SectionCard = forwardRef(function SectionCard({ children, className = '' }, ref) {
  return (
    <section ref={ref} className={`rounded-[2rem] border border-white/90 bg-white/90 p-5 shadow-card backdrop-blur-sm ${className}`}>
      {children}
    </section>
  )
})

export function CopyButton({ text, label = 'Copy', copiedLabel = 'Copied', className = '' }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl bg-cocoa-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-cocoa-800 active:scale-[0.98] ${className}`}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? copiedLabel : label}
    </button>
  )
}

export function Lightbox({ src, onClose }) {
  return (
    <motion.div
      className="fixed inset-0 z-100 flex items-center justify-center bg-cocoa-950/85 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.img
        src={src}
        alt="Preview"
        className="max-h-[88vh] max-w-full rounded-3xl object-contain shadow-2xl"
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        onClick={(event) => event.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
      >
        <X size={20} />
      </button>
    </motion.div>
  )
}

export function ImageUpload({
  label,
  hint,
  value,
  onChange,
  onRemove,
  disabled = false,
  maxMB = 8,
}) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    return () => {
      if (value?.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(value.previewUrl)
      }
    }
  }, [value])

  const handleFiles = async (files) => {
    const file = files?.[0]
    if (!file) return

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
      onChange({
        file: compressed,
        previewUrl,
        fileName: compressed.name,
        size: compressed.size,
      })
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to process that image.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => handleFiles(event.target.files)}
      />

      {value ? (
        <div className="relative overflow-hidden rounded-3xl border-2 border-brand-200 bg-white shadow-card">
          <img src={value.previewUrl} alt="Uploaded" className="mx-auto max-h-72 w-full object-contain" />
          <div className="absolute right-3 top-3 flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-cocoa-700 shadow-md transition hover:scale-105"
            >
              <RefreshCw size={16} />
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-red-600 shadow-md transition hover:scale-105"
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-3 text-xs font-bold text-white">
            {value.fileName || 'Image selected'}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
          className="group flex w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-brand-300 bg-brand-50/65 px-6 py-9 text-center transition hover:border-brand-500 hover:bg-brand-50 disabled:opacity-60"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-500 shadow-soft transition group-hover:scale-110">
            {busy ? <Spinner className="text-brand-500" /> : <ImagePlus size={26} />}
          </span>
          <span className="text-sm font-bold text-cocoa-800">{busy ? 'Processing image...' : label}</span>
          <span className="text-xs text-cocoa-400">{hint}</span>
        </button>
      )}

      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  )
}

export function LightboxArea({ src, onClose, children }) {
  return (
    <>
      {children}
      <AnimatePresence>{src ? <Lightbox src={src} onClose={onClose} /> : null}</AnimatePresence>
    </>
  )
}
