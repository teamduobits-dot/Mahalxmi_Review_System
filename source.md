# source.md — Complete Source Map, Architecture & Operations Guide

> **Purpose:** one-stop reference for understanding this codebase without
> reading every file — written so **any AI agent or developer** can reason
> about the system, run it, extend it, and deploy it safely.
>
> **Generated:** 2026-09-11 · Branch `arena/01a0904c-mahalxmi-review-system`
> (commits `3bf02d0` + `9011046`, PR #9) — reflects the **cloud migration**:
> Firestore + Firebase Storage dual-mode backend.
> **Stack:** React 19 + Vite 8 + Tailwind 4 (frontend) · FastAPI + SQLite **or**
> Cloud Firestore + Firebase Storage (backend, chosen per environment).
> **Companion docs:** `README.md` (quick start), `CLOUD_DEPLOYMENT.md`
> (phase-by-phase production runbook), `PROJECT_ANALYSIS.md` (session history +
> verification verdicts), `WINDOWS_LOCAL_SETUP.md` (PowerShell troubleshooting).

---

## 1. Big picture (60-second version)

A **review-for-cashback campaign tool** for **Mahalaxmi Multi Cuisine**
(Swiggy / Toingit). Customers post a review, upload the screenshot plus name +
order-ID-last-4 + a payout method (UPI ID **or** UPI QR image), and an admin
later approves and pays them ₹cashback.

### 1.1 The two runtime modes (the most important concept)

One FastAPI codebase, two interchangeable data layers behind a **repository
interface**. Routes never know which one is active:

```
                    BACKEND_MODE env var
                          │
        ┌─────────────────┴──────────────────┐
        │ (unset) auto-detect:               │
        │   K_SERVICE present → firebase     │
        │   otherwise         → local        │
        ▼                                    ▼
   LOCAL mode                          FIREBASE mode
   ───────────                         ─────────────
   SQLite backend/mahalaxmi.db         Cloud Firestore
   files in backend/uploads/           Firebase Storage (PRIVATE bucket)
   zero-config development             production on Google Cloud Run
```

- **local** = `database.py` is the repository; images go to `backend/uploads/`
  and are served at public paths `/uploads/<file>` (static mount).
- **firebase** = `firestore_service.py` is the repository; images go to a
  locked-down Storage bucket under `submissions/{uuid}/…` and are served to
  admins only through the authenticated endpoint
  `GET /api/admin/submissions/{id}/files/{kind}`. There are **no public image
  URLs** in this mode — UPI QR codes and screenshots are financial/PII data.

The HTTP API contract (JSON field names, status codes, references like
`MMC-2026-000042`) is **byte-identical in both modes**, so the frontend is
mode-agnostic and local dev needs no Google credentials.

### 1.2 Production architecture (target, fully implemented)

```
CUSTOMER scans QR
   │
   ▼
Firebase Hosting ── https://mahalxmi-review-system.web.app
   │  (static React build: customer form, success, status, admin UI)
   │
   ├── everything except /api/**  → static files (SPA rewrite → index.html)
   └── /api/**  ─────────────────► Google Cloud Run service "mahalxmi-api"
                                        │  FastAPI, BACKEND_MODE=firebase
                                        │  (auto-detected via K_SERVICE)
                                        ├── Cloud Firestore
                                        │     submissions/ admins/ settings/
                                        └── Firebase Storage (private)
                                              submissions/{uuid}/review.jpg
                                              submissions/{uuid}/upi-qr.png
```

Key property: `/api` is rewritten to Cloud Run **by Firebase Hosting itself**
(see `firebase.json`), so the browser sees a single origin — `fetch("/api/…")`
works everywhere, `VITE_API_BASE_URL` stays empty, and there is no CORS.

### 1.3 Local development architecture

```
Browser → http://localhost:5173  (Vite dev server, React)
             │ proxies /api and /uploads (vite.config.js)
             ▼
          http://127.0.0.1:8000  (uvicorn, FastAPI, LOCAL mode)
             ├── SQLite backend/mahalaxmi.db   (created + seeded on first start)
             └── backend/uploads/              (created automatically)
```

---

## 2. Repository map (every file, what it does)

```
Mahalxmi_Review_System/
├── README.md                  Quick start, modes, security notes, deploy summary
├── CLOUD_DEPLOYMENT.md        ★ Phase-by-phase production runbook (Phases 1–10)
├── PROJECT_ANALYSIS.md        Session history; §0A documents the cloud migration
├── WINDOWS_LOCAL_SETUP.md     PowerShell-specific troubleshooting (legacy but valid)
├── source.md                  ★ This document
├── firebase.json              Hosting config + /api/**→Cloud Run rewrite + rules refs
├── .firebaserc                Firebase project alias: mahalxmi-review-system
├── firestore.rules            DENY ALL client access (Admin SDK only)
├── storage.rules              DENY ALL client access (private bucket)
├── deploy-cloud.workflow.yml  Push-to-deploy GitHub Action (see §9.6 — needs moving)
├── package-lock.json          (root npm artifact, currently minimal)
│
├── .github/workflows/
│   └── deploy.yml             LEGACY GitHub Pages deploy (superseded by Firebase
│                              Hosting; kept for the old VPS+Pages pattern)
│
├── backend/                   FastAPI application (Python 3.10+)
│   ├── main.py                876 ln — app factory, middleware, ALL routes
│   ├── database.py            363 ln — env loading, prod gating, SQLite schema +
│   │                          seeding, AND the shared repository interface
│   ├── firestore_service.py   272 ln — Cloud Firestore repository implementation
│   ├── storage_service.py     146 ln — image store: local disk ↔ Firebase Storage
│   ├── firebase_service.py    118 ln — mode detection + Firebase Admin init (ADC)
│   ├── security.py            32 ln — PBKDF2-SHA256 password hashing (120k iters)
│   ├── requirements.txt       fastapi, uvicorn, python-multipart, itsdangerous,
│   │                          firebase-admin (imported only in firebase mode)
│   ├── Dockerfile             Cloud Run image (python:3.12-slim, non-root, $PORT)
│   ├── .dockerignore          excludes .env, *.db, uploads/, __pycache__, .venv
│   └── .env.example           Documented env template (gitignored .env is loaded)
│
├── my-react-app/              React frontend (Vite, Tailwind 4, HashRouter)
│   ├── vite.config.js         Fixed ports (5173 dev / 4173 preview), /api+/uploads
│   │                          proxy, dev CSP headers mirroring production
│   ├── index.html
│   └── src/
│       ├── main.jsx           React root
│       ├── App.jsx            HashRouter routes: /, /success, /status, /admin/*
│       ├── index.css          Tailwind + theme tokens (brand/gold/cocoa/cream)
│       ├── pages/
│       │   ├── CustomerForm.jsx   778 ln — splash, steps, form, uploads, submit
│       │   ├── Success.jsx        235 ln — animated success + reference ID
│       │   ├── Status.jsx         318 ln — public status tracker by reference
│       │   └── admin/
│       │       ├── AdminApp.jsx   367 ln — auth gate, offline detection, sidebar,
│       │       │                       routes /admin, /submission/:id, /settings,
│       │       │                       /storage
│       │       ├── Login.jsx      186 ln — email+password (+ Google if enabled);
│       │       │                       email never pre-filled
│       │       ├── Dashboard.jsx  187 ln — stats, storage bar, table, search/filter,
│       │       │                       delete, duplicate badge
│       │       ├── Detail.jsx     202 ln — one submission: images (lightbox),
│       │       │                       approve/paid/reject, notes, delete, badge
│       │       ├── Settings.jsx   158 ln — customer-facing settings + quota +
│       │       │                       change password
│       │       └── Storage.jsx    145 ln — quota bar, breakdown tiles, orphan cleanup
│       ├── components/
│       │   ├── ui.jsx             225 ln — StatusPill, DuplicateFlag, ErrorBox,
│       │   │                       SectionCard, CopyButton, Lightbox(+Area),
│       │   │                       ImageUpload (client-side compression), Spinner
│       │   ├── admin.jsx          42 ln — StatCard, ImageCell
│       │   ├── StorageBar.jsx     49 ln — dashboard quota bar (green/amber/red)
│       │   ├── FloatingFood.jsx   38 ln — decorative animated food icons
│       │   └── FoodIcon.jsx       131 ln — inline SVG food illustrations
│       └── lib/
│           ├── api.js             225 ln — ALL HTTP calls, token storage channels,
│           │                       "backend unreachable" detection, assetUrl()
│           ├── image.js           93 ln — compressImageFile (canvas resize+quality),
│           │                       inspectQrImage (BarcodeDetector heuristics)
│           ├── format.js          76 ln — money(), formatDateTime(), timeAgo(),
│           │                       formatBytes(), validUpiId()
│           ├── status.js          6 ln — STATUS_META (labels/colors per status)
│           └── adminRoute.js      1 ln — ADMIN_ROUTE = "/admin" (single source)
│
└── tests/                     Verification suites (exit non-zero on failure)
    ├── README.md              How to run both suites
    ├── smoke_local.py         48 checks vs a LIVE local-mode backend over HTTP
    ├── smoke_firebase.py      40 checks vs the real app in firebase mode using
    │                          in-memory fakes (no credentials needed)
    └── fake_firebase.py       In-memory Firestore + Storage fakes
```

Ignored by git (never committed): `backend/.env`, `backend/mahalaxmi.db`,
`backend/uploads/`, `.venv/`, `__pycache__/`, `node_modules/`, `dist/`.

---

## 3. Backend deep dive

### 3.1 Mode selection (`firebase_service.py`)

```python
BACKEND_MODE env:  "firebase"|"firestore"|"cloud"  → firebase
                   "local"|"sqlite"                → local
                   unset → firebase iff K_SERVICE is set (Cloud Run), else local
```

- `IS_FIREBASE_MODE` is computed once at import time.
- `main.py` then does `import firestore_service as repo` or
  `import database as repo` — **this is the entire mode switch**.
- `storage_service.py` imports `IS_FIREBASE_MODE` the same way.
- `ensure_firebase()` initializes `firebase_admin` **lazily** with Application
  Default Credentials, then probes `google.auth.default()` so missing
  credentials fail at startup with an actionable message instead of crashing
  deep in the SDK on the first request.
- All `firebase_admin` imports live inside functions, so **local mode runs
  even if firebase-admin is not installed**.

Relevant env vars: `BACKEND_MODE`, `FIREBASE_PROJECT_ID` (fallback
`GOOGLE_CLOUD_PROJECT`), `FIREBASE_STORAGE_BUCKET`, plus
`GOOGLE_APPLICATION_CREDENTIALS` for local-dev ADC.

### 3.2 The repository interface (`database.py`, bottom section)

Both implementations expose exactly these functions; `main.py` calls only
these. Rows are plain dicts with **snake_case keys + an `id` key** (integer in
SQLite, UUID string in Firestore) and **ISO-8601 UTC string timestamps** in
both modes.

| Function | Notes |
|---|---|
| `init_store()` | SQLite: schema + migrations (`ensure_column`) + seed admin & settings. Firestore: seed `settings/public`, `admins/{email}`, `meta/counters`. |
| `get_settings_row()` / `update_settings(fields)` | Single settings row/doc. |
| `get_admin_by_email(email)` / `set_admin_password(email, hash, token_version, updated_at)` | Admins keyed by lowercase email. |
| `create_submission(fields, doc_id)` | SQLite ignores `doc_id`; Firestore uses it as the document ID. Both generate + return the `MMC-YYYY-NNNNNN` reference. |
| `get_submission_by_id(id)` | Accepts strings; SQLite converts to int (404-safe). |
| `get_submission_by_reference(ref)` | Case-insensitive exact match. |
| `list_submissions(search, status)` | Newest first. Firestore filters in memory (no substring queries in Firestore — volume is tiny). |
| `update_submission_fields(id, fields)` | Returns updated row or None. |
| `delete_submission_row(id)` | Returns the deleted row (so callers can free files). |
| `get_all_upload_paths()` | Set of every stored image path (orphan detection). |
| `find_recent_duplicate(name, last4, since_iso)` | Abuse protection (see §6). |

### 3.3 SQLite specifics (`database.py`, top section)

- On import: loads `backend/.env` (real env wins), creates `uploads/`,
  computes `DEFAULT_ADMIN_EMAIL`/`DEFAULT_ADMIN_PASSWORD`.
- **Production gating:** with `APP_ENV=production` those two MUST come from
  env — hard-coded defaults are disabled and the import raises otherwise.
- Local defaults (dev only): `team.duobits@gmail.com` / `aditya9922`.
- Tables: `admin_users(id, email, password_hash, token_version, …)`,
  `app_settings(id=1, business_name, cashback_amount, campaign_active,
  pause_message, success_note, storage_quota_mb, …)`,
  `submissions(id, reference, customer_name, order_last4, customer_comment,
  review_screenshot_path, payout_method, upi_id, upi_qr_path, status,
  admin_notes, duplicate_of, created_at, updated_at, approved_at, paid_at)`.
- Reference = `MMC-{year}-{rowid:06d}` (SQLite autoincrement).

### 3.4 Firestore specifics (`firestore_service.py`)

Layout (all values are plain types; timestamps are ISO strings):

```
settings/public      {business_name, cashback_amount, campaign_active,
                      pause_message, success_note, storage_quota_mb,
                      created_at, updated_at}
admins/{email}       {id: 1, email, password_hash, role: "admin",
                      token_version, created_at, updated_at}
submissions/{uuid}   {reference, customer_name, order_last4, customer_comment,
                      review_screenshot_path,   e.g. "submissions/<uuid>/review.jpg"
                      payout_method: "upi"|"qr", upi_id, upi_qr_path,
                      status, admin_notes, duplicate_of,
                      created_at, updated_at, approved_at, paid_at}
meta/counters        {submission_seq, updated_at}
```

- Reference generation: **transactional increment** of
  `meta/counters.submission_seq` → `MMC-{year}-{seq:06d}` (same UX as SQLite).
- Every read normalizes docs to the full SQLite column set
  (`_SUBMISSION_DEFAULTS`), so consumers index rows identically in both modes.
- `list_submissions`/`find_recent_duplicate` stream the collection and filter
  in Python — correct and cheap at restaurant scale; revisit only if the
  collection grows past ~10k docs.

### 3.5 Image storage (`storage_service.py`)

| Function | local mode | firebase mode |
|---|---|---|
| `save_image(content, kind, key)` | `uploads/{kind}-{uuid}.{ext}` → returns `/uploads/…` | `submissions/{key}/review.{ext}` or `…/upi-qr.{ext}` in the bucket |
| `read_file(path)` | disk read (path-traversal safe) | blob download |
| `delete_file(path)` | unlink (safe basename resolution) | `bucket.delete_blob` (best-effort) |
| `all_files()` | scan `uploads/` | `bucket.list_blobs(prefix="submissions/")` |

- `validate_image_bytes`: **≤ 5 MB** (`MAX_IMAGE_BYTES`) and magic-byte type
  detection (`detect_image_extension`) — PNG/JPEG/WebP only. The client's
  filename/Content-Type are never trusted.
- `CONTENT_TYPES` maps extension → MIME for the streaming endpoint.
- Orphan cleanup + storage stats in `main.py` work off `all_files()` +
  `repo.get_all_upload_paths()`, so they behave identically in both modes.

### 3.6 `main.py` structure (876 lines)

1. **Imports + repo selection** (see §3.1).
2. **Production gating:** `APP_ENV=production` requires `SESSION_SECRET`
   (else boot fails). Token TTL: `ADMIN_TOKEN_TTL_HOURS` (default 24h, min 1h).
3. **CORS:** dev allows localhost:5173 + `*.e2b.app` regex (for previews);
   production allows only `CORS_ORIGINS` (comma-separated; empty = same-origin).
4. **Middlewares:** Starlette `SessionMiddleware` (https_only in prod),
   CORS, security headers (`nosniff` always; HSTS in prod).
5. **Rate limiting:** in-memory sliding window per IP (`X-Forwarded-For`
   aware). Login **10 / 15 min**, submissions **20 / hour**. Bounded memory
   (prunes idle keys >10k).
6. **Auth helpers:**
   - `make_admin_token` — itsdangerous-signed payload `{id,email,v,exp}`.
   - `_token_from_request` — accepts the token from, in order:
     `Authorization: Bearer`, `X-Admin-Token` header, `?admin_token=` (**dev
     only — rejected in production**), `mm_admin_token` cookie.
   - `resolve_admin` — validates signature, expiry, and `token_version`
     against the DB (password change revokes old tokens). Falls back to the
     Starlette session if no token present.
   - `require_admin` — 401 + diagnostic log line of which channels were seen.
   - Google sign-in (`/api/auth/google`): verifies the ID token against
     `https://oauth2.googleapis.com/tokeninfo`, checks `aud` ==
     `GOOGLE_CLIENT_ID`, `email_verified`, and that the email equals the
     configured admin email.
7. **Settings payloads:** `_public_settings_from` deliberately **never exposes
   the admin email**; `admin_settings_payload` adds `storageQuotaMb`.
8. **`compute_storage_stats()`** — mode-agnostic usage/quota/orphan math.
9. **`serialize_submission()`** — the single JSON shape for submissions;
   `_image_urls()` returns `/uploads/…` paths locally, or
   `/api/admin/submissions/{id}/files/{review|upi-qr}` in firebase mode.
   Adds `flaggedDuplicate` / `duplicateOf`.
10. **Routes** — full table in §5.
11. **SPA hosting** — when `my-react-app/dist` exists, port 8000 also serves
    the built frontend (index.html no-cache). In production Cloud Run this is
    inert (Hosting serves the frontend); locally you should use port 5173.

### 3.7 Submission creation flow (both modes)

```
POST /api/submissions (multipart)
  ├─ rate-limit check (20/hour/IP)
  ├─ campaign-active check (else 400 with pauseMessage)
  ├─ validate name (≥2 chars), order last-4 (exactly 4 digits),
  │   payout method ("upi" needs UPI ID containing "@", "qr" needs image)
  ├─ submission_key = uuid4().hex
  ├─ storage.save_image(review)   → magic-byte check + 5 MB cap FIRST
  ├─ storage.save_image(upiQr)    (qr method only)
  ├─ duplicate scan: same name + last-4 in the last 7 days → duplicate_of ref
  ├─ repo.create_submission(fields, submission_key)   (reference generated)
  │     └─ on DB failure: uploaded files are deleted (no orphans)
  └─ 200 {message, reference, status: "pending"}
```

### 3.8 Private image access (firebase mode; also works locally)

```
GET /api/admin/submissions/{id}/files/{kind}      kind ∈ {review, upi-qr}
  ├─ require_admin (token via header/cookie, or session)
  ├─ load submission → stored path
  ├─ storage.read_file(path)  (404 if the object was cleaned up)
  └─ 200 bytes, correct Content-Type, Cache-Control: private, max-age=300
```

The admin frontend renders these URLs straight into `<img>` tags; the browser
sends the `mm_admin_token` cookie (same origin), which is one of the accepted
auth channels — no JS fetch needed for images.

---

## 4. Frontend deep dive

### 4.1 Routing (`App.jsx`, HashRouter — works on any static host)

| URL | Page |
|---|---|
| `/#/` | `CustomerForm.jsx` — splash (900 ms), 3-step explainer, form, Swiggy/Toingit links |
| `/#/success` | `Success.jsx` — reads `?ref=` state, animated confirmation |
| `/#/status` | `Status.jsx` — public tracker; polls by reference; shows only non-sensitive fields |
| `/#/admin/*` | lazy-loaded `AdminApp.jsx` subtree: `/admin` (dashboard), `/admin/submission/:id`, `/admin/settings`, `/admin/storage` |

### 4.2 HTTP layer (`lib/api.js`) — read this before touching API calls

- `API_BASE = VITE_API_BASE_URL || ''` — **empty in dev and in the Firebase
  Hosting production setup** (same-origin `/api`). Set it only when the
  frontend is hosted on a different origin than the backend.
- `assetUrl(path)` prefixes `API_BASE` onto `/uploads/…`-style paths.
- Token storage is **triple-redundant** (sandboxed preview iframes can break
  any single channel): localStorage + in-memory + `mm_admin_token` cookie.
- Every request sends the token twice as headers (`Authorization: Bearer` +
  `X-Admin-Token`); in `import.meta.env.DEV` only, admin calls also append
  `?admin_token=` (the backend rejects that channel in production).
- Any non-JSON response is treated as **"backend unreachable"** (throws an
  `isNetwork` error) — this prevents fake "₹0 / paused" renders behind a dead
  proxy. Network failures retry once after 700 ms.
- A 401 clears the stored token **only for auth endpoints** — data-endpoint
  401s never bounce the admin back to login mid-session.

### 4.3 Customer form (`CustomerForm.jsx`)

- Loads `/api/settings` on mount (business name, cashback amount, campaign
  active/paused, success note). This call also doubles as the Cloud Run
  **cold-start warmer** — by the time a customer finishes the form, the
  backend is awake.
- Images go through `compressImageFile` (canvas, max dim 1600, quality 0.82;
  PNG stays PNG, everything else becomes JPEG) **before** upload. The picker
  accepts originals up to 10 MB; the backend hard-caps stored files at 5 MB.
- QR images additionally pass `inspectQrImage` (BarcodeDetector when
  available; otherwise aspect-ratio heuristic — advisory, never blocking).
- Submits `multipart/form-data`: `customerName`, `orderLast4`,
  `customerComment`, `payoutMethod` (`upi|qr`), `upiId`, `reviewScreenshot`,
  optional `upiQr`. On success → `/#/success` with the reference.

### 4.4 Admin app (`pages/admin/`)

- `AdminApp.jsx` probes `/api/auth/me` on load and distinguishes exactly
  three states: **server unreachable** (offline screen + auto-retry),
  **not logged in** (Login), **logged in** (layout + data polling).
- Dashboard: 5 stat cards, `StorageBar` (quota), filter chips, search
  (client-side on the loaded list), per-row delete, **Possible duplicate**
  badge when `flaggedDuplicate`.
- Detail: lightbox images, approve / mark paid / reject, admin notes
  (status-only PATCH never wipes notes — enforced server-side), permanent
  delete (row + files), duplicate badge.
- Settings: customer-facing settings + storage quota + change password
  (backend revokes all other tokens; current tab receives a fresh one).
- Storage: quota bar, review/QR/orphan breakdown tiles, one-click orphan
  cleanup (`POST /api/admin/storage/cleanup`).

---

## 5. API reference (complete)

Base: `http://localhost:8000` (dev) · `/api` same-origin (production).
Interactive docs: `GET /docs` (Swagger) on the backend port.

### Public

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/health` | — | `{ok:true}` — also the cold-start warmer |
| `GET /api/settings` | — | `{businessName, cashbackAmount, campaignActive, pauseMessage, successNote, googleAuthEnabled}` (never the admin email) |
| `POST /api/submissions` | rate-limited | multipart create (see §3.7) → `{message, reference, status}` |
| `GET /api/submissions/status/{reference}` | — | privacy-safe: `{reference, status, createdAt, updatedAt, approvedAt, paidAt}` only |

### Auth

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/auth/login` | rate-limited | form `email`,`password` → `{ok, admin:{id,email,v}, token}`. One generic 401 message for all failures (no account enumeration). |
| `POST /api/auth/google` | — | JSON `{credential}` (Google ID token) → same shape |
| `POST /api/auth/logout` | session | clears the server session |
| `GET /api/auth/me` | optional | `{authenticated, admin}` |
| `POST /api/auth/change-password` | admin | form `currentPassword`,`newPassword` (≥8 chars) → new `token`; all older tokens/sessions revoked via `token_version` |

### Admin (all require admin token/session)

| Method & path | Purpose |
|---|---|
| `GET /api/admin/settings` | public settings + `storageQuotaMb` |
| `PUT /api/admin/settings` | update: `businessName`, `cashbackAmount` (1–10000), `campaignActive`, `pauseMessage`, `successNote`, `storageQuotaMb` (10–102400) |
| `GET /api/admin/submissions?search=&status=` | list (newest first; status ∈ all/pending/approved/paid/rejected) |
| `GET /api/admin/submissions/{id}` | one submission (full shape below) |
| `PATCH /api/admin/submissions/{id}` | `{status?, adminNotes?}` — sets `approvedAt`/`paidAt` timestamps on transitions; notes omitted ⇒ preserved |
| `DELETE /api/admin/submissions/{id}` | deletes DB row/doc **and** both image files; returns `{ok, id, reference, freedBytes}` |
| `GET /api/admin/submissions/{id}/files/{kind}` | `kind=review|upi-qr` — streams the image bytes (private access) |
| `GET /api/admin/storage` | `{usedBytes, totalFiles, reviewBytes/Files, qrBytes/Files, otherBytes/Files, orphanBytes/Files, quotaBytes, quotaMb, usedPercent, overQuota}` |
| `POST /api/admin/storage/cleanup` | deletes unreferenced files/objects → `{removedFiles, freedBytes, storage}` |
| `GET /api/admin/dashboard` | `{submissions:[…], stats:{total, pending, approved, paid, rejected}}` |

Serialized submission shape (identical in both modes):

```json
{
  "id": "1 | <uuid>",
  "reference": "MMC-2026-000042",
  "customerName": "…", "orderLast4": "4821", "customerComment": "…",
  "reviewScreenshotUrl": "/uploads/… | /api/admin/submissions/{id}/files/review",
  "payoutMethod": "upi | qr",
  "upiId": "name@bank", "upiQrUrl": "… | null",
  "status": "pending | approved | paid | rejected",
  "adminNotes": "…",
  "createdAt": "…", "updatedAt": "…", "approvedAt": "… | null", "paidAt": "… | null",
  "flaggedDuplicate": false, "duplicateOf": null
}
```

---

## 6. Security model

1. **Admin auth:** PBKDF2-SHA256 (120k iterations, per-user salt,
   constant-time compare) + itsdangerous-signed bearer tokens with expiry.
   Multi-channel token transport (headers → cookie; URL token dev-only).
2. **Revocation:** password change bumps `token_version`; every outstanding
   token/session with the old version stops working instantly (both modes).
3. **Production gates (`APP_ENV=production`):** boot fails without
   `SESSION_SECRET` and without env-provided `ADMIN_EMAIL`/`ADMIN_PASSWORD`;
   hard-coded defaults are disabled; HSTS + secure cookies + CSP; CORS pinned
   to `CORS_ORIGINS`; URL-token channel off; generic login errors.
4. **Privacy:** public status endpoint returns no name/UPI/images/notes;
   settings endpoint never reveals the admin email; in firebase mode images
   are in a private bucket reachable only through the authenticated endpoint;
   Firestore/Storage rules deny all direct client access.
5. **Abuse protection:** rate limits (login 10/15min, submissions 20/hour
   per IP, `X-Forwarded-For` aware) + duplicate flagging (same name + last-4
   within `DUPLICATE_WINDOW_DAYS = 7` → `flaggedDuplicate`, admin sees a badge;
   never auto-rejected because last-4 is not globally unique).
6. **Upload hygiene:** magic-byte type validation (PNG/JPEG/WebP only), 5 MB
   cap, UUID-only file names (no customer data in paths), validation before
   any write, DB-failure rollback deletes freshly written files.
7. **Secrets:** never in git/frontend. `backend/.env` is gitignored and
   loaded at startup (real env wins). Production uses Cloud Run env +
   **Secret Manager** (`mahalxmi-admin-password`, `mahalxmi-session-secret`).

---

## 7. How to run

Prereqs: Node 20+, Python 3.10+. Windows: use `.venv\Scripts\` paths.

### 7.1 Install (first time)

```bash
python -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cd my-react-app && npm install && cd ..
```

### 7.2 Local development (default — SQLite, zero config)

```bash
# terminal 1 — backend on 8000
cd backend && ../.venv/bin/python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# terminal 2 — frontend on 5173
cd my-react-app && npm run dev
```

Open `http://localhost:5173/` (customer) · `http://localhost:5173/#/admin`
(admin: `team.duobits@gmail.com` / `aditya9922` — dev defaults) ·
`http://localhost:8000/docs` (Swagger). First start seeds the SQLite DB.
Ports are fixed (`strictPort`): busy port = loud failure, by design.

### 7.3 Local development against REAL Firebase (optional)

```bash
cd backend
BACKEND_MODE=firebase APP_ENV=production \
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... SESSION_SECRET=$(openssl rand -hex 32) \
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
../.venv/bin/python -m uvicorn main:app --port 8000
```

(`gcloud auth application-default login` works instead of a SA JSON.)

### 7.4 Tests / verification

```bash
# local mode — needs the backend running on :8000 with a FRESH db
rm -f backend/mahalaxmi.db && rm -rf backend/uploads
# (start uvicorn as in 7.2, then:)
.venv/bin/python tests/smoke_local.py        # 48 checks over HTTP

# firebase mode — self-contained, no credentials, in-memory fakes
.venv/bin/python tests/smoke_firebase.py     # 40 checks incl. seeding,
                                             # counter refs, cleanup, streaming
```

Both print PASS/FAIL lines and exit non-zero on failure — safe as a PR gate.

### 7.5 Build the frontend

```bash
cd my-react-app && npm run build      # → my-react-app/dist
npm run lint                          # must stay clean
```

---

## 8. Deployment

**The authoritative runbook is `CLOUD_DEPLOYMENT.md`** (Phases 1–10 with exact
commands). Summary for agents:

### 8.1 One-time cloud setup (project `mahalxmi-review-system`)

1. Firebase console → enable **Firestore (native)** + **Storage** (locked).
2. Blaze plan + **budget alerts** (₹100/₹250/₹500).
3. `gcloud services enable run cloudbuild secretmanager firestore`
4. Create Secret Manager secrets `mahalxmi-admin-password`,
   `mahalxmi-session-secret`.
5. (Retention) `gsutil lifecycle set` a 60-day Delete rule on the bucket —
   command in the guide.

### 8.2 Deploy backend → Cloud Run

```bash
gcloud run deploy mahalxmi-api --source backend --region us-central1 \
  --allow-unauthenticated --memory 512Mi --cpu 1 --max-instances 2 \
  --set-env-vars APP_ENV=production,BACKEND_MODE=firebase,ADMIN_EMAIL=...,CORS_ORIGINS=https://mahalxmi-review-system.web.app \
  --set-secrets ADMIN_PASSWORD=mahalxmi-admin-password:latest,SESSION_SECRET=mahalxmi-session-secret:latest
```

`backend/Dockerfile` (python:3.12-slim, non-root, `uvicorn … --port $PORT`)
is built by Cloud Build. `BACKEND_MODE` auto-detects on Cloud Run anyway.

### 8.3 Deploy rules + frontend → Firebase Hosting

```bash
firebase deploy --only firestore:rules,storage     # deny-all rules
cd my-react-app && npm run build && cd ..
firebase deploy --only hosting                     # firebase.json handles rewrites
```

`firebase.json` order matters: `/api/**` → Cloud Run `mahalxmi-api`
(`us-central1` — keep in sync with the deploy region) **before** the `**` →
`index.html` SPA fallback.

### 8.4 CI push-to-deploy

`deploy-cloud.workflow.yml` (repo root): on push to `main` → builds +
deploys the backend to Cloud Run (google-github-actions), smoke-tests
`/api/health`, builds the frontend, deploys to Firebase Hosting live channel.
**Install step:** move it to `.github/workflows/deploy-cloud.yml` (the agent
token could not write there). Needs repo secrets `GCP_SA_KEY`,
`FIREBASE_TOKEN` (or the same SA for both) and variable `ADMIN_EMAIL`.
The old `.github/workflows/deploy.yml` (GitHub Pages) is legacy.

### 8.5 Rollback & data safety

- Frontend: `firebase hosting:rollback` or redeploy an old build.
- Backend: redeploy the previous Cloud Run revision.
- Data is never touched by deploys (Firestore is external state).
- Pre-migration rollback point: commit `848dcaf` (SQLite-only system).

---

## 9. Operational notes & gotchas

- **Fresh database = empty dashboard.** That is normal, not an error.
- **Use port 5173 for the UI in dev.** Port 8000 serves a possibly-stale
  `dist/` snapshot (SPA hosting feature) — go there only for `/docs`/API.
- **Stale-backend symptom:** UI values differ from
  `curl http://127.0.0.1:8000/api/settings` → a second uvicorn holds an older
  DB. Kill it (`WINDOWS_LOCAL_SETUP.md` §6–§8).
- **429** = rate limit hit (login 10/15min, submits 20/hour/IP). Wait.
- **Rate limiter is in-memory** — fine for the single-process Cloud Run
  design (`--max-instances` kept low); with multiple instances each instance
  has its own window.
- **Storage math:** ~1 MB per submission (screenshot ~700 KB + occasional QR
  ~300 KB). At 30/day ≈ 900 MB/month uncapped; the 60-day lifecycle rule caps
  steady state around ~1 GB. The admin Storage page + orphan cleanup cover the
  rest; the quota (default 1024 MB, editable in Settings) is advisory.
- **Firestore costs:** one write per submission + a few reads per admin view —
  nowhere near free-tier limits at restaurant traffic.
- **Image deleted by lifecycle?** The files endpoint returns 404 "The image is
  no longer available" and the UI shows a broken-image state — the Firestore
  record (name, digits, status, dates) persists.
- **Duplicate flag ≠ rejection.** It only asks the admin to double-check.
- **Tokens:** admin bearer TTL 24 h (`ADMIN_TOKEN_TTL_HOURS`); changing the
  password revokes everything except the tab that changed it.
- **`source.md` staleness check:** this file documents commit `9011046`;
  if the repo moved on, re-verify §2 file sizes and §5 routes against code.

---

## 10. Verification status (as of this writing)

- `tests/smoke_local.py` — **48/48** against a live local-mode backend
  (auth, generic errors, submissions UPI+QR, validation-before-write, 5 MB
  cap, magic bytes, privacy-safe status, duplicate flag, search/filter, PATCH
  semantics, files endpoint incl. cookie auth, storage stats + cleanup,
  delete-frees-files, password revocation).
- `tests/smoke_firebase.py` — **40/40** against the real app in firebase mode
  with in-memory fakes (seeding, counter references MMC-…-000001/2,
  submissions/{uuid}/ layout, orphan cleanup, streaming from bucket,
  token_version bump, campaign pause enforcement).
- Production gates verified: missing `SESSION_SECRET` / `ADMIN_*` refuse to
  boot; firebase mode without ADC fails with actionable guidance.
- Frontend: `vite build` + `eslint` clean; Vite proxy `/api` + SPA fallback
  verified end-to-end. Docker build validated by Cloud Build on deploy
  (no docker in the authoring sandbox).

---

## 11. Cheat-sheet for AI agents

- **Change a route?** Edit `backend/main.py`; keep the JSON shape stable —
  `lib/api.js` + pages consume it verbatim. Run both smoke suites.
- **Change the data model?** Update BOTH repositories (`database.py` incl.
  schema/`ensure_column` migration, AND `firestore_service.py` incl.
  `_SUBMISSION_DEFAULTS`), then `serialize_submission`.
- **Add a stored field to submissions?** Add column + migration (SQLite),
  default (Firestore), serializer key, and frontend usage — in that order.
- **New image kind?** Extend `SUBMISSION_FILE_FIELDS` (main.py),
  `_classify_file`, and `storage_service._firebase_object_name`.
- **Anything touching auth?** Read §3.6 (item 6, auth helpers) and the
  multi-channel docstring in `_token_from_request` first; never weaken the
  production gates.
- **Deployment questions?** `CLOUD_DEPLOYMENT.md` is the single source of
  truth; keep `firebase.json` rewrite region in sync with Cloud Run region.
- **Never commit:** `.env`, `*.db`, `uploads/`, `node_modules/`, `dist/`,
  credentials of any kind.
