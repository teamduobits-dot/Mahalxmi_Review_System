import { motion } from 'framer-motion'
import { CopyButton, SectionCard } from '../components/ui'

export default function Success({ reference, note, onReset }) {
  return (
    <SectionCard className="mt-6 bg-white/95 p-6 text-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 16 }}
        className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl"
      >
        ✅
      </motion.div>
      <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-cocoa-900">Submission received</h2>
      <p className="mt-2 text-sm font-medium text-cocoa-500">Your cashback request has been saved successfully.</p>

      <div className="mt-5 rounded-3xl bg-cream-50 p-5">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-cocoa-400">Reference ID</p>
        <p className="mt-2 font-mono text-xl font-extrabold tracking-wide text-brand-600">{reference}</p>
        {note && <p className="mt-3 text-xs font-medium text-cocoa-500">{note}</p>}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <CopyButton text={reference} label="Copy reference" copiedLabel="Copied" className="w-full" />
        <button
          type="button"
          onClick={onReset}
          className="rounded-2xl border border-cocoa-200 bg-white px-4 py-3 text-sm font-bold text-cocoa-700 transition hover:border-brand-300 hover:text-brand-600"
        >
          Submit another request
        </button>
      </div>
    </SectionCard>
  )
}
