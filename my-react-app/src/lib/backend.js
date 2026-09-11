// Backend-readiness helpers for Render cold starts.
//
// Strategy: NEVER retry the real submission POST (that could duplicate
// Firestore records + Cloudinary images). Instead, poll ONLY the lightweight
// GET /api/health endpoint until the backend answers, then submit once.
//
// Used in two places, both in CustomerForm:
//   1. Silent pre-warm on page load (non-blocking — the user reads the page
//      while Render wakes up in the background).
//   2. Submit-time wait (form locked, friendly overlay, health checks only).

import { checkBackendHealth } from './api'

// Gentle polling: a health check every 3s is plenty for a ~30-60s Render
// cold start and avoids hammering a waking server.
export const BACKEND_POLL_INTERVAL_MS = 3000
// Give Render's free tier enough room: cold boots can take up to ~60s.
export const BACKEND_READY_TIMEOUT_MS = 90000
// A single health probe should answer fast when the backend is actually up;
// anything slower means "still waking", not "ready".
export const HEALTH_PROBE_TIMEOUT_MS = 8000

function sleepAbortable(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(true)
      return
    }
    if (!signal) {
      window.setTimeout(() => resolve(false), ms)
      return
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve(false)
    }, ms)
    const onAbort = () => {
      window.clearTimeout(timer)
      resolve(true)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

// Poll the health endpoint until the backend answers, the timeout elapses,
// or the caller aborts. Resolves true ONLY when the backend is confirmed
// ready. Never sends user data — health checks carry no payload.
export async function waitForBackendReady({
  signal,
  intervalMs = BACKEND_POLL_INTERVAL_MS,
  timeoutMs = BACKEND_READY_TIMEOUT_MS,
  probeTimeoutMs = HEALTH_PROBE_TIMEOUT_MS,
} = {}) {
  const startedAt = Date.now()
  for (;;) {
    if (signal?.aborted) return false
    const ready = await checkBackendHealth({ timeoutMs: probeTimeoutMs, signal }).catch(() => false)
    if (ready) return true
    if (signal?.aborted) return false
    const elapsed = Date.now() - startedAt
    if (elapsed >= timeoutMs) return false
    const aborted = await sleepAbortable(Math.min(intervalMs, timeoutMs - elapsed), signal)
    if (aborted) return false
  }
}
