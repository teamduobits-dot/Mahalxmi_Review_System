import { useMemo, useState } from 'react'
import { CheckCircle2, ClipboardList, IndianRupee, Inbox, Search, Trash2, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ImageCell, StatCard } from '../../components/admin'
import StorageBar from '../../components/StorageBar'
import { DuplicateFlag, ErrorBox, Spinner, StatusPill } from '../../components/ui'
import { assetUrl, api } from '../../lib/api'
import { formatDateTime, money } from '../../lib/format'

const FILTERS = ['all', 'pending', 'approved', 'paid', 'rejected']

export default function Dashboard({ submissions, settings, storage, onDeleted, onRefresh, loading }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [deleteError, setDeleteError] = useState('')

  const filtered = useMemo(() => {
    return submissions.filter((item) => {
      const matchesStatus = filter === 'all' ? true : item.status === filter
      const q = search.trim().toLowerCase()
      const matchesSearch =
        !q ||
        item.reference?.toLowerCase().includes(q) ||
        item.customerName?.toLowerCase().includes(q) ||
        item.orderLast4?.toLowerCase().includes(q) ||
        item.orderedApp?.toLowerCase().includes(q) ||
        item.upiId?.toLowerCase().includes(q)
      return matchesStatus && matchesSearch
    })
  }, [filter, search, submissions])

  const stats = useMemo(() => {
    const total = submissions.length
    const pending = submissions.filter((item) => item.status === 'pending').length
    const approved = submissions.filter((item) => item.status === 'approved').length
    const paid = submissions.filter((item) => item.status === 'paid').length
    const rejected = submissions.filter((item) => item.status === 'rejected').length
    return { total, pending, approved, paid, rejected }
  }, [submissions])

  const handleDelete = async (item) => {
    if (
      !window.confirm(
        `Permanently delete ${item.reference} (${item.customerName})?\n\nThis removes the submission and its local screenshot/QR files. Cloudinary images are retained. This cannot be undone.`
      )
    ) {
      return
    }
    setDeletingId(item.id)
    setDeleteError('')
    try {
      await api.deleteSubmission(item.id)
      onDeleted?.(item.id)
    } catch (deleteErr) {
      setDeleteError(deleteErr.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-cocoa-900">Admin dashboard</h1>
          <p className="text-sm font-medium text-cocoa-400">All cashback submissions saved in the local database</p>
        </div>
        <button
          onClick={onRefresh}
          className="rounded-2xl border border-cocoa-200 bg-white px-4 py-2.5 text-sm font-bold text-cocoa-700 shadow-soft transition hover:border-brand-300 hover:text-brand-600"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard icon={<ClipboardList size={18} />} label="Total" value={stats.total} tone="brand" />
        <StatCard icon={<Wallet size={18} />} label="Pending" value={stats.pending} tone="gold" delay={0.05} />
        <StatCard icon={<CheckCircle2 size={18} />} label="Approved" value={stats.approved} tone="green" delay={0.1} />
        <StatCard icon={<IndianRupee size={18} />} label="Paid" value={stats.paid} sub={money(stats.paid * (settings?.cashbackAmount || 15))} tone="blue" delay={0.15} />
        <StatCard icon={<span className="text-lg">🚫</span>} label="Rejected" value={stats.rejected} tone="red" delay={0.2} />
      </div>

      <StorageBar stats={storage} className="mt-5" />

      {deleteError ? <div className="mt-4"><ErrorBox>{deleteError}</ErrorBox></div> : null}

      <div className="mt-6 rounded-3xl border border-cocoa-100 bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${filter === value ? 'bg-cocoa-900 text-white' : 'bg-cream-100 text-cocoa-600 hover:bg-cocoa-100'}`}
              >
                {value[0].toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full sm:w-72">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-cocoa-300" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search reference, name, order digits, app, UPI..."
              className="w-full rounded-2xl border border-cocoa-200 bg-cream-50/60 py-2.5 pl-10 pr-3 text-xs font-semibold outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
            />
          </div>
        </div>

        <div className="thin-scroll mt-4 overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead>
              <tr className="border-b border-cocoa-100 text-[11px] font-black uppercase tracking-wider text-cocoa-400">
                <th className="px-3 py-3">Reference</th>
                <th className="px-3 py-3">Customer</th>
                <th className="px-3 py-3">Order last 4</th>
                <th className="px-3 py-3">Ordered via</th>
                <th className="px-3 py-3">Review</th>
                <th className="px-3 py-3">Payout</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-b border-cocoa-50 transition hover:bg-brand-50/35">
                  <td className="px-3 py-3">
                    <Link to={`submission/${item.id}`} className="font-mono text-xs font-extrabold text-brand-600 underline-offset-2 hover:underline">
                      {item.reference}
                    </Link>
                  </td>
                  <td className="px-3 py-3 font-semibold text-cocoa-800">{item.customerName}</td>
                  <td className="px-3 py-3 font-mono font-bold text-cocoa-700">{item.orderLast4}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${item.orderedApp === 'swiggy' ? 'border-[#ffd9bc] bg-[#fff7f1] text-[#7a3a06]' : item.orderedApp === 'zomato' ? 'border-[#ffc1c1] bg-[#fff1f1] text-[#7a0f0f]' : item.orderedApp === 'toing' ? 'border-[#ffd5eb] bg-[#fff5fb] text-[#7a214e]' : 'border-cocoa-100 bg-cream-50 text-cocoa-400'}`}>
                      {item.orderedApp ? item.orderedApp.charAt(0).toUpperCase()+item.orderedApp.slice(1) : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <ImageCell src={assetUrl(item.reviewScreenshotUrl)} className="h-12 w-12" alt={`${item.customerName} review`} />
                  </td>
                  <td className="px-3 py-3 text-xs font-semibold text-cocoa-700">
                    {item.payoutMethod === 'upi' ? item.upiId : 'UPI QR uploaded'}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <StatusPill status={item.status} />
                      {item.flaggedDuplicate ? <DuplicateFlag ofReference={item.duplicateOf} /> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs font-semibold text-cocoa-500">{formatDateTime(item.createdAt)}</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => handleDelete(item)}
                      disabled={deletingId !== null}
                      title="Delete permanently"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:border-red-300 hover:bg-red-100 disabled:opacity-50"
                    >
                      {deletingId === item.id ? <Spinner size={13} /> : <Trash2 size={13} />} Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-14 text-center">
                    {submissions.length === 0 ? (
                      <div className="mx-auto max-w-sm">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-cream-100 text-cocoa-300">
                          <Inbox size={26} />
                        </div>
                        <p className="mt-3 text-sm font-bold text-cocoa-600">No submissions yet</p>
                        <p className="mt-1 text-xs font-medium leading-5 text-cocoa-400">
                          This database is fresh, so the dashboard is empty — that is normal, not an error.
                          New cashback claims from the customer form will appear here.
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-cocoa-400">No submissions match your current filter or search.</p>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
