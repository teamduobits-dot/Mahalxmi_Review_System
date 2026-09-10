import { HardDrive } from 'lucide-react'
import { formatBytes } from '../lib/format'

// Shared storage-usage bar (dashboard + storage page). `stats` comes from
// GET /api/admin/storage: { usedBytes, quotaBytes, quotaMb, usedPercent, overQuota }.
export default function StorageBar({ stats, className = '' }) {
  if (!stats) return null
  const pct = Math.max(0, Math.min(100, stats.usedPercent || 0))
  const tone =
    pct >= 90 ? 'from-red-500 to-red-600 text-red-600'
      : pct >= 70 ? 'from-amber-500 to-amber-600 text-amber-600'
        : 'from-emerald-400 to-emerald-500 text-emerald-600'

  return (
    <div className={`rounded-3xl border border-cocoa-100 bg-white p-4 shadow-soft ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-extrabold text-cocoa-900">
          <HardDrive size={16} className="text-brand-600" /> Upload storage
        </p>
        <p className={`text-xs font-bold ${stats.overQuota ? 'text-red-600' : 'text-cocoa-500'}`}>
          {formatBytes(stats.usedBytes)} of {formatBytes(stats.quotaBytes)} used ({pct}%)
        </p>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-cream-100">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${tone} transition-all`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Upload storage used"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-cocoa-400">
        <span>
          Review screenshots: <span className="text-cocoa-600">{formatBytes(stats.reviewBytes)}</span> · UPI QR:{' '}
          <span className="text-cocoa-600">{formatBytes(stats.qrBytes)}</span>
        </span>
        <span>{stats.totalFiles} file(s) in uploads</span>
      </div>
      {stats.overQuota ? (
        <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
          Storage quota exceeded — free space by deleting submissions or running the orphan-file cleanup.
        </p>
      ) : null}
    </div>
  )
}
