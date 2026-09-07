// ============================================================================
// Duplicate detection — flags potential fraud for the admin. Version 1 never
// auto-rejects; it surfaces 🚨 flags on the dashboard and detail page.
// ============================================================================

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9@.\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normUpi(value) {
  return norm(value).replace(/[^a-z0-9@.]+/g, '').trim()
}

export function computeDuplicateFlags(submission, existingSubmissions) {
  const flags = []
  if (!existingSubmissions?.length) return flags

  const others = existingSubmissions.filter(
    (s) => s.submissionId !== submission.submissionId
  )

  const upi = normUpi(submission.cashback?.upiId)
  const orderId = norm(submission.verification?.orderId)
  const name = norm(submission.verification?.customerOrderName)
  const screenshotHash = submission.screenshotHash

  // 1. Same screenshot submitted more than once (strongest signal).
  if (screenshotHash) {
    const sameShot = others.find((s) => s.screenshotHash && s.screenshotHash === screenshotHash)
    if (sameShot) flags.push({ type: 'sameScreenshot', reference: sameShot.submissionId })
  }

  // 2. Same order ID submitted multiple times.
  if (orderId && orderId.length >= 4) {
    const sameOrder = others.find(
      (s) => norm(s.verification?.orderId) === orderId && (s.verification?.method || 'orderId') === 'orderId'
    )
    if (sameOrder) flags.push({ type: 'sameOrderId', reference: sameOrder.submissionId })
  }

  // 3. Same UPI ID used by another submission.
  if (upi && upi.length >= 4) {
    const sameUpi = others.find(
      (s) => s.cashback?.method === 'upi' && normUpi(s.cashback?.upiId) === upi
    )
    if (sameUpi) flags.push({ type: 'sameUpi', reference: sameUpi.submissionId })
  }

  // 4. Same order name used twice in a short window (fuzzy duplicate).
  if (name && name.length >= 3) {
    const sameName = others.find((s) => {
      const other = norm(s.verification?.customerOrderName)
      if (!other || other.length < 3) return false
      const close = other === name || other.includes(name) || name.includes(other)
      const within72h =
        Math.abs((s.createdAtMillis || 0) - (submission.createdAtMillis || 0)) < 72 * 3600 * 1000
      return close && within72h
    })
    if (sameName) flags.push({ type: 'sameName', reference: sameName.submissionId })
  }

  return flags
}

export const DUPE_FLAG_LABELS = {
  sameScreenshot: 'Reused screenshot',
  sameOrderId: 'Duplicate order ID',
  sameUpi: 'Duplicate UPI ID',
  sameName: 'Similar name + recent order',
}

export function dupeFlagLabel(flag) {
  if (!flag?.type) return 'Potential duplicate'
  return DUPE_FLAG_LABELS[flag.type] || flag.type
}
