import { useState } from 'react'
import { HardDrive, IndianRupee, Lock, Save, Store } from 'lucide-react'
import { ErrorBox, SectionCard, Spinner } from '../../components/ui'
import { api } from '../../lib/api'

export default function Settings({ settings, onSaved }) {
  const [form, setForm] = useState(settings)
  const [prevSettings, setPrevSettings] = useState(settings)
  const [password, setPassword] = useState({ current: '', next: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  if (settings && settings !== prevSettings) {
    setPrevSettings(settings)
    setForm(settings)
  }

  if (!form) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size={24} className="text-brand-500" />
      </div>
    )
  }

  const setField = (patch) => setForm((current) => ({ ...current, ...patch }))

  const saveSettings = async () => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const updated = await api.saveAdminSettings(form)
      onSaved?.(updated)
      setMessage('Settings saved successfully.')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setBusy(false)
    }
  }

  const changePassword = async () => {
    setError('')
    setMessage('')
    if (!password.current || !password.next || !password.confirm) {
      setError('Please fill all password fields.')
      return
    }
    if (password.next !== password.confirm) {
      setError('New password and confirm password do not match.')
      return
    }
    setBusy(true)
    try {
      await api.changePassword(password.current, password.next)
      setPassword({ current: '', next: '', confirm: '' })
      setMessage('Admin password updated successfully.')
    } catch (changeError) {
      setError(changeError.message)
    } finally {
      setBusy(false)
    }
  }

  const inputClass = 'mt-1.5 w-full rounded-2xl border-2 border-cocoa-100 bg-white px-4 py-3.5 text-sm font-semibold outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100'

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-cocoa-900">Admin settings</h1>
        <p className="text-sm font-medium text-cocoa-400">Manage cashback form copy and your admin password</p>
      </div>

      <SectionCard>
        <div className="flex items-center gap-2">
          <Store size={18} className="text-brand-600" />
          <h2 className="font-display text-lg font-extrabold text-cocoa-900">Customer form settings</h2>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-cocoa-500">Business name</label>
            <input value={form.businessName} onChange={(event) => setField({ businessName: event.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-cocoa-500">Cashback amount</label>
            <div className="relative">
              <IndianRupee size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cocoa-300" />
              <input type="number" min={1} value={form.cashbackAmount} onChange={(event) => setField({ cashbackAmount: Math.max(1, Number(event.target.value) || 1) })} className={`${inputClass} pl-10`} />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-cocoa-500">Upload storage quota (MB)</label>
            <div className="relative">
              <HardDrive size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cocoa-300" />
              <input type="number" min={10} value={form.storageQuotaMb ?? 1024} onChange={(event) => setField({ storageQuotaMb: Math.max(10, Number(event.target.value) || 10) })} className={`${inputClass} pl-10`} />
            </div>
            <p className="mt-1.5 text-[11px] font-medium leading-5 text-cocoa-400">
              Maximum disk space for uploaded screenshots and QR images. See the Storage page for current usage.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-cocoa-500">Success note</label>
            <textarea rows={3} value={form.successNote} onChange={(event) => setField({ successNote: event.target.value })} className={`${inputClass} resize-none`} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-cocoa-500">Pause message</label>
            <textarea rows={3} value={form.pauseMessage} onChange={(event) => setField({ pauseMessage: event.target.value })} className={`${inputClass} resize-none`} />
          </div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-3xl bg-cream-50 px-4 py-4">
            <div>
              <p className="text-sm font-extrabold text-cocoa-900">Campaign status</p>
              <p className="text-xs font-medium text-cocoa-400">Pause customer submissions anytime</p>
            </div>
            <button
              type="button"
              onClick={() => setField({ campaignActive: !form.campaignActive })}
              className={`relative h-8 w-14 rounded-full transition ${form.campaignActive ? 'bg-emerald-500' : 'bg-cocoa-300'}`}
            >
              <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${form.campaignActive ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
        </div>
        <button onClick={saveSettings} disabled={busy} className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-b from-brand-400 to-brand-600 px-5 py-3 text-sm font-extrabold text-white shadow-pop transition hover:brightness-105 disabled:opacity-60">
          {busy ? <Spinner size={16} /> : <Save size={16} />} Save settings
        </button>
      </SectionCard>

      <SectionCard>
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-brand-600" />
          <h2 className="font-display text-lg font-extrabold text-cocoa-900">Change admin password</h2>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-cocoa-500">Current password</label>
            <input type="password" value={password.current} onChange={(event) => setPassword((current) => ({ ...current, current: event.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-cocoa-500">New password</label>
            <input type="password" value={password.next} onChange={(event) => setPassword((current) => ({ ...current, next: event.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-cocoa-500">Confirm password</label>
            <input type="password" value={password.confirm} onChange={(event) => setPassword((current) => ({ ...current, confirm: event.target.value }))} className={inputClass} />
          </div>
        </div>
        <button onClick={changePassword} disabled={busy} className="mt-5 rounded-2xl bg-cocoa-900 px-5 py-3 text-sm font-extrabold text-white transition hover:bg-cocoa-800 disabled:opacity-60">
          {busy ? 'Saving...' : 'Change password'}
        </button>
      </SectionCard>

      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</div> : null}
      {error ? <ErrorBox>{error}</ErrorBox> : null}
    </div>
  )
}
