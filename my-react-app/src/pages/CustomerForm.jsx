import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowUpRight,
  CreditCard,
  Gift,
  QrCode,
  ChevronDown,
  ChevronUp,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Upload,
  UserRound,
} from 'lucide-react'
import FloatingFood from '../components/FloatingFood'
import FoodIcon from '../components/FoodIcon'
import { ErrorBox, ImageUpload, SectionCard, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { money, validUpiId } from '../lib/format'

const SWIGGY_URL = 'https://www.swiggy.com/'
const TOING_URL = 'https://www.toingit.com/'
// Minimum branded splash time before the page appears (kept short so the app
// still feels fast — it only pads a quick settings load, never blocks a slow one).
const SPLASH_MS = 900

const INITIAL_FORM = {
  customerName: '',
  orderLast4: '',
  payoutMethod: 'upi',
  upiId: '',
  reviewScreenshot: null,
  upiQr: null,
}

const STEP_ITEMS = [
  {
    number: '1',
    title: 'Post rating + small comment',
    subtitle: 'Written comment in Swiggy or Toing is mandatory',
    icon: 'pizza',
    tint: 'from-brand-50 to-white',
  },
  {
    number: '2',
    title: 'Upload proof + order details',
    subtitle: 'Review screenshot, same name and Order ID last 4 digits',
    icon: 'burger',
    tint: 'from-gold-50 to-white',
  },
  {
    number: '3',
    title: 'Receive your cashback',
    subtitle: 'Share UPI ID or upload only your UPI QR image',
    icon: 'drink',
    tint: 'from-emerald-50 to-white',
  },
]

export default function CustomerForm() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState(null)
  const [settingsError, setSettingsError] = useState(null)
  const [form, setForm] = useState(INITIAL_FORM)
  const [touched, setTouched] = useState({})
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [jumpMode, setJumpMode] = useState('to-steps')
  const stepsRef = useRef(null)
  const formRef = useRef(null)
  const scrollAnimationRef = useRef(null)

  // Initial settings load. State updates happen only inside promise callbacks,
  // and a failed load is recorded in `settingsError` (network vs. other) so
  // the failure screen can say exactly what is wrong and offer a retry.
  useEffect(() => {
    let active = true
    let timer
    const startedAt = Date.now()

    api
      .getSettings()
      .then((data) => {
        if (!active) return
        setSettings(data)
        setSettingsError(null)
      })
      .catch((loadError) => {
        if (!active) return
        setSettingsError({
          message: loadError?.message || 'Unable to load the cashback form.',
          isNetwork: Boolean(loadError?.isNetwork),
        })
      })
      .finally(() => {
        // Always keep at least the short branded splash before showing the page.
        const elapsed = Date.now() - startedAt
        timer = window.setTimeout(() => {
          if (active) setLoading(false)
        }, Math.max(0, SPLASH_MS - elapsed))
      })

    return () => {
      active = false
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  const retrySettings = () => {
    setLoading(true)
    setError('')
    setSettingsError(null)
    const startedAt = Date.now()
    api
      .getSettings()
      .then((data) => setSettings(data))
      .catch((loadError) => {
        setSettingsError({
          message: loadError?.message || 'Unable to load the cashback form.',
          isNetwork: Boolean(loadError?.isNetwork),
        })
      })
      .finally(() => {
        const elapsed = Date.now() - startedAt
        window.setTimeout(() => setLoading(false), Math.max(0, SPLASH_MS - elapsed))
      })
  }

  const validations = useMemo(() => {
    const nameOk = form.customerName.trim().length >= 2
    const last4Ok = /^\d{4}$/.test(form.orderLast4.trim())
    const screenshotOk = Boolean(form.reviewScreenshot?.file)
    const upiBaseOk = form.payoutMethod === 'upi' ? validUpiId(form.upiId.trim()) : Boolean(form.upiQr?.file)
    return { nameOk, last4Ok, screenshotOk, upiBaseOk }
  }, [form])

  const canSubmit = validations.nameOk && validations.last4Ok && validations.screenshotOk && validations.upiBaseOk

  const setField = (patch) => setForm((current) => ({ ...current, ...patch }))

  const handlePayoutMethod = (method) => {
    setField({ payoutMethod: method })
  }

  const handleQrUpload = async (value) => {
    setField({ upiQr: value })
  }

  const handleQrRemove = () => {
    setField({ upiQr: null })
  }

  const animateScrollTo = (targetY, duration = 520) => {
    if (scrollAnimationRef.current) {
      window.cancelAnimationFrame(scrollAnimationRef.current)
    }

    const startY = window.scrollY
    const distance = targetY - startY
    if (Math.abs(distance) < 4) return

    const startedAt = performance.now()
    // easeOut: fast start, gentle landing — feels immediate on click.
    const easeOutCubic = (value) => 1 - (1 - value) ** 3

    const frame = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration)
      // IMPORTANT: 'instant', not 'auto'. With `scroll-behavior: smooth` in CSS,
      // 'auto' re-smooths EVERY animation frame — the page lags behind and the
      // scroll feels delayed/rubber-banded. 'instant' bypasses the CSS smoothing.
      window.scrollTo({ top: startY + distance * easeOutCubic(progress), behavior: 'instant' })
      if (progress < 1) {
        scrollAnimationRef.current = window.requestAnimationFrame(frame)
      } else {
        scrollAnimationRef.current = null
      }
    }

    scrollAnimationRef.current = window.requestAnimationFrame(frame)
  }

  const scrollToSection = (ref) => {
    const section = ref.current
    if (!section) return
    const sectionTop = window.scrollY + section.getBoundingClientRect().top - 18
    animateScrollTo(Math.max(0, sectionTop))
  }

  useEffect(() => {
    return () => {
      if (scrollAnimationRef.current) {
        window.cancelAnimationFrame(scrollAnimationRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (loading) return undefined

    const updateJumpMode = () => {
      const triggerLine = window.innerHeight * 0.32
      const stepsTop = stepsRef.current?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY
      const formTop = formRef.current?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY

      if (formTop <= triggerLine) {
        setJumpMode('back-to-steps')
        return
      }
      if (stepsTop <= triggerLine) {
        setJumpMode('to-form')
        return
      }
      setJumpMode('to-steps')
    }

    updateJumpMode()
    window.addEventListener('scroll', updateJumpMode, { passive: true })
    window.addEventListener('resize', updateJumpMode)

    return () => {
      window.removeEventListener('scroll', updateJumpMode)
      window.removeEventListener('resize', updateJumpMode)
    }
  }, [loading])

  const isBackToSteps = jumpMode === 'back-to-steps'
  const isToForm = jumpMode === 'to-form'
  const JumpIcon = isBackToSteps ? ChevronUp : ChevronDown
  const jumpLabel = isToForm ? 'Form' : 'Steps'
  const jumpButtonClass = isBackToSteps
    ? 'border-white/90 bg-white/95 text-cocoa-900 shadow-card'
    : 'border-brand-200 bg-brand-500 text-white shadow-pop'
  const jumpIconClass = isBackToSteps ? 'bg-cocoa-900 text-white' : 'bg-white/18 text-white'

  const handleJumpClick = () => {
    if (isBackToSteps) {
      scrollToSection(stepsRef)
      return
    }
    if (isToForm) {
      scrollToSection(formRef)
      return
    }
    scrollToSection(stepsRef)
  }

  const submit = async () => {
    setTouched({ customerName: true, orderLast4: true, reviewScreenshot: true, upi: true })
    if (!canSubmit || busy) return

    setBusy(true)
    setError('')
    try {
      const payload = new FormData()
      payload.set('customerName', form.customerName.trim())
      payload.set('orderLast4', form.orderLast4.trim())
      payload.set('payoutMethod', form.payoutMethod)
      payload.set('reviewScreenshot', form.reviewScreenshot.file)
      if (form.payoutMethod === 'upi') payload.set('upiId', form.upiId.trim())
      if (form.payoutMethod === 'qr' && form.upiQr?.file) payload.set('upiQr', form.upiQr.file)

      const response = await api.createSubmission(payload)
      setForm(INITIAL_FORM)
      setTouched({})
      // Dedicated success page (its own route) — the reference travels in
      // router state, so a direct visit to /success just redirects home.
      navigate('/success', {
        state: {
          reference: response.reference,
          note: settings.successNote,
          businessName: settings.businessName,
        },
      })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <OpeningLoader brandName={settings?.businessName || 'Mahalaxmi Multi Cuisine'} />
  }

  if (!settings) {
    const isNetwork = Boolean(settingsError?.isNetwork)
    return (
      <div className="relative min-h-screen overflow-hidden surface-warm px-4 py-8 sm:px-6">
        <FloatingFood count={4} opacity={0.14} />
        <main className="relative z-10 mx-auto max-w-md pt-safe">
          <SectionCard className="mt-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-red-50 text-3xl">{isNetwork ? '📡' : '⚠️'}</div>
            <h1 className="mt-4 font-display text-2xl font-extrabold text-cocoa-950 sm:text-3xl">
              {isNetwork ? 'Cannot reach the backend' : 'Unable to open cashback form'}
            </h1>
            <p className="mt-2 text-sm font-medium leading-relaxed text-cocoa-500 sm:text-base">
              {isNetwork
                ? 'The form could not connect to the Mahalaxmi backend API. If you are running locally, start the backend on port 8000 (uvicorn main:app) and make sure you are opening the Vite dev URL on port 5173, then press Retry.'
                : `Something went wrong while loading the form. ${settingsError?.message || 'Please retry.'}`}
            </p>
            {error ? <div className="mt-4"><ErrorBox>{error}</ErrorBox></div> : null}
            <button
              type="button"
              onClick={retrySettings}
              disabled={loading}
              className="mt-4 w-full rounded-2xl bg-cocoa-900 px-4 py-3.5 text-sm font-extrabold text-white transition hover:bg-cocoa-800 disabled:opacity-60 sm:text-base"
            >
              {loading ? 'Checking…' : 'Retry'}
            </button>
          </SectionCard>
        </main>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden surface-warm">
      <div aria-hidden className="pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full bg-brand-200/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-24 top-16 h-80 w-80 rounded-full bg-gold-200/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-[radial-gradient(circle_at_bottom,_rgba(255,196,31,0.12),_transparent_55%)]" />
      <FloatingFood count={6} opacity={0.16} />

      <main className="relative z-10 mx-auto w-full max-w-3xl px-4 pb-28 pt-safe sm:px-6 lg:max-w-4xl">
        <section className="mx-auto max-w-2xl pt-4 text-center lg:max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-4 py-2 text-xs font-extrabold text-cocoa-900 shadow-soft backdrop-blur-sm sm:text-sm"
          >
            <Sparkles size={14} className="text-brand-500" />
            {settings.businessName}
          </motion.div>

          <div className="relative mx-auto mt-5 max-w-xl lg:max-w-2xl">
            <motion.div
              aria-hidden
              animate={{ y: [0, -8, 0], rotate: [-10, 6, -10] }}
              transition={{ repeat: Infinity, duration: 3.8, ease: 'easeInOut' }}
              className="absolute -left-1 top-0 hidden rounded-2xl bg-white/85 p-2 shadow-soft sm:block"
            >
              <FoodIcon type="burger" size={26} />
            </motion.div>
            <motion.div
              aria-hidden
              animate={{ y: [0, -10, 0], rotate: [8, -8, 8] }}
              transition={{ repeat: Infinity, duration: 4.2, ease: 'easeInOut', delay: 0.3 }}
              className="absolute -right-1 top-6 hidden rounded-2xl bg-white/85 p-2 shadow-soft sm:block"
            >
              <FoodIcon type="pizza" size={26} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.45, delay: 0.05 }}
              className="rounded-[2rem] border border-white/75 bg-white/72 px-4 py-5 shadow-card backdrop-blur-sm sm:px-6 sm:py-6"
            >
              <div className="mx-auto mb-3 flex w-fit items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-brand-700 sm:text-xs">
                <Gift size={14} /> Genuine review reward
              </div>
              <h1 className="font-display text-[2rem] font-black leading-[1.05] tracking-tight text-cocoa-950 sm:text-5xl">
                <span className="block">🎉 Rate Us, Get</span>
                <span className="mt-1 block text-gradient-brand">{money(settings.cashbackAmount)} Cashback Now</span>
                <span className="mt-1 block text-cocoa-950">&amp; <span className="text-gradient-gold">₹40 Flat OFF!</span></span>
              </h1>
            </motion.div>
          </div>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, delay: 0.12 }}
            className="mx-auto mt-4 max-w-xl text-sm font-medium leading-7 text-cocoa-600 sm:text-base sm:leading-8 lg:max-w-2xl lg:text-lg"
          >
            Share your genuine experience and enjoy {money(settings.cashbackAmount)} cashback today, plus ₹40 OFF on your next order above ₹499. First post your real rating and a small written comment in Swiggy or Toing, then upload that submitted review screenshot here.
          </motion.p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <OfferPill icon={Gift} tone="gold">Flat Cashback: {money(settings.cashbackAmount)}</OfferPill>
            <OfferPill icon={Sparkles} tone="brand">₹40 OFF on next order above ₹499</OfferPill>
            <OfferPill icon={ShieldCheck} tone="emerald">Only 3 quick steps</OfferPill>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.18 }}
            className="mx-auto mt-4 max-w-xl rounded-[1.6rem] border border-amber-200 bg-amber-50/90 px-4 py-3 text-left shadow-soft sm:px-5 sm:py-4 lg:max-w-2xl"
          >
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700 sm:text-xs">Important for cashback</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-amber-900 sm:text-base sm:leading-7">
              A small written comment in the ordering app is mandatory. If the screenshot shows only a rating and no written comment, cashback will not be eligible.
            </p>
          </motion.div>
        </section>

        {!settings.campaignActive ? (
          <SectionCard className="mx-auto mt-8 max-w-2xl text-center lg:max-w-3xl">
            <div className="text-5xl">⏸️</div>
            <h2 className="mt-4 font-display text-2xl font-extrabold text-cocoa-900 sm:text-3xl">Cashback is paused</h2>
            <p className="mt-2 text-sm font-medium text-cocoa-500 sm:text-base">{settings.pauseMessage}</p>
          </SectionCard>
        ) : (
          <>
            <SectionCard ref={stepsRef} className="mx-auto mt-7 max-w-2xl p-4 sm:p-6 lg:max-w-3xl">
              <div className="mb-4 text-center">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-600 sm:text-xs">How it works</p>
                <h2 className="mt-2 font-display text-2xl font-extrabold text-cocoa-950 sm:text-3xl">3 easy steps</h2>
                <p className="mt-1 text-sm font-medium text-cocoa-500 sm:text-base">Quick, clear and easy on mobile.</p>
              </div>

              <div className="grid justify-items-center gap-3 sm:grid-cols-3 sm:gap-4">
                {STEP_ITEMS.map((step, index) => (
                  <motion.div
                    key={step.number}
                    initial={{ opacity: 0, y: 18, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.38, delay: 0.08 * index }}
                    className={`relative w-full max-w-sm overflow-hidden rounded-[1.85rem] border border-white bg-gradient-to-b ${step.tint} p-4 text-center shadow-soft sm:p-5`}
                    style={{ animation: `float ${8 + index}s ease-in-out ${index * 0.45}s infinite` }}
                  >
                    <div className="absolute inset-x-6 top-0 h-20 rounded-full bg-white/70 blur-2xl" />
                    <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-soft sm:h-16 sm:w-16">
                      <FoodIcon type={step.icon} size={30} />
                    </div>
                    <span className="relative mt-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-sm font-black text-white shadow-soft sm:h-11 sm:w-11 sm:text-base">
                      {step.number}
                    </span>
                    <p className="relative mt-3 text-[1rem] font-extrabold leading-6 text-cocoa-900 sm:mt-4 sm:text-lg sm:leading-7">{step.title}</p>
                    <p className="relative mt-1 text-xs font-medium leading-5 text-cocoa-500 sm:text-sm sm:leading-6">{step.subtitle}</p>
                  </motion.div>
                ))}
              </div>
            </SectionCard>

            <SectionCard ref={formRef} className="mx-auto mt-6 max-w-2xl p-4 sm:p-6 lg:max-w-3xl">
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 shadow-soft sm:h-14 sm:w-14">
                  <Upload size={19} />
                </span>
                <div>
                  <h2 className="font-display text-xl font-extrabold text-cocoa-950 sm:text-2xl">Claim your cashback</h2>
                  <p className="mt-1 text-sm font-medium leading-6 text-cocoa-500 sm:text-base sm:leading-7">
                    Upload the review proof, add order details and get cashback in one smooth flow.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-5">
                <div className="rounded-[1.75rem] border border-cocoa-100 bg-cream-50/85 p-4 shadow-soft sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="text-center sm:text-left">
                      <p className="text-[11px] font-black uppercase tracking-wider text-cocoa-500 sm:text-xs">Step 1 · Review screenshot *</p>
                      <p className="mt-1 text-xs font-medium leading-5 text-cocoa-500 sm:text-sm sm:leading-6">
                        Upload the submitted review screenshot from the same app where you placed the order. The screenshot must clearly show your rating and small written comment.
                      </p>
                    </div>
                    <div className="grid gap-2 sm:min-w-[255px]">
                      <PlatformCard brand="swiggy" label="Open Swiggy" href={SWIGGY_URL} />
                      <PlatformCard brand="toing" label="Open Toing" href={TOING_URL} />
                    </div>
                  </div>

                  <div className="mt-4">
                    <ImageUpload
                      label="Upload submitted review screenshot"
                      hint="Review/rating proof from Swiggy or Toing"
                      value={form.reviewScreenshot}
                      onChange={(value) => setField({ reviewScreenshot: value })}
                      onRemove={() => setField({ reviewScreenshot: null })}
                    />
                  </div>
                  <p className="mt-2 text-[11px] font-medium leading-5 text-cocoa-400 sm:text-xs sm:leading-6">
                    Your written review/comment must already be posted in the ordering app and visible in the screenshot. No separate comment is needed here, but cashback is valid only when the ordering app comment is visible.
                  </p>
                  {touched.reviewScreenshot && !validations.screenshotOk ? <p className="mt-2 text-xs font-semibold text-red-600 sm:text-sm">Review screenshot is required.</p> : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-[11px] font-black uppercase tracking-wider text-cocoa-500 sm:text-xs">Step 2 · Name used for the order *</label>
                    <div className="relative mt-1.5">
                      <UserRound size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cocoa-300" />
                      <input
                        value={form.customerName}
                        onChange={(event) => setField({ customerName: event.target.value })}
                        onBlur={() => setTouched((current) => ({ ...current, customerName: true }))}
                        placeholder="Enter the same name used in the app"
                        className={`w-full rounded-2xl border-2 bg-white py-3.5 pl-11 pr-4 text-sm font-semibold outline-none transition sm:py-4 sm:text-base ${touched.customerName && !validations.nameOk ? 'border-red-300 ring-4 ring-red-50' : 'border-cocoa-200/80 focus:border-brand-400 focus:ring-4 focus:ring-brand-100'}`}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] font-medium leading-5 text-cocoa-400 sm:text-xs sm:leading-6">Use the same customer name shown on your order in Swiggy or Toing.</p>
                    {touched.customerName && !validations.nameOk ? <p className="mt-1.5 text-xs font-semibold text-red-600 sm:text-sm">Please enter the order name.</p> : null}
                  </div>

                  <div>
                    <label className="text-[11px] font-black uppercase tracking-wider text-cocoa-500 sm:text-xs">Step 2 · Order ID last 4 digits *</label>
                    <input
                      value={form.orderLast4}
                      onChange={(event) => setField({ orderLast4: event.target.value.replace(/\D/g, '').slice(0, 4) })}
                      onBlur={() => setTouched((current) => ({ ...current, orderLast4: true }))}
                      inputMode="numeric"
                      placeholder="e.g. 4582"
                      className={`mt-1.5 w-full rounded-2xl border-2 bg-white px-4 py-3.5 text-center text-sm font-semibold tracking-[0.28em] outline-none transition sm:py-4 sm:text-base ${touched.orderLast4 && !validations.last4Ok ? 'border-red-300 ring-4 ring-red-50' : 'border-cocoa-200/80 focus:border-brand-400 focus:ring-4 focus:ring-brand-100'}`}
                    />
                    <p className="mt-1.5 text-[11px] font-medium leading-5 text-cocoa-400 sm:text-xs sm:leading-6">You can find it on the package sticker/label or in your ordering app order details.</p>
                    {touched.orderLast4 && !validations.last4Ok ? <p className="mt-1.5 text-xs font-semibold text-red-600 sm:text-sm">Please enter exactly 4 digits.</p> : null}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-black uppercase tracking-wider text-cocoa-500 sm:text-xs">Step 3 · Receive cashback via *</label>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => handlePayoutMethod('upi')}
                      className={`rounded-[1.7rem] border-2 p-4 text-left transition sm:p-5 ${form.payoutMethod === 'upi' ? 'border-brand-500 bg-brand-50 shadow-pop' : 'border-cocoa-200 bg-white hover:border-brand-300'}`}
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 sm:h-12 sm:w-12">
                        <CreditCard size={18} />
                      </span>
                      <p className="mt-3 text-sm font-extrabold text-cocoa-900 sm:text-base">UPI ID</p>
                      <p className="text-xs font-medium text-cocoa-400 sm:text-sm">Best for quick transfer</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePayoutMethod('qr')}
                      className={`rounded-[1.7rem] border-2 p-4 text-left transition sm:p-5 ${form.payoutMethod === 'qr' ? 'border-brand-500 bg-brand-50 shadow-pop' : 'border-cocoa-200 bg-white hover:border-brand-300'}`}
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gold-500/10 text-gold-600 sm:h-12 sm:w-12">
                        <QrCode size={18} />
                      </span>
                      <p className="mt-3 text-sm font-extrabold text-cocoa-900 sm:text-base">UPI QR</p>
                      <p className="text-xs font-medium text-cocoa-400 sm:text-sm">Upload only your QR image</p>
                    </button>
                  </div>
                </div>

                {form.payoutMethod === 'upi' ? (
                  <div>
                    <label className="text-[11px] font-black uppercase tracking-wider text-cocoa-500 sm:text-xs">UPI ID *</label>
                    <input
                      value={form.upiId}
                      onChange={(event) => setField({ upiId: event.target.value })}
                      onBlur={() => setTouched((current) => ({ ...current, upi: true }))}
                      placeholder="yourname@upi"
                      className={`mt-1.5 w-full rounded-2xl border-2 bg-white px-4 py-3.5 text-sm font-semibold outline-none transition sm:py-4 sm:text-base ${touched.upi && !validations.upiBaseOk ? 'border-red-300 ring-4 ring-red-50' : 'border-cocoa-200/80 focus:border-brand-400 focus:ring-4 focus:ring-brand-100'}`}
                    />
                    <p className="mt-1.5 text-[11px] font-medium leading-5 text-cocoa-400 sm:text-xs sm:leading-6">Enter the UPI ID where you want to receive the cashback amount.</p>
                    {touched.upi && !validations.upiBaseOk ? <p className="mt-1.5 text-xs font-semibold text-red-600 sm:text-sm">Please enter a valid UPI ID.</p> : null}
                  </div>
                ) : (
                  <div>
                    <label className="text-[11px] font-black uppercase tracking-wider text-cocoa-500 sm:text-xs">UPI QR image *</label>
                    <p className="mt-1.5 text-[11px] font-medium leading-5 text-cocoa-400 sm:text-xs sm:leading-6">Upload only your UPI QR image for cashback payment.</p>
                    <div className="mt-2">
                      <ImageUpload
                        label="Upload UPI QR image"
                        hint="Only QR image for cashback transfer"
                        value={form.upiQr}
                        onChange={handleQrUpload}
                        onRemove={handleQrRemove}
                      />
                    </div>
                    {touched.upi && !validations.upiBaseOk ? <p className="mt-1.5 text-xs font-semibold text-red-600 sm:text-sm">Please upload your UPI QR image.</p> : null}
                  </div>
                )}

                {error ? <ErrorBox>{error}</ErrorBox> : null}

                <button
                  type="button"
                  onClick={submit}
                  disabled={busy}
                  className={`btn-shine flex w-full items-center justify-center gap-2 rounded-[1.8rem] px-6 py-4 text-base font-extrabold text-white transition sm:py-5 sm:text-lg ${canSubmit ? 'bg-gradient-to-b from-brand-400 to-brand-600 shadow-pop hover:brightness-105' : 'bg-cocoa-300'} ${busy ? 'opacity-80' : ''}`}
                >
                  {busy ? <Spinner size={18} /> : <Gift size={18} />}
                  Submit cashback request
                </button>
              </div>
            </SectionCard>

            <div className="mx-auto mt-6 max-w-2xl lg:max-w-3xl">
              <Link
                to="/status"
                className="group flex items-center gap-3 rounded-[1.8rem] border border-white/80 bg-white/80 px-5 py-4 shadow-soft backdrop-blur-sm transition hover:border-brand-300"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold-500/10 text-gold-600 sm:h-12 sm:w-12">
                  <Search size={18} />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-extrabold text-cocoa-900 sm:text-base">Already submitted?</span>
                  <span className="block text-xs font-medium text-cocoa-400 sm:text-sm">Track your cashback status with your reference ID.</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-brand-600 transition group-hover:translate-x-0.5 sm:text-base">
                  Track <ArrowUpRight size={16} />
                </span>
              </Link>
            </div>

            <motion.button
              type="button"
              onClick={handleJumpClick}
              initial={{ opacity: 0, scale: 0.9, y: 18 }}
              animate={{
                opacity: 1,
                scale: 1,
                y: [0, -4, 0],
                boxShadow: ['0 10px 30px rgba(239,66,9,0.16)', '0 18px 40px rgba(239,66,9,0.28)', '0 10px 30px rgba(239,66,9,0.16)'],
              }}
              transition={{
                duration: 0.35,
                y: { repeat: Infinity, duration: 2.8, ease: 'easeInOut' },
                boxShadow: { repeat: Infinity, duration: 2.6, ease: 'easeInOut' },
              }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className={`fixed bottom-4 right-4 z-30 flex h-[82px] w-[82px] flex-col items-center justify-center rounded-full border text-[11px] font-black leading-none backdrop-blur-sm transition sm:bottom-6 sm:right-6 sm:h-[88px] sm:w-[88px] sm:text-xs ${jumpButtonClass}`}
              aria-label={`Scroll to ${jumpLabel} section`}
            >
              <motion.span
                key={jumpMode}
                initial={{ rotate: isBackToSteps ? -100 : 100, scale: 0.85, opacity: 0.65 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                transition={{ duration: 0.28 }}
                className={`mb-1.5 flex h-8 w-8 items-center justify-center rounded-full ${jumpIconClass}`}
              >
                <JumpIcon size={16} />
              </motion.span>
              <span className="tracking-[0.06em]">{jumpLabel}</span>
            </motion.button>
          </>
        )}
      </main>
    </div>
  )
}

function OfferPill({ icon: Icon, tone, children }) {
  const tones = {
    gold: 'border-gold-200 bg-gold-50 text-gold-700',
    brand: 'border-brand-200 bg-brand-50 text-brand-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  }

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-black shadow-soft sm:px-5 sm:py-2.5 sm:text-base ${tones[tone] || tones.brand}`}>
      <Icon size={16} /> {children}
    </div>
  )
}

function OpeningLoader({ brandName }) {
  return (
    <div className="relative min-h-screen overflow-hidden surface-warm">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,124,54,0.18),_transparent_36%),radial-gradient(circle_at_bottom,_rgba(255,212,77,0.22),_transparent_32%)]" />
      <FloatingFood count={4} opacity={0.1} />

      <main className="relative z-10 flex min-h-screen items-center justify-center px-5 pt-safe pb-safe">
        <div className="w-full max-w-sm rounded-[2rem] border border-white/80 bg-white/88 p-6 text-center shadow-card backdrop-blur-md">
          <div className="relative mx-auto h-44 w-44">
            <motion.div
              className="absolute inset-0 rounded-full border border-brand-200/80"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 14, ease: 'linear' }}
            />
            <motion.div
              className="absolute inset-5 rounded-full border border-gold-200/90"
              animate={{ rotate: -360 }}
              transition={{ repeat: Infinity, duration: 10, ease: 'linear' }}
            />

            <motion.div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[1.8rem] bg-gradient-to-br from-brand-500 to-gold-400 p-4 shadow-pop"
              animate={{ y: [0, -8, 0], rotate: [-3, 3, -3], scale: [1, 1.03, 1] }}
              transition={{ repeat: Infinity, duration: 2.8, ease: 'easeInOut' }}
            >
              <FoodIcon type="burger" size={64} />
            </motion.div>

            <motion.div
              className="absolute inset-0"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 12, ease: 'linear' }}
            >
              <div className="absolute left-1/2 top-0 -translate-x-1/2 rounded-2xl bg-white p-2 shadow-soft">
                <FoodIcon type="pizza" size={28} />
              </div>
              <div className="absolute bottom-1 left-3 rounded-2xl bg-white p-2 shadow-soft">
                <FoodIcon type="fries" size={28} />
              </div>
              <div className="absolute bottom-3 right-2 rounded-2xl bg-white p-2 shadow-soft">
                <FoodIcon type="drink" size={28} />
              </div>
            </motion.div>

            <motion.div
              className="absolute inset-6"
              animate={{ rotate: -360 }}
              transition={{ repeat: Infinity, duration: 8.5, ease: 'linear' }}
            >
              <div className="absolute left-0 top-1/2 -translate-y-1/2 rounded-2xl bg-cream-50 p-2 shadow-soft">
                <FoodIcon type="taco" size={24} />
              </div>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 rounded-2xl bg-cream-50 p-2 shadow-soft">
                <FoodIcon type="icecream" size={24} />
              </div>
            </motion.div>
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="mt-4 font-display text-2xl font-black tracking-tight text-cocoa-950"
          >
            {brandName}
          </motion.h1>
          <p className="mt-2 text-sm font-semibold text-cocoa-500 sm:text-base">Preparing your cashback form…</p>

          <div className="mt-5 flex items-center justify-center gap-2">
            {[0, 1, 2].map((dot) => (
              <motion.span
                key={dot}
                className="h-2.5 w-2.5 rounded-full bg-brand-500"
                animate={{ y: [0, -8, 0], opacity: [0.45, 1, 0.45] }}
                transition={{ repeat: Infinity, duration: 1, delay: dot * 0.18, ease: 'easeInOut' }}
              />
            ))}
          </div>

        </div>
      </main>
    </div>
  )
}

function PlatformCard({ brand, label, href }) {
  const styles =
    brand === 'swiggy'
      ? {
          wrap: 'border-[#ffd9bc] bg-[#fff7f1] text-[#7a3a06] hover:border-[#fc8019]/45',
          bubble: 'bg-[#fc8019] text-white',
          hint: 'text-[#a66329]',
          mark: 'S',
        }
      : {
          wrap: 'border-[#ffd5eb] bg-[#fff5fb] text-[#7a214e] hover:border-[#ff4fa3]/45',
          bubble: 'bg-gradient-to-br from-[#ff4fa3] to-[#ff7dbf] text-white',
          hint: 'text-[#9f4a75]',
          mark: 'T',
        }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition ${styles.wrap}`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-black shadow-soft ${styles.bubble}`}>
        {styles.mark}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-extrabold leading-5 sm:text-base sm:leading-6">{label}</span>
        <span className={`mt-0.5 flex items-center gap-1 text-[11px] font-semibold sm:text-xs ${styles.hint}`}>
          <Smartphone size={12} /> Tap to open ordered app / site
        </span>
      </span>
      <ArrowUpRight size={16} className="shrink-0 opacity-80" />
    </a>
  )
}
