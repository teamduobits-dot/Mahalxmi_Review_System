import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, Lightbulb, Star, TrendingUp } from 'lucide-react'
import { MiniBar, StatusPill } from '../../components/ui'
import { AVG_FIELDS, RATINGS } from '../../lib/ratings'
import { formatDay, slugDate } from '../../lib/format'

const DAY = 24 * 60 * 60 * 1000

export default function Analytics({ submissions }) {
  const data = useMemo(() => {
    // Averages per field
    const avgs = AVG_FIELDS.map((f) => {
      const scored = submissions
        .map((s) => {
          const v = s.ratings?.[f.key]
          if (f.key === 'quantity') {
            const map = { less: 1, okay: 2, perfect: 3, more: 4 }
            return map[v] || null
          }
          return RATINGS[v]?.score || null
        })
        .filter((v) => v !== null)
      const sum = scored.reduce((a, b) => a + b, 0)
      return { ...f, value: scored.length ? sum / scored.length : 0, count: scored.length }
    })

    // Overall rating distribution
    const distribution = Object.entries(RATINGS).map(([key, meta]) => ({
      key,
      label: `${meta.emoji} ${meta.label}`,
      count: submissions.filter((s) => s.ratings?.overall === key).length,
      color: key === 'excellent' ? '#16A34A' : key === 'great' ? '#84CC16' : key === 'good' ? '#F5AB05' : key === 'okay' ? '#FB923C' : '#EF4444',
    }))

    // Daily submissions (last 14 days)
    const days = []
    for (let i = 13; i >= 0; i--) {
      const dayStart = new Date()
      dayStart.setHours(0, 0, 0, 0)
      dayStart.setTime(dayStart.getTime() - i * DAY)
      const count = submissions.filter((s) => {
        const d = new Date(s.createdAtMillis)
        return slugDate(d.getTime()) === slugDate(dayStart.getTime())
      }).length
      days.push({ ts: dayStart.getTime(), label: formatDay(dayStart.getTime()), count })
    }
    const maxDay = Math.max(1, ...days.map((d) => d.count))

    // Rating trend (last 14 days, rolling daily average of overall)
    const trend = days.map((d) => {
      const daySubs = submissions.filter((s) => slugDate(s.createdAtMillis) === slugDate(d.ts))
      const overall = daySubs
        .map((s) => RATINGS[s.ratings?.overall]?.score)
        .filter((v) => v)
      const value = overall.length ? overall.reduce((a, b) => a + b, 0) / overall.length : null
      return { ...d, value }
    })

    // Improvement comments
    const comments = submissions
      .filter((s) => s.improvementFeedback?.trim())
      .map((s) => ({
        text: s.improvementFeedback,
        date: s.createdAtMillis,
        reference: s.reference,
        overall: RATINGS[s.ratings?.overall]?.label || '—',
        status: s.status,
      }))
      .sort((a, b) => b.date - a.date)
      .slice(0, 12)

    return { avgs, distribution, days, maxDay, trend, comments }
  }, [submissions])

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-cocoa-900">Analytics</h1>
      <p className="text-sm font-medium text-cocoa-400">What customers are telling you — at a glance</p>

      {/* Rating averages */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-cocoa-100 bg-white p-6 shadow-soft">
          <h2 className="flex items-center gap-2 font-display text-base font-extrabold text-cocoa-900">
            <Star size={16} className="text-gold-500" /> Average Ratings
          </h2>
          <div className="mt-5 space-y-4">
            {data.avgs.map((f) => {
              const max = f.key === 'quantity' ? 4 : 5
              return (
                <MiniBar
                  key={f.key}
                  label={`${f.label} (${f.count} responses)`}
                  value={f.value.toFixed(2)}
                  max={max}
                  color={f.color}
                  right={`${f.value.toFixed(2)} / ${max}`}
                />
              )
            })}
          </div>
          {submissions.length === 0 && <p className="mt-4 text-xs font-semibold text-cocoa-300">No data yet — ratings will appear after the first submissions.</p>}
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="rounded-3xl border border-cocoa-100 bg-white p-6 shadow-soft">
          <h2 className="flex items-center gap-2 font-display text-base font-extrabold text-cocoa-900">
            <BarChart3 size={16} className="text-brand-500" /> Overall Experience Distribution
          </h2>
          <div className="mt-5 space-y-3">
            {data.distribution.map((d) => {
              const max = Math.max(1, ...data.distribution.map((x) => x.count))
              return (
                <div key={d.key} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs font-bold text-cocoa-600">{d.label}</span>
                  <div className="h-6 flex-1 overflow-hidden rounded-lg bg-cream-100">
                    <motion.div
                      className="flex h-full items-center justify-end rounded-lg px-2 text-[10px] font-black text-white"
                      style={{ background: d.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(d.count / max) * 100}%` }}
                      transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
                    >
                      {d.count > 0 ? d.count : ''}
                    </motion.div>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.section>
      </div>

      {/* Trends */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-3xl border border-cocoa-100 bg-white p-6 shadow-soft">
          <h2 className="flex items-center gap-2 font-display text-base font-extrabold text-cocoa-900">
            <TrendingUp size={16} className="text-emerald-600" /> Daily Submissions
          </h2>
          <div className="mt-5 flex h-44 items-end gap-1.5">
            {data.days.map((d, i) => (
              <div key={i} className="group flex flex-1 flex-col items-center justify-end gap-1 self-stretch">
                <span className="text-[10px] font-black text-cocoa-400 opacity-0 transition group-hover:opacity-100">{d.count}</span>
                <motion.div
                  className="w-full rounded-t-lg bg-gradient-to-t from-brand-500 to-brand-300 transition group-hover:from-brand-600 group-hover:to-brand-400"
                  initial={{ height: 0 }}
                  animate={{ height: `${(d.count / data.maxDay) * 100}%` }}
                  transition={{ duration: 0.6, delay: i * 0.02, ease: 'easeOut' }}
                  style={{ minHeight: d.count > 0 ? 6 : 2, background: d.count > 0 ? undefined : '#F1E6D8' }}
                />
                <span className="w-full text-center text-[9px] font-bold text-cocoa-300">{i % 2 === 1 ? d.label : ''}</span>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} className="rounded-3xl border border-cocoa-100 bg-white p-6 shadow-soft">
          <h2 className="font-display text-base font-extrabold text-cocoa-900">📈 Overall Rating Trend</h2>
          <div className="mt-5 flex h-44 items-end gap-1.5">
            {data.trend.map((d, i) => (
              <div key={i} className="group flex flex-1 flex-col items-center justify-end gap-1 self-stretch">
                <span className="text-[10px] font-black text-cocoa-400 opacity-0 transition group-hover:opacity-100">
                  {d.value ? d.value.toFixed(1) : ''}
                </span>
                <motion.div
                  className="w-full rounded-t-lg bg-gradient-to-t from-gold-500 to-gold-300"
                  initial={{ height: 0 }}
                  animate={{ height: `${((d.value || 0) / 5) * 100}%` }}
                  transition={{ duration: 0.6, delay: i * 0.02, ease: 'easeOut' }}
                  style={{ minHeight: 2, background: d.value ? undefined : '#F1E6D8' }}
                />
                <span className="w-full text-center text-[9px] font-bold text-cocoa-300">{i % 2 === 1 ? d.label : ''}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between text-[10px] font-bold text-cocoa-300">
            <span>1 = poor</span>
            <span>5 = excellent</span>
          </div>
        </motion.section>
      </div>

      {/* Improvement comments */}
      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="mt-4 rounded-3xl border border-cocoa-100 bg-white p-6 shadow-soft">
        <h2 className="flex items-center gap-2 font-display text-base font-extrabold text-cocoa-900">
          <Lightbulb size={16} className="text-gold-500" /> What Customers Want Improved
        </h2>
        {data.comments.length === 0 ? (
          <p className="mt-4 text-sm font-semibold text-cocoa-300">No improvement comments yet 🎉</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {data.comments.map((c, i) => (
              <div key={i} className="rounded-2xl border border-cocoa-100 bg-cream-50/60 p-4">
                <p className="text-sm font-medium leading-relaxed text-cocoa-800">“{c.text}”</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[10px] font-bold text-cocoa-400">
                  <span className="rounded-full bg-white px-2 py-0.5 font-mono">{c.reference}</span>
                  <span>{c.overall} overall</span>
                  <StatusPill status={c.status} size="sm" />
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-[11px] font-medium text-cocoa-300">
          Future: item-specific analytics (e.g. “Veg Double Tikki Burger 4.6⭐”) are already supported by the data model.
        </p>
      </motion.section>
    </div>
  )
}
