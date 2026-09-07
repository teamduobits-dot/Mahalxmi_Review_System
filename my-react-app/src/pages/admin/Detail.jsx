import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Clock4,
  Eye,
  ImageIcon,
  SearchCheck,
  StickyNote,
  XCircle,
} from 'lucide-react'
import { ImageCell, LightboxArea } from '../../components/admin'
import { Spinner, StatusPill } from '../../components/ui'
import { ADMIN_ROUTE } from '../../lib/adminRoute'
import { dupeFlagLabel } from '../../lib/dupe'
import { formatDate, formatDateTime, money } from '../../lib/format'
import { ratingValue } from '../../lib/ratings'

function Field({ label, children }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-wider text-cocoa-400">{label}</p>
      <div className="mt-1 text-sm font-semibold text-cocoa-800">{children}</div>
    </div>
  )
}

function RatingRow({ emoji, label, value, max = 5 }) {
  const meta = value || null
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-cream-50 px-4 py-3">
      <span className="flex items-center gap-2.5 text-sm font-bold text-cocoa-700">
        <span className="text-xl">{emoji}</span> {label}
      </span>
      <span className="flex items-center gap-2">
        {meta ? (
          <>
            <span className="text-[11px] font-black text-cocoa-500">{meta.score}/{max}</span>
            <span className="text-lg">{meta.emoji}</span>
            <span className="text-xs font-extrabold text-cocoa-800">{meta.label}</span>
          </>
        ) : (
          <span className="text-xs font-semibold text-cocoa-300">—</span>
        )}
      </span>
    </div>
  )
}

export default function Detail({ submissions, onStatus, onNotes, cashbackAmount = 15 }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [notes, setNotes] = useState('')

  const submission = submissions.find((s) => s.submissionId === id || s.id === id)

  const duplicates = useMemo(() => {
    if (!submission?.duplicateFlags?.length) return []
    return submission.duplicateFlags
      .map((f) => ({
        label: dupeFlagLabel(f),
        match: submissions.find((s) => s.submissionId === f.reference),
      }))
      .filter((x) => x)
  }, [submission, submissions])

  if (!submission) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="text-3xl">🔎</p>
        <p className="text-sm font-bold text-cocoa-500">Submission not found</p>
        <a href={`#${ADMIN_ROUTE}`} className="text-sm font-bold text-brand-600 underline underline-offset-2">Back to dashboard</a>
      </div>
    )
  }

  const setStatus = async (status) => {
    if (busy) return
    setBusy(true)
    await onStatus(submission.submissionId, status, notes)
    setBusy(false)
  }

  const saveNotes = async () => {
    if (busy) return
    setBusy(true)
    await onNotes(submission.submissionId, notes)
    setBusy(false)
  }

  return (
    <LightboxArea src={lightbox} onClose={() => setLightbox(null)}>
      <div className="mx-auto max-w-6xl">
        <button onClick={() => navigate('..')} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-bold text-cocoa-500 transition hover:text-brand-600">
          <ArrowLeft size={16} /> Back to dashboard
        </button>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-cocoa-900">{submission.reference}</h1>
          <StatusPill status={submission.status} />
          {submission.duplicateFlags?.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-3 py-1 text-xs font-black text-gold-700">
              <AlertTriangle size={13} /> Potential duplicate
            </span>
          )}
        </div>
        <p className="mt-1 text-xs font-semibold text-cocoa-400">
          Submitted {formatDateTime(submission.createdAtMillis)} · {formatDate(submission.createdAtMillis)}
        </p>

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          {/* ------- Left column: feedback + proof ------- */}
          <div className="space-y-5 lg:col-span-2">
            {/* Customer feedback */}
            <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-cocoa-100 bg-white p-5 shadow-soft">
              <h2 className="font-display text-base font-extrabold text-cocoa-900">⭐ Customer Feedback</h2>
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                <RatingRow emoji="⭐" label="Overall experience" value={ratingValue(submission.ratings, 'overall')} />
                <RatingRow emoji="😋" label="Taste" value={ratingValue(submission.ratings, 'taste')} />
                <RatingRow emoji="📦" label="Packaging" value={ratingValue(submission.ratings, 'packaging')} />
                <RatingRow emoji="🍔" label="Quantity" value={ratingValue(submission.ratings, 'quantity')} max={4} />
              </div>
              {submission.improvementFeedback && (
                <div className="mt-4 rounded-2xl border border-gold-200/70 bg-gold-50/60 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gold-600">💬 Improvement comment</p>
                  <p className="mt-1 text-sm font-medium leading-relaxed text-cocoa-800">“{submission.improvementFeedback}”</p>
                </div>
              )}
              <div className="mt-4 rounded-2xl bg-cream-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-cocoa-400">✨ Generated review suggestion</p>
                <p className="mt-1 text-sm font-medium leading-relaxed text-cocoa-700">
                  {submission.editedReview || submission.generatedReview || '—'}
                </p>
                <p className="mt-2 text-[11px] font-semibold text-cocoa-400">
                  Suggested stars: {submission.suggestedStars}/5 · shown to customer as an editable suggestion
                </p>
              </div>
            </motion.section>

            {/* Review proof */}
            <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="rounded-3xl border border-cocoa-100 bg-white p-5 shadow-soft">
              <h2 className="font-display text-base font-extrabold text-cocoa-900">📸 Review Proof</h2>
              <div className="mt-4 flex flex-wrap items-start gap-4">
                {submission.reviewScreenshotUrl ? (
                  <button onClick={() => setLightbox(submission.reviewScreenshotUrl)} className="group relative overflow-hidden rounded-2xl border-2 border-cocoa-100 transition hover:border-brand-400" aria-label="Open screenshot full size">
                    <ImageCell src={submission.reviewScreenshotUrl} className="h-40 w-40" alt="Review screenshot" />
                    <span className="absolute inset-0 flex items-center justify-center bg-cocoa-950/0 transition group-hover:bg-cocoa-950/35">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-cocoa-700 opacity-0 shadow transition group-hover:opacity-100">
                        <Eye size={16} />
                      </span>
                    </span>
                  </button>
                ) : (
                  <span className="flex h-40 w-40 items-center justify-center rounded-2xl bg-cream-100 text-cocoa-300">
                    <ImageIcon size={28} />
                  </span>
                )}
                <div className="flex-1 space-y-2 text-xs font-semibold text-cocoa-500">
                  <p>✔ Uploaded with the submission</p>
                  <p>✔ Verify the rating/review is genuine and matches this order</p>
                  <p>✔ Check the review text matches the suggestion tone (edits are normal)</p>
                  {submission.screenshotHash && (
                    <p className="rounded-lg bg-cream-100 px-2 py-1 font-mono text-[10px] text-cocoa-400">hash {submission.screenshotHash}</p>
                  )}
                  <button onClick={() => setLightbox(submission.reviewScreenshotUrl)} className="rounded-xl border border-cocoa-200 px-3 py-1.5 font-bold text-cocoa-600 transition hover:border-brand-400 hover:text-brand-600">
                    🔍 Open & zoom
                  </button>
                </div>
              </div>
            </motion.section>

            {/* Timeline */}
            <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} className="rounded-3xl border border-cocoa-100 bg-white p-5 shadow-soft">
              <h2 className="font-display text-base font-extrabold text-cocoa-900">🗓️ Timeline</h2>
              <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold">
                <span className="rounded-2xl bg-cream-100 px-3.5 py-2 text-cocoa-600">
                  🛵 Submitted · {formatDateTime(submission.createdAtMillis)}
                </span>
                {submission.approvedAtMillis && (
                  <span className="rounded-2xl bg-emerald-50 px-3.5 py-2 text-emerald-700">
                    ✅ Approved · {formatDateTime(submission.approvedAtMillis)}
                  </span>
                )}
                {submission.paidAtMillis && (
                  <span className="rounded-2xl bg-lime-50 px-3.5 py-2 text-lime-700">
                    💰 Paid · {formatDateTime(submission.paidAtMillis)}
                  </span>
                )}
              </div>
            </motion.section>
          </div>

          {/* ------- Right column: verification + cashback + actions ------- */}
          <div className="space-y-5">
            {/* Order verification */}
            <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="rounded-3xl border border-cocoa-100 bg-white p-5 shadow-soft">
              <h2 className="flex items-center gap-2 font-display text-base font-extrabold text-cocoa-900">
                <SearchCheck size={17} className="text-brand-500" /> Order Verification
              </h2>
              <div className="mt-4 space-y-3">
                {submission.verification?.method === 'name' ? (
                  <Field label="👤 Name used for the order">{submission.verification.customerOrderName || '—'}</Field>
                ) : (
                  <Field label="🔢 Order ID">
                    <span className="font-mono">{submission.verification?.orderId || '—'}</span>
                  </Field>
                )}
                <p className="rounded-2xl bg-cream-50 px-3 py-2 text-[11px] font-semibold text-cocoa-400">
                  Cross-check this against the order details in the review screenshot.
                </p>
              </div>
            </motion.section>

            {/* Cashback details */}
            <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="rounded-3xl border border-cocoa-100 bg-white p-5 shadow-soft">
              <h2 className="flex items-center gap-2 font-display text-base font-extrabold text-cocoa-900">
                <Banknote size={17} className="text-gold-600" /> Cashback Details
              </h2>
              <div className="mt-4 space-y-3">
                {submission.cashback?.method === 'qr' ? (
                  <div>
                    <Field label="📷 UPI QR code uploaded">
                      <button onClick={() => setLightbox(submission.cashback.upiQrImageUrl)} className="transition hover:opacity-80">
                        <ImageCell src={submission.cashback.upiQrImageUrl} className="h-28 w-28" alt="UPI QR" />
                      </button>
                    </Field>
                  </div>
                ) : (
                  <Field label="💳 UPI ID">
                    <span className="font-mono">{submission.cashback?.upiId || '—'}</span>
                  </Field>
                )}
                <p className="rounded-2xl bg-gold-50 px-3 py-2 text-[11px] font-semibold text-gold-700">
                  Amount: {money(cashbackAmount)} — paid manually in Version 1.
                </p>
              </div>
            </motion.section>

            {/* Duplicate flags */}
            {duplicates.length > 0 && (
              <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="rounded-3xl border border-gold-300/70 bg-gold-50 p-5">
                <h2 className="flex items-center gap-2 font-display text-sm font-extrabold text-gold-700">
                  <AlertTriangle size={16} /> Potential Duplicates
                </h2>
                <ul className="mt-3 space-y-2">
                  {duplicates.map((d, i) => (
                    <li key={i} className="rounded-2xl bg-white/80 px-3.5 py-2.5 text-xs font-semibold text-cocoa-700">
                      {d.label}
                      {d.match && (
                        <a href={`#${ADMIN_ROUTE}/submission/${d.match.submissionId}`} className="ml-2 font-mono font-extrabold text-gold-700 underline underline-offset-2">
                          {d.match.reference}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[11px] font-medium text-gold-600/80">
                  Not auto-rejected — use your judgement before approving.
                </p>
              </motion.section>
            )}

            {/* Admin actions */}
            <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-3xl border border-cocoa-100 bg-white p-5 shadow-soft">
              <h2 className="font-display text-base font-extrabold text-cocoa-900">🛠️ Admin Actions</h2>

              {/* Private notes */}
              <div className="mt-4">
                <label htmlFor="notes" className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-cocoa-400">
                  <StickyNote size={12} /> Private admin notes
                </label>
                <textarea
                  id="notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Screenshot verified, ₹15 sent via UPI."
                  className="mt-1.5 w-full resize-none rounded-2xl border-2 border-cocoa-100 bg-cream-50/60 p-3 text-xs font-semibold outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-medium text-cocoa-300">Never shown to customers.</p>
                  <button onClick={saveNotes} disabled={busy} className="rounded-xl bg-cocoa-800 px-3.5 py-2 text-xs font-black text-white transition hover:bg-cocoa-700 disabled:opacity-50">
                    Save note
                  </button>
                </div>
                {submission.adminNotes && (
                  <p className="mt-2 rounded-xl bg-cream-100 px-3 py-2 text-[11px] font-semibold text-cocoa-500">
                    Previous: {submission.adminNotes}
                  </p>
                )}
              </div>

              {/* Status buttons */}
              <div className="mt-5 space-y-2">
                {submission.status !== 'paid' && submission.status !== 'rejected' && submission.status !== 'underReview' && (
                  <button onClick={() => setStatus('underReview')} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-sky-200 bg-sky-50 px-4 py-3 text-sm font-extrabold text-sky-700 transition hover:border-sky-300 active:scale-[0.98] disabled:opacity-50">
                    <Clock4 size={16} /> Start Review
                  </button>
                )}
                {submission.status !== 'paid' && submission.status !== 'rejected' && (
                  <button onClick={() => setStatus('approved')} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-white shadow-soft transition hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50">
                    <CheckCircle2 size={16} /> Approve · Eligible for cashback
                  </button>
                )}
                {submission.status !== 'paid' && submission.status !== 'rejected' && (
                  <button onClick={() => setStatus('rejected')} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-extrabold text-red-600 transition hover:border-red-300 active:scale-[0.98] disabled:opacity-50">
                    <XCircle size={16} /> Reject · Not valid
                  </button>
                )}
                {submission.status === 'approved' && (
                  <button onClick={() => setStatus('paid')} disabled={busy} className="btn-shine flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-lime-500 to-lime-600 px-4 py-3 text-sm font-extrabold text-white shadow-pop transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50">
                    <Banknote size={16} /> Mark as Paid · {money(cashbackAmount)} sent
                  </button>
                )}
                {busy && (
                  <p className="flex items-center justify-center gap-2 py-1 text-xs font-bold text-cocoa-400">
                    <Spinner size={13} className="text-brand-500" /> Updating…
                  </p>
                )}
              </div>

              <div className="mt-4 rounded-2xl bg-cream-50 px-3.5 py-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-cocoa-400">Workflow</p>
                <p className="mt-1 text-[11px] font-semibold leading-relaxed text-cocoa-500">
                  Pending → Under Review → Approve / Reject → send {money(15)} manually → Mark Paid
                </p>
              </div>
            </motion.section>
          </div>
        </div>
      </div>
    </LightboxArea>
  )
}
