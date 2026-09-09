# Project Analysis — Mahalaxmi Review / Cashback System

*Analyzed: 2026-09-09 · Branch: `arena/01a0879a-mahalxmi-review-system` (commit `a1b5173`)*

---

## 1. Executive summary

This repository contains a **review-for-cashback campaign tool** for **Mahalaxmi Multi
Cuisine** (a restaurant on Swiggy / Toing). A customer who posts a rating + written
comment in the delivery app can upload proof and claim a small cashback (₹15 by
default) via UPI ID or a UPI QR image. A password-protected admin panel reviews each
claim and marks it `pending → approved → paid` (or `rejected`), with admin notes,
search/filter, pause-the-campaign controls, and a change-password screen.

The **live system** is deliberately simple:

- **Frontend** — React 19 + Vite 8 + Tailwind CSS 4 (`my-react-app/`)
- **Backend** — FastAPI + SQLite + local file uploads (`backend/`)

Verified working end-to-end (see §5). However, the repository also carries a large
**second, older generation of the app** (a Firebase/Firestore-based "feedback
journey" with rating questions, auto-generated review text and fraud heuristics).
That whole layer is **dead code** today — roughly 2,000+ lines across pages, libs and
Firebase rule files — plus a GitHub Actions workflow that deploys only the static
frontend (no backend deployment anywhere).

**Overall verdict:** clean, well-scoped, genuinely functional code for a local /
single-restaurant tool, but **not production-ready as-is**. Top gaps: (1) ~40% of the
frontend source is orphaned/legacy code, (2) hard-coded default admin credentials and
session secret, (3) weak upload handling that allows a stored-XSS upload, (4) no
tests/CI for the backend, (5) no documented backend deployment path.

---

## 2. Repository layout

```
Mahalxmi_Review_System/
├── README.md                     ← describes the LIVE system (accurate)
├── .github/workflows/deploy.yml  ← GitHub Pages deploy: frontend only
├── package-lock.json             ← empty stub at root (no root package.json) — noise
├── backend/                      ← LIVE API (Python)
│   ├── main.py          (448 ln)  API routes, auth, uploads, SPA hosting
│   ├── database.py      (128 ln)  SQLite schema + seeding + helpers
│   ├── security.py       (32 ln)  PBKDF2 password hashing
│   └── requirements.txt           fastapi, uvicorn, python-multipart, itsdangerous
└── my-react-app/                 ← LIVE frontend + LEGACY code (React + Vite)
    ├── src/App.jsx               routes: "/" → CustomerForm, "/admin/*" → AdminApp
    ├── src/pages/                live: CustomerForm, Success + admin/ (4 pages)
    │                             legacy/unused: Welcome, Feedback, Review,
    │                             Cashback, FeedbackApp, admin/Analytics
    ├── src/components/           ui.jsx, admin.jsx, FoodIcon, FloatingFood
    ├── src/lib/                  api.js, format.js, image.js, status.js  (LIVE)
    │                             firebase.js, ratings.js, review.js, dupe.js,
    │                             crypto.js, storage.js, demoData.js        (LEGACY)
    ├── firestore.rules           ← Firestore rules for the LEGACY app
    ├── storage.rules             ← Firebase Storage rules for the LEGACY app
    ├── firebase.json             ← Firebase hosting config (legacy)
    └── package.json              react, vite, tailwind v4, framer-motion, lucide,
                                  firebase (firebase only used by legacy code)
```

~5,700 lines of source overall (~1,100 backend Python + ~3,600 live React +
~1,900 legacy/orphaned React).

---

## 3. Architecture — the live system

### 3.1 Two screens, one API

**Customer side (`/#/` — `CustomerForm.jsx`, 727 ln):**
1. Fetches public settings (`GET /api/settings`) with a mandatory ~1.2 s branded splash.
2. Hero shows the campaign amount + "₹40 OFF above ₹499" offer (offer amount is
   hard-coded in the hero copy, only the cashback amount is configurable).
3. If `campaignActive` is false → shows pause message, hides the form.
4. Otherwise the form collects: **review screenshot** (required), **customer name**,
   **order ID last 4 digits**, and payout = **UPI ID** *or* **UPI QR image**.
5. Images are compressed client-side to ≤1600 px / q0.82 before upload (8 MB cap is
   also enforced server-side).
6. POSTs multipart to `POST /api/submissions`; on success shows a **Success** card
   with the generated reference (`MMC-<year>-<000001…>`), a copy button and
   "submit another".

**Admin side (`/#/admin` — `AdminApp.jsx` shell):**
- Login screen (email/password **and optional Google sign-in**). Backend accepts only
  the single allowed admin email.
- `AdminApp` calls `/api/auth/me`, then loads all submissions + settings; **auto-refresh
  every 15 s**.
- **Dashboard** (`Dashboard.jsx`): stat cards (total/pending/approved/paid/rejected,
  with paid ₹ total) + filter chips + text search + table with thumbnail, status pill,
  links to detail.
- **Detail** (`Detail.jsx`): full record, lightbox for the review screenshot and UPI
  QR, cashback amount, three action buttons (approve / paid / reject), editable admin
  notes, and a back button.
- **Settings** (`Settings.jsx`): business name, cashback amount, success note, pause
  message, campaign on/off toggle, and change-admin-password (min 8 chars).

Routing is a **HashRouter** (`/#/admin`), which is why the static GitHub Pages / SPA
fallback hosting works without server rewrites.

### 3.2 Backend (FastAPI, single process)

| Area | Endpoints |
|---|---|
| Public | `GET /api/health`, `GET /api/settings` |
| Submissions | `POST /api/submissions` (multipart; customer name ≥2 chars, exactly-4-digit order id, image content-type check, 8 MB cap, valid UPI `*@*` or QR image) |
| Auth | `POST /api/auth/login`, `POST /api/auth/google`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password` |
| Admin | `GET/PUT /api/admin/settings`, `GET /api/admin/submissions?search&status`, `GET/PATCH /api/admin/submissions/{id}`, `GET /api/admin/dashboard` (⚠️ unused by frontend) |
| Static | `/uploads/*` mounted; `/` + SPA fallback serve `my-react-app/dist` if built |

**Schema** (SQLite, auto-created & seeded at startup, `backend/database.py`):
- `admin_users(id, email UNIQUE, password_hash, timestamps)` — seeded from
  `ADMIN_EMAIL`/`ADMIN_PASSWORD` env (defaults below).
- `app_settings(id=1, business_name, cashback_amount, campaign_active, pause_message,
  success_note, …)` — single-row settings singleton.
- `submissions(id, reference UNIQUE, customer_name, order_last4, customer_comment,
  review_screenshot_path, payout_method, upi_id, upi_qr_path, status, admin_notes,
  created/updated/approved/paid_at)` — timestamps stored as UTC ISO-8601 strings.

**Auth model:** PBKDF2-SHA256 (120k iterations, per-user random salt, HMAC-compared —
good). Login sets a signed session cookie (itsdangerous URLSafeSerializer) and also
returns a signed **bearer token** that the frontend keeps in `localStorage` and sends
as `Authorization: Bearer …`. `resolve_admin()` accepts either. Google login is
verified server-side against `https://oauth2.googleapis.com/tokeninfo` with an
`aud` (client-id) + `email_verified` + email-allowlist check — solid approach (no
server-side SDK needed).

**Statuses:** `pending | approved | paid | rejected`; approving/paid stamps
`approved_at` / `paid_at`. There is **no workflow restriction** — an admin may jump
`pending → paid`, or `rejected → paid`; the UI only exposes forward actions so in
practice this is fine.

### 3.3 Verified behavior (live smoke tests run during this analysis)

- `npm install`, `npm run build` (Vite) and `npx eslint .` all **pass clean**.
- Backend boots; DB seeds admin + settings automatically.
- `POST /api/submissions` (UPI and QR variants) → stored with generated reference
  `MMC-2026-000001`; screenshots served back under `/uploads/…`.
- Wrong password → 401; correct → session + token; `/api/auth/me` authenticates.
- Admin endpoints return 401 without session; **bearer token** works.
- `PATCH …/status=paid` stamps `approved_at`+`paid_at`, saves notes.
- Bad order-last-4/name → 400; text file sent as image → 400; unknown status → 400.
- Built `dist/` is served by the backend at `/` with SPA fallback for deep routes.

---

## 4. Dead code & legacy layers (the big cleanup candidate)

A full **earlier product generation** — a multi-step *feedback journey* where the
customer answered rating questions, was shown a machine-generated review to copy into
the delivery app, uploaded the screenshot, and got cashback; backed by **Firebase
(Firestore + Storage + Auth)** with a **localStorage demo mode** — is still in the
tree but **unreachable**: `App.jsx` only mounts `CustomerForm` and `AdminApp`.

| Category | Files | Proof it is dead |
|---|---|---|
| Pages | `src/pages/Welcome.jsx`, `Feedback.jsx`, `Review.jsx`, `Cashback.jsx`, `FeedbackApp.jsx`, `admin/Analytics.jsx` | Nothing imports them (grep across `src/` finds zero importers) |
| Libs | `lib/firebase.js` (Firebase bootstrap + demo mode + legacy submission API), `ratings.js`, `review.js` (review-text generator), `dupe.js`, `crypto.js` (image hash), `storage.js`, `demoData.js` | Imported **only** by the orphaned pages above |
| Config | `firestore.rules`, `storage.rules`, `firebase.json`, `my-react-app/.env.example` Firebase vars | Reference the legacy `feedbackSubmissions` collection/flow; live app never touches Firebase |
| Deps | `firebase` in `package.json` | Only imported from dead modules (Vite build confirms it is not in the bundle) |

**Smoking gun:** the legacy files are stale against the current `components/ui.jsx` —
`Welcome.jsx` imports a `Sparkles` export, `Feedback.jsx` imports `ProgressDots`, and
`Analytics.jsx` imports `MiniBar`, **none of which exist** in `ui.jsx`. They only
"work" today because the bundler never reaches them. `Analytics.jsx` additionally
expects the *old* data shape (`submission.ratings.overall`), not the live
`submission.customerName` shape — it cannot be plugged into the current dashboard
without a rewrite.

Other leftovers:
- **Two** copies of image compression (`lib/firebase.js` vs `lib/image.js`), with
  different defaults (1400/q0.78 vs 1600/q0.82).
- `backend/main.py` has a `GET /api/admin/dashboard` route **no frontend calls**
  (the dashboard computes stats client-side and fetches via `getSubmissions()`).
- Root `package-lock.json` is an empty stub with no root `package.json`.
- Legacy demo admin (`admin@demo.mahalaxmi.in / mahalaxmi123` in `firebase.js`) is
  unreachable because admin auth always goes through the FastAPI `api.login`.

**Recommendation:** delete the orphaned pages/libs and the Firebase rule/config files
(keep the ideas — duplicate-detection and review-suggestion are good product concepts
that could be rebuilt on the current backend), then `npm uninstall firebase`. This
would remove ~40 % of the frontend source and shrink the maintenance surface
substantially.

---

## 5. Security review

Findings ordered roughly by severity for the *current* deployment posture:

1. **Hard-coded default admin credentials.** `backend/database.py` defaults to
   `ADMIN_EMAIL=team.duobits@gmail.com`, `ADMIN_PASSWORD=aditya9922`; the same pair is
   in the README **and pre-filled into the login form** (`Login.jsx` initial state).
   Anyone who can read the repo (public) knows the live password until an admin
   changes it. Fix: require env vars, no defaults, never pre-fill the password field.

2. **Default session-secret fallback → forgeable admin tokens.**
   `SESSION_SECRET = os.getenv("SESSION_SECRET", "mahalaxmi-local-secret")`. Admin
   bearer tokens are `itsdangerous.URLSafeSerializer` **signed, not encrypted**
   (the payload `{"id":1,"email":…}` is visible base64) and have **no expiry**. If the
   env var isn't set in production, anyone can mint an admin token. Fix: fail fast
   when `SESSION_SECRET` is missing in production, use an encryption serializer or
   short-lived/expiring tokens, and rotate on password change.

3. **Stored-XSS via uploads.** `save_upload()` keeps the extension from the **client
   filename** and validates only the **client-supplied `Content-Type` header**
   (`startswith("image/")`) — the bytes are never checked. An attacker can upload a
   file named `x.html` with `Content-Type: image/png`; it is stored under
   `/uploads/<uuid>.html` and served by `StaticFiles` as `text/html` **from the same
   origin**, i.e. a stored XSS payload that runs against the app origin. Fix: derive
   the extension from the validated content type (or sniff magic bytes), store only
   `.png/.jpg/.jpeg/.webp`, and serve uploads with `X-Content-Type-Options: nosniff`.

4. **No brute-force / rate limiting on auth.** `/api/auth/login` is unbounded; with
   the known default password this is moot today but matters once #1 is fixed.

5. **Broad CORS with credentials.** `allow_origin_regex=https://.*\.e2b\.app` (plus
   localhost:5173) with `allow_credentials=True` is a dev convenience that should be
   narrowed/templated for production.

6. **Session cookie hardening.** `https_only=False`, no explicit `max_age`, Lax
   SameSite. Fine for HTTP local dev; must flip to secure/HSTS behind TLS in
   production. The localStorage bearer token is also readable by any XSS (see #3) —
   prefer relying on the (HttpOnly-able) cookie for admin API calls.

7. **Minor:** `/api/settings` discloses the admin email address; `me()` reveals the
   exact allowed email. Change-password requires the current password — good — but
   nothing invalidates the bearer token/session after a password change or logs other
   devices out. `/api/auth/google` accepts JSON bodies without an explicit pydantic
   model. There's no CSRF token, though the admin mutating endpoints are mostly
   bearer-protected (mitigating CSRF); logout/change-password are session-cookie-based.

**What's done right:** PBKDF2 with per-user salt and constant-time compare; single
admin email allowlist enforced server-side on both login paths; Google `aud` +
`email_verified` verification; server-side upload size cap; customer submissions can
never read other submissions; client image pre-compression keeps uploads small; the
submissions table stores only the last-4 order digits (good privacy instinct).

---

## 6. Functional bugs & product gaps

1. **`/uploads` URLs break when the API is hosted separately** (the documented
   "cloud deployment later" path). `serialize_submission()` returns
   `"/uploads/…"` **relative paths**, and `ImageCell`/`<img src>` render them as-is.
   In dev the Vite proxy hides this; with `VITE_API_BASE_URL` set to another origin,
   thumbnails/lightbox images 404 against the frontend origin. Fix: prefix image URLs
   with the API base (or return absolute URLs).

2. **Order verification is intentionally weak** — only the last 4 digits of the order
   ID, which is what the owner asked for, but it means any 4 digits pass; the previous
   (legacy) app at least had screenshot-hash duplicate detection and flag heuristics.
   The live admin has **no duplicate/fraud signal** beyond eyeballing — worth porting
   `imageHash`/`dupe.js` logic server-side (or client-side pre-flagging) as the
   campaign grows.

3. **`customer_comment` is never collected.** The schema/API/admin serialization
   support it, but the customer form has no comment field and the submit never sends
   it, so the column is always empty. Either remove it or (better) add a small
   optional "your comment (as posted)" text field — the rules say a written comment in
   the delivery app is mandatory, so echoing it makes admin verification easier.

4. **₹40 flat-off offer is hard-coded** in `CustomerForm` copy/pills while only the
   cashback amount is configurable — text/code drift when offers change.

5. **Polling instead of push** — admin refreshes the full submission list every 15 s
   (fine up to a few hundred rows; will get heavy with growth; no pagination on the
   backend list endpoint).

6. No customer confirmation channel (email/WhatsApp) — the success screen is the only
   receipt; nothing tracks payout externally (admin notes are the only trail).

7. Repo name typo (`Mahalxmi_Review_System`); README title says "Upload System"; the
   project is now broader — cosmetic.

---

## 7. Deployment readiness

- `.github/workflows/deploy.yml` **builds and publishes only the static frontend to
  GitHub Pages** (on push to `main`, plus manual dispatch). There is **no backend
  deployment, no backend CI, and no tests anywhere** (no Python tests, no JS tests).
- The README's "later cloud deployment" is still aspirational: you must host FastAPI
  somewhere (VPS/Render/Fly/Railway…) and set `VITE_API_BASE_URL` **and** fix the
  relative `/uploads` URLs (see §6.1). SQLite + local disk uploads work on a single
  VPS; they won't on ephemeral/serverless hosting.
- The GH Pages site + HashRouter combination works; the empty root
  `package-lock.json` and the missing `backend/requirements.txt` pinning at the root
  suggest the deploy workflow was set up for the frontend only, which matches a
  Firebase-era assumption.

---

## 8. What to do next (priority order)

**Cleanup / hygiene (cheap, high value)**
1. Delete the orphaned legacy layer: `pages/{Welcome,Feedback,Review,Cashback,
   FeedbackApp}.jsx`, `pages/admin/Analytics.jsx`, `lib/{firebase,ratings,review,dupe,
   crypto,storage,demoData}.js`, `firebase.json`, `firestore.rules`, `storage.rules`;
   drop the `firebase` dependency; remove the stub root `package-lock.json`; keep the
   *ideas* for a future port.
2. Delete the unused `GET /api/admin/dashboard` endpoint or start using it.

**Security hardening (before any real traffic)**
3. Make `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`SESSION_SECRET` required env vars (fail hard
   in prod), stop pre-filling the password field, rotate the current default.
4. Fix upload handling: validate magic bytes, force a whitelisted extension, add
   `nosniff`.
5. Harden cookies (`https_only` on in prod), tighten CORS, add login rate limiting.

**Functional polish**
6. Prefix upload URLs with the API base so a separately-hosted backend works.
7. Add an optional "comment you posted" field (kills the dead `customer_comment`
   column), and/or port duplicate-screenshot detection server-side.
8. Make the ₹40-off copy a settings field; add pagination to list endpoints.
9. Add a minimal test suite (FastAPI TestClient smoke tests + a couple of Vitest
   component tests) and run it in the GitHub Action.

---

## 9. File-by-file reference (live code)

**Backend**
- `backend/main.py` — all routes; settings payload; admin auth helpers
  (`resolve_admin`, `require_admin`, `verify_google_token`); upload saving; submission
  create/list/get/patch; SPA static hosting of `my-react-app/dist`.
- `backend/database.py` — `sqlite3` helpers, schema, idempotent seeding, column
  migrations (`ensure_column`), `utc_now`, `row_to_dict`.
- `backend/security.py` — PBKDF2 hash/verify.

**Frontend (live)**
- `src/App.jsx` — hash-router: `/` → `CustomerForm`, `/admin/*` → lazy `AdminApp`.
- `src/pages/CustomerForm.jsx` — the whole customer experience (splash, steps,
  validation, image uploads, jump-to-section FAB, success screen).
- `src/pages/Success.jsx` — reference ID + copy + "submit another".
- `src/pages/admin/AdminApp.jsx` — auth gate + shell + nav + 15 s data polling.
- `src/pages/admin/{Login,Dashboard,Detail,Settings}.jsx` — as described in §3.1.
- `src/components/ui.jsx` — shared primitives (`Spinner`, `StatusPill`, `ErrorBox`,
  `SectionCard`, `CopyButton`, `ImageUpload`, `Lightbox`, `LightboxArea`).
- `src/components/admin.jsx` — `StatCard`, `ImageCell`.
- `src/components/FoodIcon.jsx` / `FloatingFood.jsx` — brand food emoji icons and
  ambient floating decorations.
- `src/lib/api.js` — fetch wrapper with Bearer token handling + endpoint methods.
- `src/lib/format.js` — date/₹/UPI-id/uid/slug helpers.
- `src/lib/image.js` — client-side canvas compression + `inspectQrImage`
  (BarcodeDetector, with permissive fallback — currently only used by legacy pages).
- `src/lib/status.js` — status pill metadata (matches backend statuses).
- `src/index.css` — Tailwind 4 theme (brand orange / cocoa / gold palette, fonts,
  custom shadows/animations).
- `vite.config.js` — dev-server proxy `/api` and `/uploads` → `127.0.0.1:8000`;
  `allowedHosts: true` for preview environments.
