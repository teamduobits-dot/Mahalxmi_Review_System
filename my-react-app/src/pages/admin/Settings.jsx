import { useState } from 'react'
import { motion } from 'framer-motion'
import { IndianRupee, MessageSquareText, Rocket, Save, ShieldCheck, Timer } from 'lucide-react'
import { Spinner } from '../../components/ui'
import { DEFAULT_SETTINGS } from '../../lib/firebase'

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="text-[11px] font-black uppercase tracking-wider text-cocoa-500">{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-[11px] font-medium text-cocoa-300">{hint}</p>}
    </div>
  )
}

export default function Settings({ settings, onSave }) {
  const [form, setForm] = useState(null)
  const [prevSettings, setPrevSettings] = useState(settings)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  // Derive the editable form from settings whenever settings change
  // (React's recommended "adjust state during render" pattern).
  if (settings && prevSettings !== settings) {
    setPrevSettings(settings)
    setForm({ ...DEFAULT_SETTINGS, ...settings })
  }

  if (!form) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="text-brand-500" size={24} />
      </div>
    )
  }

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const save = async () => {
    setBusy(true)
    await onSave(form)
    setBusy(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const inputCls =
    'w-full rounded-2xl border-2 border-cocoa-100 bg-white px-4 py-3 text-sm font-semibold text-cocoa-900 outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100'

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-cocoa-900">Campaign Settings</h1>
      <p className="text-sm font-medium text-cocoa-400">Control the cashback campaign and customer-facing copy</p>

      <div className="mt-5 space-y-4">
        {/* Cashback */}
        <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-cocoa-100 bg-white p-6 shadow-soft">
          <h2 className="flex items-center gap-2 font-display text-base font-extrabold text-cocoa-900">
            <IndianRupee size={16} className="text-gold-600" /> Cashback Amount
          </h2>
          <div className="mt-4 max-w-[220px]">
            <Field label="Amount (₹)" hint="The reward customers receive after verification.">
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-black text-cocoa-400">₹</span>
                <input
                  type="number"
                  min={1}
                  value={form.cashbackAmount}
                  onChange={(e) => set({ cashbackAmount: Math.max(1, Number(e.target.value) || 1) })}
                  className={`${inputCls} pl-9`}
                />
              </div>
            </Field>
          </div>
        </motion.section>

        {/* Campaign status */}
        <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-3xl border border-cocoa-100 bg-white p-6 shadow-soft">
          <h2 className="flex items-center gap-2 font-display text-base font-extrabold text-cocoa-900">
            <Rocket size={16} className="text-brand-500" /> Campaign Status
          </h2>
          <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-cream-50 px-4 py-3.5">
            <div>
              <p className="text-sm font-extrabold text-cocoa-900">{form.campaignActive ? '🟢 Campaign is Active' : '🔴 Campaign is Paused'}</p>
              <p className="text-xs font-medium text-cocoa-400">
                {form.campaignActive ? 'Customers can submit feedback and claim cashback.' : 'Customers see the paused message below.'}
              </p>
            </div>
            <button
              onClick={() => set({ campaignActive: !form.campaignActive })}
              role="switch"
              aria-checked={form.campaignActive}
              className={`relative h-8 w-15 shrink-0 rounded-full transition ${form.campaignActive ? 'bg-emerald-500' : 'bg-cocoa-300'}`}
              style={{ width: 56 }}
            >
              <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${form.campaignActive ? 'left-[28px]' : 'left-1'}`} />
            </button>
          </div>
          {!form.campaignActive && (
            <div className="mt-3">
              <Field label="Paused message" hint="Shown to customers while the campaign is paused.">
                <textarea rows={2} value={form.pausedMessage} onChange={(e) => set({ pausedMessage: e.target.value })} className={`${inputCls} resize-none`} />
              </Field>
            </div>
          )}
        </motion.section>

        {/* Customer copy */}
        <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-3xl border border-cocoa-100 bg-white p-6 shadow-soft">
          <h2 className="flex items-center gap-2 font-display text-base font-extrabold text-cocoa-900">
            <MessageSquareText size={16} className="text-sky-600" /> Customer-Facing Copy
          </h2>
          <div className="mt-4 space-y-4">
            <Field label="Welcome title" hint="The big headline on the welcome screen.">
              <input value={form.welcomeTitle} onChange={(e) => set({ welcomeTitle: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Processing time note" hint="Shown on the cashback form and the success screen.">
              <div className="relative">
                <Timer size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cocoa-300" />
                <input value={form.processingNote} onChange={(e) => set({ processingNote: e.target.value })} className={`${inputCls} pl-10`} />
              </div>
            </Field>
          </div>
        </motion.section>

        {/* Save */}
        <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={busy}
            className={`btn-shine flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-extrabold text-white shadow-pop transition active:scale-[0.97] disabled:opacity-60 ${
              saved ? 'bg-emerald-500' : 'bg-gradient-to-b from-brand-400 to-brand-600 hover:brightness-105'
            }`}
          >
            {busy ? <Spinner size={15} /> : saved ? <>✓ Saved!</> : <><Save size={15} /> Save Settings</>}
          </button>
          <p className="text-[11px] font-medium text-cocoa-300">Changes apply immediately for new visitors.</p>
        </motion.section>

        {/* Security note */}
        <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-3xl border border-cocoa-100 bg-white p-6 shadow-soft">
          <h2 className="flex items-center gap-2 font-display text-base font-extrabold text-cocoa-900">
            <ShieldCheck size={16} className="text-emerald-600" /> Security & Future Roadmap
          </h2>
          <ul className="mt-3 space-y-2 text-xs font-semibold leading-relaxed text-cocoa-500">
            <li>🔐 Admin access is protected by Firebase Authentication + an `admins` whitelist + Firestore/Storage rules — the URL alone grants nothing.</li>
            <li>🚫 Customers can only create submissions; they can never read or list others' data (enforced by security rules).</li>
            <li>🧱 The data model is ready for: item-specific ratings, menu analytics, campaigns, phone/OTP verification, and auto-payments.</li>
            <li>🤖 Future: AI review generation, AI complaint detection, WhatsApp notifications, duplicate screenshot detection.</li>
          </ul>
        </motion.section>
      </div>
    </div>
  )
}
