// Formatting helpers shared by customer + admin UI

export function formatDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function timeAgo(ts) {
  if (!ts) return '—'
  const time = typeof ts === 'number' ? ts : new Date(ts).getTime()
  if (Number.isNaN(time)) return '—'
  const diff = Date.now() - time
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'yesterday'
  return `${d} days ago`
}

// Human-readable storage sizes: formatBytes(1536) → "1.5 KB"
export function formatBytes(bytes) {
  const n = Number(bytes || 0)
  if (n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  const value = n / 1024 ** index
  const rounded = value >= 100 || index === 0 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded} ${units[index]}`
}

export function formatDay(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function money(amount, symbol = '₹') {
  const n = Number(amount || 0)
  return `${symbol}${n % 1 === 0 ? n.toLocaleString('en-IN') : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

export function validUpiId(value) {
  return /^[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}$/.test((value || '').trim())
}

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export function slugDate(ts) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
