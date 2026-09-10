export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const TOKEN_KEY = 'mm_admin_token'
const TOKEN_COOKIE = 'mm_admin_token'
const AUTH_PATHS = ['/api/auth/me', '/api/auth/login', '/api/auth/google']
const RETRY_DELAY_MS = 700

// In-memory fallback store: sandboxed/embedded preview iframes can block
// localStorage entirely. The memory copy keeps the admin session alive for the
// current page load even when localStorage is unavailable.
let memoryToken = ''

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || memoryToken
  } catch {
    return memoryToken
  }
}

function setToken(token) {
  memoryToken = token || ''
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // localStorage unavailable — the in-memory copy still works
  }
  // Second fallback store: a first-party cookie. Some preview gateways strip
  // the Authorization header but always forward cookies, so the backend also
  // accepts the token from this cookie.
  try {
    if (token) {
      document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=86400`
    } else {
      document.cookie = `${TOKEN_COOKIE}=; Path=/; Max-Age=0`
    }
  } catch {
    // cookies unavailable — headers/query-param channels still apply
  }
}

// Clear the stored admin token (stale tokens survive server restarts when the
// server secret changed; call this whenever we learn the token is invalid).
export function clearToken() {
  setToken('')
}

// Prefix same-origin asset paths (e.g. "/uploads/...") with the API base URL
// so images keep working when the frontend and backend are hosted separately.
export function assetUrl(path) {
  if (!path) return path
  if (!API_BASE) return path
  if (/^(https?:)?\/\//.test(path) || path.startsWith('data:')) return path
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

function isAuthPath(path) {
  return AUTH_PATHS.some((authPath) => path.startsWith(authPath))
}

// Every endpoint in this app answers with JSON. Anything else — Vite's empty
// 502 text/plain when the backend is down, an HTML error/fallback page from a
// proxy or a stale backend — means we are NOT talking to the real API. Treat
// it as "backend unreachable" so the UI shows the proper retry screens
// instead of rendering a fake page (₹0 cashback + "paused" + blank badge)
// or failing silently (empty login error).
function unreachableError(response) {
  const detail = response && response.status ? ` (HTTP ${response.status})` : ''
  const error = new Error(
    `Cannot reach the backend API${detail}. Make sure the backend is running on port 8000, then retry.`
  )
  error.isNetwork = true
  if (response) error.status = response.status
  return error
}

async function fetchWithRetry(path, options) {
  try {
    return await fetch(path, options)
  } catch {
    // Network-level failure (server down, DNS, connection refused). Retry once
    // after a short delay before giving up, so a momentary blip doesn't
    // disconnect the admin UI.
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    try {
      return await fetch(path, options)
    } catch {
      const error = new Error('Cannot reach the server. Make sure the backend is running, then retry.')
      error.isNetwork = true
      throw error
    }
  }
}

async function apiFetch(path, options = {}) {
  const token = getToken()
  const headers = new Headers(options.headers || {})
  if (token) {
    // Send the token two ways: the standard Authorization header and a custom
    // header, because preview gateways/iframe contexts can strip either one.
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('X-Admin-Token', token)
  }

  // Last-resort channel for admin data calls: carry the token in the query
  // string so auth survives even when every header and cookie is stripped.
  let target = `${API_BASE}${path}`
  if (token && path.startsWith('/api/admin')) {
    const sep = target.includes('?') ? '&' : '?'
    target += `${sep}admin_token=${encodeURIComponent(token)}`
  }

  const response = await fetchWithRetry(target, {
    credentials: 'include',
    ...options,
    headers,
  })

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw unreachableError(response)
  }

  let data
  try {
    data = await response.json()
  } catch {
    // JSON content-type but unreadable body — same story: not the real API.
    throw unreachableError(response)
  }

  if (!response.ok) {
    const message = data?.detail || 'Request failed.'
    // Only drop the token when an *auth* endpoint rejects it. A 401 from a
    // data endpoint must never force the user back to the login screen.
    if (response.status === 401 && isAuthPath(path)) setToken('')
    const error = new Error(message)
    error.status = response.status
    throw error
  }

  return data
}

export const api = {
  getSettings: () => apiFetch('/api/settings'),

  createSubmission: (formData) =>
    apiFetch('/api/submissions', {
      method: 'POST',
      body: formData,
    }),

  getSubmissionStatus: (reference) =>
    apiFetch(`/api/submissions/status/${encodeURIComponent(reference)}`),

  login: async (email, password) => {
    const form = new FormData()
    form.set('email', email)
    form.set('password', password)
    const data = await apiFetch('/api/auth/login', { method: 'POST', body: form })
    setToken(data?.token || '')
    return data
  },

  loginWithGoogle: async (credential) => {
    const data = await apiFetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    })
    setToken(data?.token || '')
    return data
  },

  logout: async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } finally {
      setToken('')
    }
  },

  me: () => apiFetch('/api/auth/me'),

  changePassword: (currentPassword, newPassword) => {
    const form = new FormData()
    form.set('currentPassword', currentPassword)
    form.set('newPassword', newPassword)
    return apiFetch('/api/auth/change-password', { method: 'POST', body: form })
  },

  getAdminSettings: () => apiFetch('/api/admin/settings'),

  saveAdminSettings: (payload) =>
    apiFetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  getSubmissions: ({ search = '', status = 'all' } = {}) =>
    apiFetch(`/api/admin/submissions?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`),

  getSubmission: (id) => apiFetch(`/api/admin/submissions/${id}`),

  updateSubmission: (id, payload) =>
    apiFetch(`/api/admin/submissions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
}
