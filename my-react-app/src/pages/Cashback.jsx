import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, CreditCard, Gift, Hash, QrCode, ShieldCheck, UserRound } from 'lucide-react'
import { ErrorBox, FoodLoading, ImageUpload, ProgressDots } from '../components/ui'
import { money, validUpiId } from '../lib/format'

export default function Cashback({ settings, data, onChange, onSubmit, onBack, submitting, error }) {
  const [confirm, setConfirm] = useState(false)
  const [touched, setTouched] = useState({})

  const method = data.method || 'orderId'
  const cashbackMethod = data.cashbackMethod || 'upi'
  const orderId = data.orderId || ''
  const customerName = data.customerOrderName || ''
  const upiId = data.upiId || ''
  const upiQr = data.upiQr || null

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const upiInvalid = touched.upi && upiId.trim() && !validUpiId(upiId)
  const orderIdOk = orderId.trim().length >= 3
  const nameOk = customerName.trim().length >= 2
  const canSubmit =
    confirm &&
    (method === 'orderId' ? orderIdOk : nameOk) &&
    (cashbackMethod === 'upi' ? validUpiId(upiId) : Boolean(upiQr))

  const errors = {
    orderId: touched.orderId && !orderIdOk,
    name: touched.name && !nameOk,
    upi: touched.upi && !validUpiId(upiId),
  }

  const trySubmit = () => {
    setTouched({ orderId: true, name: true, upi: true })
    if (!canSubmit || submitting) return
    onSubmit()
  }

  return (
    <div className="relative min-h-screen surface-warm">
      <div aria-hidden className="pointer-events-none absolute -right-24 bottom-32 h-80 w-80 rounded-full bg-brand-200/30 blur-3xl animate-drift" />

      <main className="relative z-10 mx-auto w-full max-w-xl px-5 pb-safe pt-safe sm:px-8">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cocoa-200/70 bg-white/85 text-cocoa-700 shadow-soft transition hover:text-brand-600 active:scale-90"
            aria-label="Go back"
          >
            <ArrowLeft size={19} />
          </button>
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cocoa-400">Last step</p>
            <ProgressDots current={4} total={4} />
          </div>
          <div className="w-11" aria-hidden />
        </div>

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
          <h1 className="mt-5 text-center font-display text-[1.9rem] font-extrabold leading-tight tracking-tight">
            🔍 Verify & <span className="text-gradient-gold">Claim {money(settings.cashbackAmount)}</span>
          </h1>
          <p className="mt-1.5 text-center text-sm font-medium text-cocoa-500">
            A couple of details so we can verify your order and send your cashback.
          </p>
        </motion.div>

        {/* ---------- SECTION A — Order verification ---------- */}
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 rounded-[2rem] border border-white/90 bg-white/90 p-6 shadow-card backdrop-blur-sm"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
              <ShieldCheck size={18} />
            </span>
            <div>
              <h2 className="font-display text-base font-extrabold tracking-tight">Order Verification</h2>
              <p className="text-[11px] font-medium text-cocoa-400">Helps us prevent fake cashback requests</p>
            </div>
          </div>

          {/* Toggle */}
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-cocoa-100/60 p-1.5">
            {[
              { id: 'orderId', icon: <Hash size={15} />, label: "I know my Order ID" },
              { id: 'name', icon: <UserRound size={15} />, label: "I don't know it" },
            ].map((opt) => {
              const active = method === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => onChange({ method: opt.id })}
                  aria-pressed={active}
                  className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[12.5px] font-bold transition ${
                    active ? 'bg-white text-brand-600 shadow-soft' : 'text-cocoa-500 hover:text-cocoa-700'
                  }`}
                >
                  {opt.icon} {opt.label}
                </button>
              )
            })}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={method}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              {method === 'orderId' ? (
                <div className="mt-4">
                  <label htmlFor="orderId" className="text-xs font-bold uppercase tracking-wide text-cocoa-500">
                    Order ID
                  </label>
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cocoa-300">
                      <Hash size={16} />
                    </span>
                    <input
                      id="orderId"
                      inputMode="numeric"
                      autoComplete="off"
                      value={orderId}
                      onChange={(e) => onChange({ orderId: e.target.value })}
                      onBlur={() => setTouched((t) => ({ ...t, orderId: true }))}
                      placeholder="e.g. 123456789"
                      className={`w-full rounded-2xl border-2 bg-white py-3.5 pl-11 pr-4 text-[15px] font-semibold outline-none transition placeholder:font-medium placeholder:text-cocoa-300 ${
                        errors.orderId ? 'border-red-300 ring-4 ring-red-50' : 'border-cocoa-200/80 focus:border-brand-400 focus:ring-4 focus:ring-brand-100'
                      }`}
                    />
                  </div>
                  {errors.orderId ? (
                    <p className="mt-1.5 text-xs font-semibold text-red-600">Please enter your Order ID from the food app.</p>
                  ) : (
                    <p className="mt-1.5 text-[11px] font-medium text-cocoa-400">Find it in your order details in Swiggy / Toing.</p>
                  )}
                </div>
              ) : (
                <div className="mt-4">
                  <label htmlFor="orderName" className="text-xs font-bold uppercase tracking-wide text-cocoa-500">
                    Name used while placing the order
                  </label>
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cocoa-300">
                      <UserRound size={16} />
                    </span>
                    <input
                      id="orderName"
                      autoComplete="name"
                      value={customerName}
                      onChange={(e) => onChange({ customerOrderName: e.target.value })}
                      onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                      placeholder="e.g. Rahul Sharma"
                      className={`w-full rounded-2xl border-2 bg-white py-3.5 pl-11 pr-4 text-[15px] font-semibold outline-none transition placeholder:font-medium placeholder:text-cocoa-300 ${
                        errors.name ? 'border-red-300 ring-4 ring-red-50' : 'border-cocoa-200/80 focus:border-brand-400 focus:ring-4 focus:ring-brand-100'
                      }`}
                    />
                  </div>
                  {errors.name && <p className="mt-1.5 text-xs font-semibold text-red-600">Please enter the name used for your order.</p>}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.section>

        {/* ---------- SECTION B — Cashback details ---------- */}
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 rounded-[2rem] border border-white/90 bg-white/90 p-6 shadow-card backdrop-blur-sm"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold-50 text-gold-600">
              <Gift size={18} />
            </span>
            <div>
              <h2 className="font-display text-base font-extrabold tracking-tight">Get Your {money(settings.cashbackAmount)} Cashback</h2>
              <p className="text-[11px] font-medium text-cocoa-400">Choose how you'd like to receive it</p>
            </div>
          </div>

          {/* Method cards */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => onChange({ cashbackMethod: 'upi' })}
              aria-pressed={cashbackMethod === 'upi'}
              className={`rounded-2xl border-2 p-3.5 text-left transition ${
                cashbackMethod === 'upi' ? 'border-brand-500 bg-brand-50 shadow-pop' : 'border-cocoa-200/70 bg-white hover:border-brand-300'
              }`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                <CreditCard size={17} />
              </span>
              <p className="mt-2 text-sm font-extrabold text-cocoa-900">Enter UPI ID</p>
              <p className="text-[11px] font-semibold text-cocoa-400">Recommended · fastest</p>
              {cashbackMethod === 'upi' && <span className="mt-1.5 inline-block rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-black text-white">SELECTED</span>}
            </button>
            <button
              onClick={() => onChange({ cashbackMethod: 'qr' })}
              aria-pressed={cashbackMethod === 'qr'}
              className={`rounded-2xl border-2 p-3.5 text-left transition ${
                cashbackMethod === 'qr' ? 'border-brand-500 bg-brand-50 shadow-pop' : 'border-cocoa-200/70 bg-white hover:border-brand-300'
              }`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold-500/10 text-gold-600">
                <QrCode size={17} />
              </span>
              <p className="mt-2 text-sm font-extrabold text-cocoa-900">Upload UPI QR</p>
              <p className="text-[11px] font-semibold text-cocoa-400">We'll scan your QR code</p>
              {cashbackMethod === 'qr' && <span className="mt-1.5 inline-block rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-black text-white">SELECTED</span>}
            </button>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={cashbackMethod}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              {cashbackMethod === 'upi' ? (
                <div className="mt-4">
                  <label htmlFor="upiId" className="text-xs font-bold uppercase tracking-wide text-cocoa-500">
                    Your UPI ID
                  </label>
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cocoa-300">
                      <CreditCard size={16} />
                    </span>
                    <input
                      id="upiId"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={upiId}
                      onChange={(e) => onChange({ upiId: e.target.value })}
                      onBlur={() => setTouched((t) => ({ ...t, upi: true }))}
                      placeholder="yourname@upi"
                      className={`w-full rounded-2xl border-2 bg-white py-3.5 pl-11 pr-4 text-[15px] font-semibold outline-none transition placeholder:font-medium placeholder:text-cocoa-300 ${
                        errors.upi
                          ? 'border-red-300 ring-4 ring-red-50'
                          : upiInvalid
                          ? 'border-gold-300 ring-4 ring-gold-50'
                          : 'border-cocoa-200/80 focus:border-brand-400 focus:ring-4 focus:ring-brand-100'
                      }`}
                    />
                  </div>
                  {errors.upi ? (
                    <p className="mt-1.5 text-xs font-semibold text-red-600">Please enter a valid UPI ID, like name@okhdfc or 98xxxxxx@ybl.</p>
                  ) : (
                    <p className="mt-1.5 text-[11px] font-medium text-cocoa-400">Your cashback will be sent to this UPI ID.</p>
                  )}
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-cocoa-500">📷 Upload Your UPI QR Code</p>
                  <div className="mt-2">
                    <ImageUpload
                      label="Upload UPI QR"
                      hint="Screenshot of your UPI QR code"
                      value={upiQr}
                      onChange={(v) => onChange({ upiQr: v })}
                      onRemove={() => onChange({ upiQr: null })}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.section>

        {/* ---------- Confirm + Submit ---------- */}
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 pb-4"
        >
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-cocoa-200/60 bg-white/70 p-4">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
              className="mt-0.5 h-5 w-5 accent-brand-500"
            />
            <span className="text-[13px] font-semibold leading-snug text-cocoa-700">
              I confirm that the information provided is correct, and I understand my feedback is genuine and honest. ✅
            </span>
          </label>

          {error && !submitting && (
            <div className="mt-4">
              <ErrorBox>{error}</ErrorBox>
            </div>
          )}
          {submitting ? (
            <div className="mt-4 rounded-[2rem] border border-white/90 bg-white/90 p-4 shadow-card">
              <FoodLoading message="Please don't close this page…" />
            </div>
          ) : (
            <motion.button
              onClick={trySubmit}
              whileTap={{ scale: 0.96 }}
              className={`btn-shine mt-4 flex w-full items-center justify-center gap-2 rounded-3xl px-6 py-4.5 text-lg font-extrabold text-white transition ${
                canSubmit
                  ? 'animate-pulse-glow bg-gradient-to-b from-brand-400 to-brand-600 hover:brightness-105'
                  : 'bg-cocoa-200 text-cocoa-400'
              }`}
            >
              🎁 Submit & Claim {money(settings.cashbackAmount)}
            </motion.button>
          )}
          {!confirm && <p className="mt-2 text-center text-[11px] font-medium text-cocoa-400">Tick the confirmation box to submit.</p>}
          {settings.processingNote && !submitting && (
            <p className="mt-3 text-center text-[11px] font-medium text-cocoa-400">⏱️ {settings.processingNote}</p>
          )}
        </motion.section>
      </main>
    </div>
  )
}
