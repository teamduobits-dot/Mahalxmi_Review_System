import { useState } from 'react'
import { ArrowLeft, FileImage, QrCode, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ErrorBox, SectionCard, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { formatBytes } from '../../lib/format'

function StatTile({ icon, label, value, sub, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-500/10 text-brand-600',
    gold: 'bg-gold-500/10 text-gold-600',
    green: 'bg-emerald-500/10 text-emerald-600',
    red: 'bg-red-500/10 text-red-600',
  }
  return (
    <div className="rounded-3xl border border-cocoa-100 bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wider text-cocoa-400">{label}</p>
          <p className="mt-1.5 font-display text-xl font-extrabold tracking-tight text-cocoa-900">{value}</p>
          {sub ? <p className="mt-1 text-[11px] font-semibold text-cocoa-400">{sub}</p> : null}
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tones[tone]}`}>{icon}</span>
      </div>
    </div>
  )
}

export default function Storage({ storage, onRefresh }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const runCleanup = async () => {
    if (!window.confirm('Delete all orphan files (files not attached to any submission)? This cannot be undone.')) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await api.cleanupStorage()
      setMessage(result.message)
      onRefresh?.()
    } catch (cleanupError) {
      setError(cleanupError.message)
    } finally {
      setBusy(false)
    }
  }

  const pct = storage ? Math.max(0, Math.min(100, storage.usedPercent || 0)) : 0
  const barTone = pct >= 90 ? 'from-red-500 to-red-600' : pct >= 70 ? 'from-amber-500 to-amber-600' : 'from-emerald-400 to-emerald-500'

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link to="/admin" className="inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-bold text-cocoa-500 transition hover:text-brand-600">
          <ArrowLeft size={16} /> Back to dashboard
        </Link>
        <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-cocoa-900">Storage</h1>
        <p className="text-sm font-medium text-cocoa-400">
          This page tracks legacy storage only. Cloudinary usage is not included; view it in the Cloudinary console.
        </p>
      </div>

      {error ? <ErrorBox>{error}</ErrorBox> : null}
      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</div>
      ) : null}

      {!storage ? (
        <div className="flex justify-center py-20">
          <Spinner size={24} className="text-brand-500" />
        </div>
      ) : (
        <>
          <SectionCard>
            <h2 className="font-display text-lg font-extrabold text-cocoa-900">Legacy upload storage</h2>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-2xl font-black text-cocoa-900">{formatBytes(storage.usedBytes)}</p>
              <p className="text-sm font-semibold text-cocoa-400">
                of {formatBytes(storage.quotaBytes)} quota ({pct}% used)
              </p>
            </div>
            <div className="mt-3 h-4 overflow-hidden rounded-full bg-cream-100">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${barTone} transition-all`}
                style={{ width: `${pct}%` }}
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Upload storage used"
              />
            </div>
            <p className="mt-2 text-xs font-medium text-cocoa-400">
              Quota: {storage.quotaMb} MB (editable in Settings). {storage.overQuota ? 'You are over quota!' : ''}
            </p>
          </SectionCard>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile icon={<FileImage size={18} />} label="Review screenshots" value={formatBytes(storage.reviewBytes)} sub={`${storage.reviewFiles} file(s)`} tone="brand" />
            <StatTile icon={<QrCode size={18} />} label="UPI QR images" value={formatBytes(storage.qrBytes)} sub={`${storage.qrFiles} file(s)`} tone="gold" />
            <StatTile
              icon={<TriangleAlert size={18} />}
              label="Orphan files"
              value={formatBytes(storage.orphanBytes)}
              sub={`${storage.orphanFiles} file(s)`}
              tone={storage.orphanFiles ? 'red' : 'green'}
            />
            <StatTile icon={<Sparkles size={18} />} label="All files" value={storage.totalFiles} sub={formatBytes(storage.usedBytes)} tone="green" />
          </div>

          <SectionCard>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-base font-extrabold text-cocoa-900">Orphan file cleanup</h2>
                <p className="mt-1 text-xs font-medium leading-5 text-cocoa-400">
                  Removes upload files that no submission references (e.g. left behind by failed submissions). Submitted screenshots are never touched.
                </p>
              </div>
              <button
                onClick={runCleanup}
                disabled={busy || !storage.orphanFiles}
                className="inline-flex shrink-0 items-center gap-2 rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-2.5 text-sm font-extrabold text-red-600 transition hover:border-red-300 disabled:opacity-50"
              >
                {busy ? <Spinner size={16} /> : <Trash2 size={16} />}
                Clean {storage.orphanFiles} orphan file(s)
              </button>
            </div>
          </SectionCard>

          <div className="flex justify-end">
            <button
              onClick={() => onRefresh?.()}
              disabled={busy}
              className="rounded-2xl border border-cocoa-200 bg-white px-4 py-2.5 text-sm font-bold text-cocoa-700 shadow-soft transition hover:border-brand-300 hover:text-brand-600 disabled:opacity-60"
            >
              {busy ? 'Refreshing…' : 'Refresh storage'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
