export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const TOKEN_KEY = 'mm_admin_token'
const AUTH_PATHS = ['/api/auth/me', '/api/auth/login', '/api/auth/google']
const RETRY_DELAY_MS = 700

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore localStorage failures
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
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetchWithRetry(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  })

  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json') ? await response.json() : await response.text()

  if (!response.ok) {
    const message = typeof data === 'string' ? data : data?.detail || 'Request failed.'
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
