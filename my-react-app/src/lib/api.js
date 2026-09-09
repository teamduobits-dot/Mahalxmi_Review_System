const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const TOKEN_KEY = 'mm_admin_token'

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

async function apiFetch(path, options = {}) {
  const token = getToken()
  const headers = new Headers(options.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  })

  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json') ? await response.json() : await response.text()

  if (!response.ok) {
    const message = typeof data === 'string' ? data : data?.detail || 'Request failed.'
    if (response.status === 401) setToken('')
    throw new Error(message)
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
