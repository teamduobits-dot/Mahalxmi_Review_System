import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PauseCircle } from 'lucide-react'
import Welcome from './Welcome'
import Feedback from './Feedback'
import Review from './Review'
import Cashback from './Cashback'
import Success from './Success'
import { ErrorBox, Spinner } from '../components/ui'
import FoodIcon from '../components/FoodIcon'
import {
  createSubmission,
  fetchSettings,
  fetchSubmissions,
  nextReferenceNumber,
  uploadSubmissionImage,
} from '../lib/firebase'
import { computeDuplicateFlags } from '../lib/dupe'
import { imageHash } from '../lib/crypto'
import { clearJourney, loadJourney, saveJourney } from '../lib/storage'
import { uid } from '../lib/format'
import { suggestedStars } from '../lib/ratings'

const STEP_WELCOME = 'welcome'
const STEP_FEEDBACK = 'feedback'
const STEP_REVIEW = 'review'
const STEP_CASHBACK = 'cashback'
const STEP_SUCCESS = 'success'

const EMPTY_RATINGS = { overall: null, taste: null, packaging: null, quantity: null, improvement: '' }

// Rebuild a File from a persisted data-URL (used when the customer returns
// after leaving the site — File objects cannot survive a reload).
function dataUrlToFile(dataUrl, name) {
  const [head, body] = dataUrl.split(',')
  const mime = head?.match(/data:(.*?)(;|$)/)?.[1] || 'image/jpeg'
  const bin = atob(body)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new File([arr], name, { type: mime })
}

export default function FeedbackApp() {
  const [settings, setSettings] = useState(null)
  const [settingsError, setSettingsError] = useState(false)
  const [step, setStep] = useState(STEP_WELCOME)
  const [restored, setRestored] = useState(false)
  const [ratings, setRatings] = useState(EMPTY_RATINGS)
  const [reviewData, setReviewData] = useState(null)
  const [screenshot, setScreenshot] = useState(null)
  const [cashbackData, setCashbackData] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submission, setSubmission] = useState(null)
  const submissionIdRef = useRef(null)

  // Future-ready: different QR codes can carry a campaign ID, e.g.
  // /feedback?campaign=campaignId. Version 1 defaults to the main campaign.
  const [campaignId] = useState(() => {
    try {
      const hash = window.location.hash || ''
      const qIndex = hash.indexOf('?')
      const params = new URLSearchParams(qIndex !== -1 ? hash.slice(qIndex + 1) : '')
      const c = params.get('campaign')
      return c && /^[a-zA-Z0-9_-]{1,40}$/.test(c) ? c : 'v1-cashback-15'
    } catch {
      return 'v1-cashback-15'
    }
  })

  // ---------------- boot: load settings + restored journey ----------------
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const s = await fetchSettings()
        if (!alive) return
        setSettings(s)

        const saved = loadJourney()
        if (saved?.state?.step && saved.state.step !== STEP_WELCOME && saved.state.step !== STEP_SUCCESS) {
          setStep(saved.state.step)
          setRatings(saved.state.ratings || EMPTY_RATINGS)
          setReviewData(saved.state.reviewData || null)
          setScreenshot(saved.state.screenshot || null)
          setCashbackData(saved.state.cashbackData || {})
        }
      } catch {
        if (alive) {
          setSettingsError(true)
          setSettings({ cashbackAmount: 15, currencySymbol: '₹', campaignActive: true })
        }
      } finally {
        if (alive) setRestored(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // ---------------- persistence ----------------
  useEffect(() => {
    if (!restored || !settings) return
    if (step === STEP_WELCOME || step === STEP_SUCCESS) return
    // Only persist serialisable data — File/Blob objects are dropped and the
    // data-URLs keep previews (and re-upload) working after a page reload.
    const persistableImage = (img) =>
      img
        ? { dataUrl: img.dataUrl, fileName: img.fileName }
        : null
    saveJourney({
      state: {
        step,
        ratings,
        reviewData,
        screenshot: persistableImage(screenshot),
        cashbackData: {
          ...cashbackData,
          upiQr: persistableImage(cashbackData.upiQr),
        },
      },
    })
  }, [step, ratings, reviewData, screenshot, cashbackData, restored, settings])

  // ---------------- handlers ----------------
  const handleStart = () => {
    setStep(STEP_FEEDBACK)
    window.scrollTo(0, 0)
  }

  const handleFeedbackComplete = (result) => {
    setReviewData(result)
    setStep(STEP_REVIEW)
  }

  const handleGoToApp = useCallback(() => {
    // Progress is already persisted via the effect above — this button simply
    // lets the customer switch to their food app and come back to the same spot.
    const msg =
      'Your progress is saved on this page. 💾\n\n1) Open your food-ordering app.\n2) Find your order and rate Mahalaxmi Multi Cuisine.\n3) Paste your copied review.\n4) Take a screenshot of it.\n5) Come back to this page — you\'ll continue right where you left off!'
    window.alert(msg)
  }, [])

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const submissionId = submissionIdRef.current || uid('mmc')
      submissionIdRef.current = submissionId

      // Upload screenshot (fresh File, or reconstructed from the persisted
      // data-URL when the customer returned after leaving the site)
      let reviewScreenshotUrl = ''
      let screenshotHash = null
      const screenshotFile = screenshot?.file || (screenshot?.dataUrl ? dataUrlToFile(screenshot.dataUrl, screenshot.fileName || 'review.jpg') : null)
      if (screenshotFile) {
        reviewScreenshotUrl = await uploadSubmissionImage({
          submissionId,
          kind: 'review',
          file: screenshotFile,
        })
        screenshotHash = await imageHash(screenshotFile)
      }

      // Upload UPI QR if chosen
      let upiQrImageUrl = ''
      const upiQrFile =
        cashbackData.upiQr?.file ||
        (cashbackData.upiQr?.dataUrl ? dataUrlToFile(cashbackData.upiQr.dataUrl, cashbackData.upiQr.fileName || 'upiqr.jpg') : null)
      if (cashbackData.cashbackMethod === 'qr' && upiQrFile) {
        upiQrImageUrl = await uploadSubmissionImage({
          submissionId,
          kind: 'upiqr',
          file: upiQrFile,
        })
      }

      // Reference number + duplicate check against existing submissions
      const reference = await nextReferenceNumber()
      const existing = await fetchSubmissions().catch(() => [])

      const payload = {
        submissionId,
        campaignId,
        reference,
        createdAtMillis: Date.now(),
        updatedAtMillis: Date.now(),
        ratings: {
          overall: ratings.overall,
          taste: ratings.taste,
          packaging: ratings.packaging,
          quantity: ratings.quantity,
        },
        improvementFeedback: (ratings.improvement || '').trim(),
        generatedReview: reviewData?.generatedReview || '',
        editedReview: (reviewData?.generatedReview || '').trim(),
        suggestedStars: reviewData?.suggestedStars || suggestedStars(ratings) || 5,
        reviewScreenshotUrl,
        screenshotHash,
        verification: {
          method: cashbackData.method === 'name' ? 'name' : 'orderId',
          orderId: (cashbackData.orderId || '').trim(),
          customerOrderName: (cashbackData.customerOrderName || '').trim(),
        },
        cashback: {
          method: cashbackData.cashbackMethod === 'qr' ? 'qr' : 'upi',
          upiId: cashbackData.cashbackMethod === 'qr' ? '' : (cashbackData.upiId || '').trim(),
          upiQrImageUrl,
        },
        status: 'pending',
        duplicateFlags: [],
        adminNotes: '',
        approvedAtMillis: null,
        paidAtMillis: null,
        meta: {
          campaignName: `${settings.cashbackAmount} Cashback`,
          userAgent: navigator.userAgent.slice(0, 160),
        },
      }
      payload.duplicateFlags = computeDuplicateFlags(payload, existing)

      await createSubmission(payload)
      clearJourney()
      setSubmission({ reference })
      setStep(STEP_SUCCESS)
    } catch (err) {
      console.error(err)
      setSubmitError(
        navigator.onLine
          ? 'We could not submit your request. Please check your connection and try again.'
          : 'Please check your internet connection and try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleRestart = () => {
    setRatings(EMPTY_RATINGS)
    setReviewData(null)
    setScreenshot(null)
    setCashbackData({})
    setSubmission(null)
    submissionIdRef.current = null
    clearJourney()
    setStep(STEP_WELCOME)
  }

  // ---------------- render ----------------
  if (!restored) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center surface-warm">
        <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 1.6, repeat: Infinity }}>
          <FoodIcon type="burger" size={84} />
        </motion.div>
        <p className="mt-4 text-sm font-bold text-cocoa-500">Heating up the grill…</p>
        <div className="mt-3 flex gap-1.5">
          <Spinner className="text-brand-500" />
        </div>
      </div>
    )
  }

  if (settingsError) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-xl items-center px-5">
        <ErrorBox onRetry={() => window.location.reload()}>
          We couldn't reach the kitchen just now. Please check your internet connection and try again.
        </ErrorBox>
      </div>
    )
  }

  if (settings && !settings.campaignActive && step !== STEP_SUCCESS) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center surface-warm px-6 text-center">
        <motion.span
          className="text-6xl"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 13 }}
        >
          🍔
        </motion.span>
        <div className="mt-5 flex items-center gap-2 rounded-full bg-gold-100 px-4 py-1.5 text-xs font-bold text-gold-700">
          <PauseCircle size={14} /> Campaign paused
        </div>
        <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight">We'll be right back!</h1>
        <p className="mt-2 max-w-sm text-sm font-medium text-cocoa-500">
          {settings.pausedMessage || 'The campaign is currently paused. Please check back soon.'}
        </p>
      </div>
    )
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        {step === STEP_WELCOME && <Welcome settings={settings} onStart={handleStart} />}
        {step === STEP_FEEDBACK && (
          <Feedback
            ratings={ratings}
            onChange={setRatings}
            onComplete={handleFeedbackComplete}
            onBack={() => setStep(STEP_WELCOME)}
          />
        )}
        {step === STEP_REVIEW && (
          <Review
            reviewData={reviewData}
            screenshot={screenshot}
            onEditReview={(edited) => setReviewData((d) => ({ ...d, generatedReview: edited }))}
            onBackToFeedback={() => setStep(STEP_FEEDBACK)}
            onGoToApp={handleGoToApp}
            onScreenshot={setScreenshot}
            onRemoveScreenshot={() => setScreenshot(null)}
            onContinue={() => setStep(STEP_CASHBACK)}
          />
        )}
        {step === STEP_CASHBACK && (
          <Cashback
            settings={settings}
            data={cashbackData}
            onChange={(patch) => setCashbackData((d) => ({ ...d, ...patch }))}
            onSubmit={handleSubmit}
            onBack={() => setStep(STEP_REVIEW)}
            submitting={submitting}
            error={submitError}
          />
        )}
        {step === STEP_SUCCESS && submission && (
          <Success submission={submission} settings={settings} onRestart={handleRestart} />
        )}
      </motion.div>
    </AnimatePresence>
  )
}
