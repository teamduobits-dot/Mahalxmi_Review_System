import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, IndianRupee, QrCode, Trash2, XCircle } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ImageCell } from '../../components/admin'
import { DuplicateFlag, ErrorBox, LightboxArea, SectionCard, Spinner, StatusPill } from '../../components/ui'
import { api, assetUrl } from '../../lib/api'
import { formatDateTime, money } from '../../lib/format'

export default function Detail({ settings, onUpdated, onDeleted }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [submission, setSubmission] = useState(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    api
      .getSubmission(id)
      .then((data) => {
        setSubmission(data)
        setNotes(data.adminNotes || '')
      })
      .catch((loadError) => setError(loadError.message))
  }, [id])

  const updateSubmission = async (status = submission?.status) => {
    if (!submission || busy) return
    setBusy(true)
    setError('')
    try {
      const updated = await api.updateSubmission(submission.id, {
        status,
        adminNotes: notes,
      })
      setSubmission(updated)
      setNotes(updated.adminNotes || '')
      onUpdated?.()
    } catch (updateError) {
      setError(updateError.message)
    } finally {
      setBusy(false)
    }
  }

  const deleteSubmission = async () => {
    if (!submission || busy) return
    if (
      !window.confirm(
        `Permanently delete ${submission.reference} (${submission.customerName})?\n\nThis removes the submission and its local screenshot/QR files. Cloudinary images are retained. This cannot be undone.`
      )
    ) {
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.deleteSubmission(submission.id)
      onDeleted?.(submission.id)
      navigate('/admin')
    } catch (deleteError) {
      setError(deleteError.message)
      setBusy(false)
    }
  }

  if (error && !submission) {
    return <ErrorBox>{error}</ErrorBox>
  }

  if (!submission) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size={24} className="text-brand-500" />
      </div>
    )
  }

  // assetUrl() prefixes the API base when frontend and backend are hosted
  // separately, so thumbnails/lightbox work in both setups.
  const reviewUrl = assetUrl(submission.reviewScreenshotUrl)
  const qrUrl = assetUrl(submission.upiQrUrl)

  return (
    <LightboxArea src={lightbox} onClose={() => setLightbox(null)}>
      <div className="mx-auto max-w-5xl">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-bold text-cocoa-500 transition hover:text-brand-600">
          <ArrowLeft size={16} /> Back
        </button>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-cocoa-900">{submission.reference}</h1>
          <StatusPill status={submission.status} />
          {submission.flaggedDuplicate ? <DuplicateFlag ofReference={submission.duplicateOf} /> : null}
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <SectionCard>
              <h2 className="font-display text-lg font-extrabold text-cocoa-900">Customer details</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Info label="Customer name" value={submission.customerName} />
                <Info label="Order ID last 4 digits" value={submission.orderLast4} mono />
                <Info label="Ordered via" value={submission.orderedApp ? submission.orderedApp.charAt(0).toUpperCase()+submission.orderedApp.slice(1) : '—'} />
                <Info label="Created" value={formatDateTime(submission.createdAt)} />
                <Info label="Updated" value={formatDateTime(submission.updatedAt)} />
              </div>
            </SectionCard>

            <SectionCard>
              <h2 className="font-display text-lg font-extrabold text-cocoa-900">Review screenshot</h2>
              <button onClick={() => setLightbox(reviewUrl)} className="mt-4 overflow-hidden rounded-3xl border border-cocoa-100 transition hover:opacity-90">
                <ImageCell src={reviewUrl} className="h-72 w-full object-contain" alt="Review screenshot" />
              </button>
            </SectionCard>

            <SectionCard>
              <h2 className="font-display text-lg font-extrabold text-cocoa-900">Payout details</h2>
              <div className="mt-4 space-y-4">
                <div className="rounded-3xl bg-cream-50 p-4">
                  <p className="text-[11px] font-black uppercase tracking-wider text-cocoa-400">Cashback amount</p>
                  <p className="mt-2 text-lg font-extrabold text-cocoa-900">{money(settings?.cashbackAmount || 15)}</p>
                </div>
                {submission.payoutMethod === 'upi' ? (
                  <Info label="UPI ID" value={submission.upiId} mono />
                ) : (
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-cocoa-400">UPI QR</p>
                    <button onClick={() => setLightbox(qrUrl)} className="mt-2 overflow-hidden rounded-3xl border border-cocoa-100 transition hover:opacity-90">
                      <ImageCell src={qrUrl} className="h-56 w-full object-contain" alt="UPI QR" />
                    </button>
                  </div>
                )}
              </div>
            </SectionCard>
          </div>

          <div className="space-y-5">
            <SectionCard>
              <h2 className="font-display text-lg font-extrabold text-cocoa-900">Admin actions</h2>
              <div className="mt-4 space-y-3">
                <button onClick={() => updateSubmission('approved')} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-emerald-600 disabled:opacity-60">
                  <CheckCircle2 size={16} /> Mark approved
                </button>
                <button onClick={() => updateSubmission('paid')} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-lime-600 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-lime-700 disabled:opacity-60">
                  <IndianRupee size={16} /> Mark paid
                </button>
                <button onClick={() => updateSubmission('rejected')} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-extrabold text-red-600 transition hover:border-red-300 disabled:opacity-60">
                  <XCircle size={16} /> Reject request
                </button>
                <div className="my-2 border-t border-cocoa-100" />
                <button onClick={deleteSubmission} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cocoa-900 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-red-600 disabled:opacity-60">
                  <Trash2 size={16} /> Delete permanently
                </button>
              </div>
              {busy && <p className="mt-3 text-xs font-semibold text-cocoa-400">Saving changes...</p>}
            </SectionCard>

            <SectionCard>
              <h2 className="font-display text-lg font-extrabold text-cocoa-900">Admin notes</h2>
              <textarea
                rows={6}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Add notes about payment, verification or follow-up"
                className="mt-4 w-full resize-none rounded-3xl border-2 border-cocoa-100 bg-cream-50/60 p-4 text-sm font-medium outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
              />
              <button onClick={() => updateSubmission()} disabled={busy} className="mt-3 rounded-2xl bg-cocoa-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-cocoa-800 disabled:opacity-60">
                Save notes
              </button>
            </SectionCard>

            {error ? <ErrorBox>{error}</ErrorBox> : null}

            <SectionCard>
              <h2 className="font-display text-lg font-extrabold text-cocoa-900">Quick links</h2>
              <div className="mt-4 grid gap-3">
                <Link to="/admin" className="rounded-2xl border border-cocoa-200 bg-white px-4 py-3 text-sm font-bold text-cocoa-700 transition hover:border-brand-300 hover:text-brand-600">
                  Open dashboard
                </Link>
                {submission.payoutMethod === 'qr' ? (
                  <button onClick={() => setLightbox(qrUrl)} className="rounded-2xl border border-cocoa-200 bg-white px-4 py-3 text-sm font-bold text-cocoa-700 transition hover:border-brand-300 hover:text-brand-600">
                    <span className="inline-flex items-center gap-2"><QrCode size={15} /> View UPI QR</span>
                  </button>
                ) : null}
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </LightboxArea>
  )
}

function Info({ label, value, mono = false, className = '' }) {
  return (
    <div className={`rounded-3xl bg-cream-50 p-4 ${className}`}>
      <p className="text-[11px] font-black uppercase tracking-wider text-cocoa-400">{label}</p>
      <p className={`mt-2 text-sm font-bold text-cocoa-900 ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
    </div>
  )
}
