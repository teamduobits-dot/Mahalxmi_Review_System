import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Edit3, ImageDown, Star } from 'lucide-react'
import { AnimatedCheck, CopyButton, ImageUpload, Lightbox, ProgressDots } from '../components/ui'

const instructionSteps = [
  { emoji: '1️⃣', title: 'Open your food-ordering app', desc: 'Open Swiggy, Toing or wherever you placed this order.' },
  { emoji: '2️⃣', title: 'Find your completed order', desc: 'Go to your previous orders and open this one.' },
  { emoji: '3️⃣', title: 'Rate Mahalaxmi Multi Cuisine', desc: 'Leave your genuine rating and paste your review.' },
  { emoji: '4️⃣', title: 'Take a screenshot 📸', desc: 'Capture your submitted rating or review, then come back here.' },
]

export default function Review({
  reviewData,
  onEditReview,
  onBackToFeedback,
  onGoToApp,
  onScreenshot,
  screenshot,
  onRemoveScreenshot,
  onContinue,
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(reviewData.generatedReview)
  const [prevGenerated, setPrevGenerated] = useState(reviewData.generatedReview)
  const [lightbox, setLightbox] = useState(null)
  const hasScreenshot = Boolean(screenshot)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // Keep the draft in sync when the generated review changes (React's
  // recommended "adjust state during render" pattern).
  if (prevGenerated !== reviewData.generatedReview) {
    setPrevGenerated(reviewData.generatedReview)
    setDraft(reviewData.generatedReview)
  }

  const saveEdit = () => {
    onEditReview(draft)
    setEditing(false)
  }

  const suggestedStars = reviewData.suggestedStars || 5

  return (
    <div className="relative min-h-screen surface-warm">
      <div aria-hidden className="pointer-events-none absolute -left-24 top-40 h-80 w-80 rounded-full bg-gold-200/35 blur-3xl animate-drift" />

      <main className="relative z-10 mx-auto w-full max-w-xl px-5 pb-safe pt-safe sm:px-8">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={onBackToFeedback}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cocoa-200/70 bg-white/85 text-cocoa-700 shadow-soft transition hover:text-brand-600 active:scale-90"
            aria-label="Back to questions"
          >
            <ArrowLeft size={19} />
          </button>
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cocoa-400">Almost there</p>
            <ProgressDots current={3} total={4} />
          </div>
          <div className="w-11" aria-hidden />
        </div>

        {/* ---------- PART A — Review suggestion ---------- */}
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 rounded-[2rem] border border-white/90 bg-white/90 p-6 shadow-card backdrop-blur-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-extrabold tracking-tight">✨ Your Review Suggestion</h2>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gold-100 px-2.5 py-1 text-[11px] font-bold text-gold-700">
              <Star size={11} fill="currentColor" /> {suggestedStars}/5 suggested
            </span>
          </div>
          <p className="mt-1 text-xs font-medium text-cocoa-400">
            Based on your honest answers — edit anything you like. Your review, your words. ✍️
          </p>

          <AnimatePresence mode="wait">
            {editing ? (
              <motion.div
                key="edit"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-4"
              >
                <textarea
                  rows={5}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="w-full resize-none rounded-2xl border-2 border-brand-200 bg-brand-50/50 p-4 text-[15px] font-medium leading-relaxed text-cocoa-900 outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                  maxLength={1600}
                  aria-label="Edit your review"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={saveEdit}
                    className="flex-1 rounded-2xl bg-brand-500 px-4 py-3 text-sm font-bold text-white shadow-pop transition hover:bg-brand-600 active:scale-[0.97]"
                  >
                    Save changes
                  </button>
                  <button
                    onClick={() => {
                      setDraft(reviewData.generatedReview)
                      setEditing(false)
                    }}
                    className="rounded-2xl border border-cocoa-200 bg-white px-4 py-3 text-sm font-bold text-cocoa-600 transition hover:border-brand-300 active:scale-[0.97]"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-4"
              >
                <div className="relative rounded-2xl bg-gradient-to-br from-brand-50 to-gold-50 p-4 ring-1 ring-brand-100">
                  <span className="absolute -top-2.5 left-5 rounded-full bg-white px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-brand-500 ring-1 ring-brand-100">
                    Your comment
                  </span>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.15 }}
                    className="text-[15px] font-medium leading-relaxed text-cocoa-800"
                  >
                    {reviewData.generatedReview}
                  </motion.p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <CopyButton
                    text={reviewData.generatedReview}
                    label={
                      <>
                        <ImageDown size={16} /> Copy Comment
                      </>
                    }
                    className="w-full justify-center"
                  />
                  <button
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-cocoa-200 bg-white px-5 py-3 text-sm font-bold text-cocoa-700 transition hover:border-brand-300 hover:text-brand-600 active:scale-[0.97]"
                  >
                    <Edit3 size={15} /> Edit
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* ---------- PART B — Instructions + Go to app ---------- */}
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 rounded-[2rem] border border-white/90 bg-white/90 p-6 shadow-card backdrop-blur-sm"
        >
          <h2 className="font-display text-lg font-extrabold tracking-tight">⭐ Rate & Review Your Order</h2>
          <p className="mt-1 text-xs font-medium text-cocoa-400">Copy your review first, then follow these steps in your food app.</p>

          <ol className="mt-4 space-y-3">
            {instructionSteps.map((s, i) => (
              <motion.li
                key={s.title}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.09 }}
                className="flex gap-3"
              >
                <span className="mt-0.5 text-xl leading-none">{s.emoji}</span>
                <div>
                  <p className="text-sm font-extrabold text-cocoa-900">{s.title}</p>
                  <p className="text-[13px] font-medium leading-snug text-cocoa-500">{s.desc}</p>
                </div>
              </motion.li>
            ))}
          </ol>

          <motion.button
            onClick={onGoToApp}
            whileTap={{ scale: 0.96 }}
            className="btn-shine animate-pulse-glow mt-6 flex w-full items-center justify-center gap-2 rounded-3xl bg-gradient-to-b from-brand-400 to-brand-600 px-6 py-4 text-base font-extrabold text-white"
          >
            <Star size={19} fill="currentColor" /> Go to App & Rate Us
          </motion.button>
          <p className="mt-3 text-center text-[11px] font-medium text-cocoa-400">
            Your progress is saved automatically — come right back here when you're done. 💾
          </p>
        </motion.section>

        {/* ---------- PART C — Screenshot upload ---------- */}
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 rounded-[2rem] border border-white/90 bg-white/90 p-6 shadow-card backdrop-blur-sm"
        >
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-extrabold tracking-tight">
              {hasScreenshot ? '📸 Screenshot Ready!' : '📸 Welcome Back!'}
            </h2>
          </div>
          <p className="mt-1 text-xs font-medium text-cocoa-400">
            {hasScreenshot
              ? 'Your rating/review screenshot is attached. You can replace or remove it below.'
              : 'Upload a screenshot clearly showing your submitted rating or review.'}
          </p>

          <div className="mt-4">
            <ImageUpload
              label={hasScreenshot ? 'Replace screenshot' : 'Upload screenshot'}
              hint="From gallery or camera roll · JPG/PNG"
              value={screenshot}
              onChange={(v) => {
                onScreenshot(v)
                setLightbox(v.previewUrl)
              }}
              onRemove={() => {
                onRemoveScreenshot()
                setLightbox(null)
              }}
            />
          </div>

          {hasScreenshot && (
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                <AnimatedCheck size={26} color="#16A34A" /> Screenshot Uploaded Successfully
              </span>
              <button onClick={() => setLightbox(screenshot?.previewUrl)} className="text-xs font-bold text-emerald-600 underline-offset-2 hover:underline">
                View
              </button>
            </div>
          )}

          <motion.button
            onClick={onContinue}
            disabled={!hasScreenshot}
            whileTap={hasScreenshot ? { scale: 0.96 } : undefined}
            className={`mt-5 flex w-full items-center justify-center gap-2 rounded-3xl px-6 py-4 text-base font-extrabold transition ${
              hasScreenshot
                ? 'bg-cocoa-900 text-white shadow-card hover:bg-cocoa-800'
                : 'cursor-not-allowed bg-cocoa-100 text-cocoa-300'
            }`}
          >
            {hasScreenshot ? (
              <>Continue to cashback 🎁 <ArrowRight size={18} /></>
            ) : (
              'Upload your screenshot to continue'
            )}
          </motion.button>
        </motion.section>
      </main>

      <AnimatePresence>
        {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
      </AnimatePresence>
    </div>
  )
}
