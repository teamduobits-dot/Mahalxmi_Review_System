import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ClipboardList,
  Clock4,
  IndianRupee,
  RefreshCw,
  Search,
  Star,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import { ImageCell, StatCard } from '../../components/admin'
import { StatusPill } from '../../components/ui'
import { dupeFlagLabel } from '../../lib/dupe'
import { formatDateTime, money, timeAgo } from '../../lib/format'
import { ratingValue } from '../../lib/ratings'

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'underReview', label: 'Under Review' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'paid', label: 'Paid' },
]

const DAY_MS = 24 * 60 * 60 * 1000

export default function Dashboard({ submissions, onRefresh, cashbackAmount = 15 }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState(0)

  // Keep a ticking clock so "today" counts stay fresh while the page is open.
  useEffect(() => {
    queueMicrotask(() => setNow(Date.now()))
    const t = setInterval(() => setNow(Date.now()), 60 * 1000)
    return () => clearInterval(t)
  }, [])

  const stats = useMemo(() => {
    const today = submissions.filter((s) => now - s.createdAtMillis < DAY_MS)
    const pending = submissions.filter((s) => s.status === 'pending')
    const approved = submissions.filter((s) => s.status === 'approved')
    const rejected = submissions.filter((s) => s.status === 'rejected')
    const paid = submissions.filter((s) => s.status === 'paid')
    const dupes = submissions.filter((s) => s.duplicateFlags?.length)
    const settingsCashback = cashbackAmount

    const avg = (field) => {
      const scored = submissions
        .map((s) => ratingValue(s.ratings, field)?.score)
        .filter((v) => typeof v === 'number')
      if (!scored.length) return 0
      return scored.reduce((a, b) => a + b, 0) / scored.length
    }

    return {
      total: submissions.length,
      today: today.length,
      pending: pending.length,
      approved: approved.length,
      rejected: rejected.length,
      paid: paid.length,
      dupes: dupes.length,
      paidAmount: paid.length * settingsCashback,
      pendingAmount: (pending.length + approved.length) * settingsCashback,
      avgOverall: avg('overall'),
      avgTaste: avg('taste'),
      avgPackaging: avg('packaging'),
      avgQuantity: avg('quantity'),
    }
  }, [submissions, now, cashbackAmount])

  const filtered = useMemo(() => {
    let list = submissions
    if (filter !== 'all') list = list.filter((s) => s.status === filter)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (s) =>
          s.reference?.toLowerCase().includes(q) ||
          s.verification?.orderId?.toLowerCase().includes(q) ||
          s.verification?.customerOrderName?.toLowerCase().includes(q) ||
          s.cashback?.upiId?.toLowerCase().includes(q)
      )
    }
    return list
  }, [submissions, filter, search])

  const refresh = async () => {
    setRefreshing(true)
    await onRefresh()
    setTimeout(() => setRefreshing(false), 400)
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-cocoa-900">Dashboard</h1>
          <p className="text-sm font-medium text-cocoa-400">Track feedback & cashback in real time</p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-2xl border border-cocoa-200 bg-white px-4 py-2.5 text-sm font-bold text-cocoa-600 shadow-soft transition hover:border-brand-300 hover:text-brand-600 active:scale-95 disabled:opacity-60"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Top statistics */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={<ClipboardList size={19} />} label="Total Submissions" value={stats.total} sub={`${stats.today} today`} tone="brand" delay={0} />
        <StatCard icon={<Clock4 size={19} />} label="Pending" value={stats.pending} sub={`${stats.dupes} potential duplicates`} tone="gold" delay={0.05} />
        <StatCard icon={<CheckCircle2 size={19} />} label="Approved" value={stats.approved} sub="awaiting payment" tone="green" delay={0.1} />
        <StatCard icon={<XCircle size={19} />} label="Rejected" value={stats.rejected} sub="not valid" tone="red" delay={0.15} />
        <StatCard icon={<Banknote size={19} />} label="Paid" value={stats.paid} sub={money(stats.paidAmount)} tone="blue" delay={0.2} />
        <StatCard icon={<IndianRupee size={19} />} label="Pending Cashback" value={money(stats.pendingAmount)} sub="approved + pending" tone="cocoa" delay={0.25} />
      </div>

      {/* Ratings strip */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Overall', value: stats.avgOverall, max: 5 },
          { label: 'Taste', value: stats.avgTaste, max: 5 },
          { label: 'Packaging', value: stats.avgPackaging, max: 5 },
          { label: 'Quantity', value: stats.avgQuantity, max: 4 },
        ].map((r, i) => (
          <motion.div
            key={r.label}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 + i * 0.05 }}
            className="flex items-center gap-3 rounded-3xl border border-cocoa-100 bg-white p-4 shadow-soft"
          >
            <span className="text-xl">{['⭐', '😋', '📦', '🍔'][i]}</span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-cocoa-400">{r.label}</p>
              <p className="flex items-baseline gap-1 font-display text-xl font-extrabold text-cocoa-900">
                {stats.total ? r.value.toFixed(1) : '—'}
                <span className="text-xs font-bold text-cocoa-300">/ {r.max}</span>
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Duplicates alert */}
      {stats.dupes > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-4 flex items-center gap-3 rounded-3xl border border-gold-200 bg-gold-50 px-4 py-3.5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gold-500/15 text-gold-600">
            <AlertTriangle size={18} />
          </span>
          <div className="flex-1 text-sm">
            <p className="font-extrabold text-gold-700">🚨 {stats.dupes} potential duplicate{stats.dupes > 1 ? 's' : ''} flagged</p>
            <p className="text-xs font-medium text-gold-600/80">Review carefully before approving — duplicates are never auto-rejected.</p>
          </div>
          <button onClick={() => setFilter('pending')} className="rounded-xl bg-gold-500 px-3 py-2 text-xs font-black text-white transition hover:bg-gold-600">
            Review
          </button>
        </motion.div>
      )}

      {/* Table */}
      <div className="mt-6 overflow-hidden rounded-3xl border border-cocoa-100 bg-white shadow-soft">
        <div className="flex flex-wrap items-center gap-2 border-b border-cocoa-100 p-4">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  filter === f.id ? 'bg-cocoa-900 text-white' : 'bg-cream-100 text-cocoa-500 hover:bg-cocoa-200/50'
                }`}
              >
                {f.label}
                {f.id !== 'all' && (
                  <span className="ml-1.5 text-[10px] opacity-60">
                    {submissions.filter((s) => s.status === f.id).length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full sm:w-64">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-cocoa-300" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reference, order ID, name, UPI…"
              className="w-full rounded-2xl border border-cocoa-200/70 bg-cream-50/50 py-2.5 pl-10 pr-3 text-xs font-semibold outline-none transition placeholder:text-cocoa-300 focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
            />
          </div>
        </div>

        <div className="thin-scroll overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-cocoa-100 text-[11px] font-black uppercase tracking-wider text-cocoa-400">
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Order ID / Name</th>
                <th className="px-4 py-3">Overall</th>
                <th className="px-4 py-3">Screenshot</th>
                <th className="px-4 py-3">Cashback</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const overall = ratingValue(s.ratings, 'overall')
                return (
                  <tr key={s.submissionId} className="group border-b border-cocoa-50 transition hover:bg-brand-50/40">
                    <td className="px-4 py-3">
                      <a href={`#/submission/${s.submissionId}`} className="font-mono text-xs font-extrabold text-brand-600 underline-offset-2 hover:underline">
                        {s.reference}
                      </a>
                      {s.duplicateFlags?.length > 0 && (
                        <span className="ml-1.5 rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-black text-gold-700" title={s.duplicateFlags.map(dupeFlagLabel).join(', ')}>
                          🚨 {dupeFlagLabel(s.duplicateFlags[0])}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-cocoa-500">
                      {formatDateTime(s.createdAtMillis)}
                      <span className="block text-[10px] text-cocoa-300">{timeAgo(s.createdAtMillis)}</span>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-cocoa-700">
                      {s.verification?.method === 'name' ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="rounded-md bg-cream-100 px-1.5 py-0.5 text-[10px] font-black text-cocoa-400">NAME</span>
                          {s.verification.customerOrderName || '—'}
                        </span>
                      ) : (
                        <span className="font-mono">{s.verification?.orderId || '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {overall ? (
                        <span className="inline-flex items-center gap-1 text-xs font-extrabold text-cocoa-800">
                          <Star size={13} className="text-gold-500" fill="currentColor" />
                          {overall.score}.0
                          <span className="text-sm">{overall.emoji}</span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ImageCell src={s.reviewScreenshotUrl} alt={`${s.reference} screenshot`} />
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-cocoa-700">
                      {s.cashback?.method === 'qr' ? (
                        <span className="inline-flex items-center gap-1.5">
                          <ImageCell src={s.cashback.upiQrImageUrl} className="h-7 w-7" /> QR
                        </span>
                      ) : (
                        <span className="font-mono">{s.cashback?.upiId || '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={s.status} />
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center">
                    <p className="text-3xl">🍽️</p>
                    <p className="mt-2 text-sm font-bold text-cocoa-500">No submissions here yet</p>
                    <p className="text-xs font-medium text-cocoa-300">New feedback will show up as soon as customers submit.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-cocoa-100 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-cocoa-400">
              <TrendingUp size={13} /> {filtered.length} of {submissions.length} submissions
            </p>
            <p className="text-[11px] font-medium text-cocoa-300">Click any row to manage →</p>
          </div>
        )}
      </div>
    </div>
  )
}
