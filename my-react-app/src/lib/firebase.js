// ============================================================================
// Firebase bootstrap
// ----------------------------------------------------------------------------
// If VITE_FIREBASE_PROJECT_ID is configured, the app runs against real
// Firebase (Firestore + Storage + Auth) — the SDK is loaded lazily only then,
// keeping the customer page as light as possible. Otherwise the app
// automatically falls back to LOCAL DEMO MODE (browser localStorage) so the
// complete flow — including the admin portal — can be explored with zero
// setup. Demo mode is NOT for production.
// ============================================================================

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
}

const useDemo = !firebaseConfig.projectId || !firebaseConfig.apiKey
export const IS_DEMO = useDemo

let fb = null // lazily-initialised Firebase modules (auth, db, storage, helpers)

async function ensureFirebase() {
  if (useDemo) throw new Error('Firebase is not configured — demo mode only')
  if (fb) return fb
  const [appMod, authMod, firestoreMod, storageMod] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
    import('firebase/storage'),
  ])
  const app = appMod.initializeApp(firebaseConfig)
  const auth = authMod.getAuth(app)
  const db = firestoreMod.getFirestore(app)
  const storage = storageMod.getStorage(app)
  fb = { appMod, authMod, firestoreMod, storageMod, auth, db, storage }
  return fb
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

// ----------------------------------------------------------------------------
// Auth
// ----------------------------------------------------------------------------
export async function loginAdmin(email, password) {
  if (useDemo) {
    await delay(600)
    if (email === 'admin@demo.mahalaxmi.in' && password === 'mahalaxmi123') {
      const user = { uid: 'demo-admin', email, displayName: 'Demo Admin' }
      localStorage.setItem('mmc_demo_admin', JSON.stringify(user))
      return user
    }
    throw new Error('Invalid email or password')
  }
  const { auth, authMod, firestoreMod, db } = await ensureFirebase()
  const cred = await authMod.signInWithEmailAndPassword(auth, email, password)
  const snap = await firestoreMod.getDoc(firestoreMod.doc(db, 'admins', cred.user.uid))
  if (!snap.exists() || snap.data().active !== true) {
    await authMod.signOut(auth)
    throw new Error('This account is not authorised as an admin.')
  }
  return cred.user
}

export async function logoutAdmin() {
  if (useDemo) {
    localStorage.removeItem('mmc_demo_admin')
    return
  }
  const { auth, authMod } = await ensureFirebase()
  await authMod.signOut(auth)
}

export function onAdminAuthChange(cb) {
  if (useDemo) {
    const read = () => {
      const raw = localStorage.getItem('mmc_demo_admin')
      cb(raw ? JSON.parse(raw) : null)
    }
    // Defer the first notification so React never receives a synchronous
    // setState during the subscriber setup effect.
    queueMicrotask(read)
    window.addEventListener('storage', (e) => {
      if (e.key === 'mmc_demo_admin') read()
    })
    return () => {}
  }
  let unsub = () => {}
  ensureFirebase().then(({ auth, authMod, firestoreMod, db }) => {
    unsub = authMod.onAuthStateChanged(auth, async (user) => {
      if (!user) return cb(null)
      try {
        const snap = await firestoreMod.getDoc(firestoreMod.doc(db, 'admins', user.uid))
        if (!snap.exists() || snap.data().active !== true) return cb(null)
        cb({ uid: user.uid, email: user.email, displayName: user.displayName })
      } catch {
        cb(null)
      }
    })
  })
  return () => unsub()
}

// ----------------------------------------------------------------------------
// Reference number — MMC-2026-001234
// ----------------------------------------------------------------------------
const REFERENCE_COUNTER = 'mmc_reference_counter'
const DEMO_SUBMISSIONS = 'mmc_demo_submissions'
const DEMO_SETTINGS = 'mmc_demo_settings'

export function nowMillis() {
  return Date.now()
}

export async function nextReferenceNumber() {
  if (useDemo) {
    await delay(400)
    const value = (parseInt(localStorage.getItem(REFERENCE_COUNTER) || '0', 10) || 0) + 1
    localStorage.setItem(REFERENCE_COUNTER, String(value))
    return formatReference(value)
  }
  const { firestoreMod, db } = await ensureFirebase()
  const counterRef = firestoreMod.doc(db, 'counters', 'reference')
  let value = 1
  try {
    await firestoreMod.runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef)
      value = (snap.exists() ? snap.data().value || 0 : 0) + 1
      tx.set(counterRef, { value })
    })
  } catch (err) {
    // Counter doc may not be seeded yet — create it, then retry once.
    if (err?.code === 'not-found' || err?.message?.includes('does not exist')) {
      await firestoreMod.setDoc(counterRef, { value: 1 })
      value = 1
    } else {
      throw err
    }
  }
  return formatReference(value)
}

function formatReference(value) {
  const year = new Date().getFullYear()
  return `MMC-${year}-${String(value).padStart(6, '0')}`
}

// ----------------------------------------------------------------------------
// Submissions — create / list / update / notes
// ----------------------------------------------------------------------------
function demoAll() {
  const raw = localStorage.getItem(DEMO_SUBMISSIONS)
  return raw ? JSON.parse(raw) : []
}

function demoSave(list) {
  localStorage.setItem(DEMO_SUBMISSIONS, JSON.stringify(list))
}

export async function createSubmission(payload) {
  if (useDemo) {
    await delay(1200)
    const list = demoAll()
    list.unshift(payload)
    demoSave(list)
    return payload.submissionId
  }
  const { firestoreMod, db } = await ensureFirebase()
  const { submissionId, ...rest } = payload
  await firestoreMod.setDoc(firestoreMod.doc(db, 'feedbackSubmissions', submissionId), rest)
  return submissionId
}

export async function fetchSubmissions() {
  if (useDemo) {
    await delay(500)
    return demoAll().sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0))
  }
  const { firestoreMod, db } = await ensureFirebase()
  const q = firestoreMod.query(
    firestoreMod.collection(db, 'feedbackSubmissions'),
    firestoreMod.orderBy('createdAtMillis', 'desc'),
    firestoreMod.limit(300)
  )
  const snap = await firestoreMod.getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function updateSubmissionStatus(id, status, adminNotes) {
  const patch = {
    status,
    adminNotes,
    updatedAtMillis: nowMillis(),
    ...(status === 'approved' ? { approvedAtMillis: nowMillis() } : {}),
    ...(status === 'paid' ? { paidAtMillis: nowMillis() } : {}),
  }
  if (useDemo) {
    await delay(350)
    const list = demoAll()
    const idx = list.findIndex((s) => s.submissionId === id)
    if (idx === -1) throw new Error('Submission not found')
    list[idx] = { ...list[idx], ...patch }
    demoSave(list)
    return
  }
  const { firestoreMod, db } = await ensureFirebase()
  await firestoreMod.updateDoc(firestoreMod.doc(db, 'feedbackSubmissions', id), patch)
}

export async function saveAdminNotes(id, adminNotes) {
  if (useDemo) {
    const list = demoAll()
    const idx = list.findIndex((s) => s.submissionId === id)
    if (idx === -1) throw new Error('Submission not found')
    list[idx] = { ...list[idx], adminNotes }
    demoSave(list)
    return
  }
  const { firestoreMod, db } = await ensureFirebase()
  await firestoreMod.updateDoc(firestoreMod.doc(db, 'feedbackSubmissions', id), { adminNotes })
}

// ----------------------------------------------------------------------------
// Campaign settings
// ----------------------------------------------------------------------------
export const DEFAULT_SETTINGS = {
  cashbackAmount: 15,
  currencySymbol: '₹',
  campaignActive: true,
  pausedMessage:
    'We are taking a quick break from the cashback campaign. Your feedback still means the world to us — please check back soon!',
  welcomeTitle: 'Hello Foodie!',
  processingNote: 'Cashback is processed within 24 hours after verification.',
}

export async function fetchSettings() {
  if (useDemo) {
    await delay(120)
    const raw = localStorage.getItem(DEMO_SETTINGS)
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS }
  }
  const { firestoreMod, db } = await ensureFirebase()
  const snap = await firestoreMod.getDoc(firestoreMod.doc(db, 'settings', 'campaign'))
  if (!snap.exists()) return { ...DEFAULT_SETTINGS }
  return { ...DEFAULT_SETTINGS, ...snap.data() }
}

export async function saveSettings(settings) {
  if (useDemo) {
    await delay(250)
    localStorage.setItem(DEMO_SETTINGS, JSON.stringify(settings))
    return
  }
  const { firestoreMod, db } = await ensureFirebase()
  await firestoreMod.setDoc(firestoreMod.doc(db, 'settings', 'campaign'), settings)
}

// ----------------------------------------------------------------------------
// Image upload (with auto compression + demo fallback)
// ----------------------------------------------------------------------------
export async function compressImageFile(file, maxDim = 1400, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url)
        const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Could not process the image.'))
            const ext = mime === 'image/png' ? 'png' : 'jpg'
            const out = new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.${ext}`, { type: mime })
            resolve(out)
          },
          mime,
          quality
        )
      } catch (err) {
        URL.revokeObjectURL(url)
        reject(err)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file does not look like a valid image.'))
    }
    img.src = url
  })
}

export async function uploadSubmissionImage({ submissionId, kind, file }) {
  const compressed = await compressImageFile(file)
  const name = `${kind}-${Date.now()}.${compressed.type === 'image/png' ? 'png' : 'jpg'}`
  const path = `submissions/${submissionId}/${name}`

  if (useDemo) {
    await delay(900)
    const dataUrl = await readAsDataURL(compressed)
    localStorage.setItem(`mmc_img_${path}`, dataUrl)
    return path
  }

  const { storageMod, storage } = await ensureFirebase()
  const r = storageMod.ref(storage, path)
  await storageMod.uploadBytes(r, compressed, { contentType: compressed.type })
  return path
}

export async function resolveImageUrl(pathOrUrl) {
  if (!pathOrUrl) return null
  if (pathOrUrl.startsWith('http') || pathOrUrl.startsWith('data:')) return pathOrUrl
  if (useDemo) return localStorage.getItem(`mmc_img_${pathOrUrl}`) || null
  const { storageMod, storage } = await ensureFirebase()
  return storageMod.getDownloadURL(storageMod.ref(storage, pathOrUrl))
}

export async function resolveImageBlobUrl(pathOrUrl) {
  const url = await resolveImageUrl(pathOrUrl)
  if (!url) return null
  if (useDemo) return url
  const { storageMod, storage } = await ensureFirebase()
  const blob = await storageMod.getBlob(storageMod.ref(storage, pathOrUrl))
  return URL.createObjectURL(blob)
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read the image.'))
    reader.readAsDataURL(file)
  })
}

// ----------------------------------------------------------------------------
// Demo seeding (called on first admin visit in demo mode)
// ----------------------------------------------------------------------------
import { demoSeeds } from './demoData'

export function seedDemoIfEmpty() {
  if (!useDemo) return
  if (localStorage.getItem(DEMO_SUBMISSIONS)) return
  localStorage.setItem(DEMO_SUBMISSIONS, JSON.stringify(demoSeeds()))
}
