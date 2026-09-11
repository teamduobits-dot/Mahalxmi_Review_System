# Project Analysis — Mahalaxmi Review / Cashback System

*Analyzed 2026-09-10 · Branch: `arena/01a08a4b-mahalxmi-review-system` (== `main` tip, commit `8f9161f`, merge of PR #5), updated again 2026-09-10 after the multi-channel-auth fix session. This document supersedes the previous analyses and reflects the current working tree, re-verified end-to-end on a fresh database (31 check groups, 70+ individual assertions — see §5).*

---

## 0A. Session update — 2026-09-11 (cloud migration, branch `arena/01a0904c-mahalxmi-review-system`)

This session migrated the backend from a single-host SQLite + local-disk design
to the target cloud architecture. Where this section conflicts with anything
below, this section wins.

**Target architecture (implemented):** Firebase Hosting (React) → `/api/**`
rewrite → Cloud Run (this FastAPI app) → Cloud Firestore + Firebase Storage
(private bucket). Full runbook in `CLOUD_DEPLOYMENT.md`.

**Backend changes**
- New repository abstraction: `main.py` is now mode-agnostic and talks to one
  interface implemented twice — `database.py` (SQLite, unchanged behavior)
  and `firestore_service.py` (Cloud Firestore). `firebase_service.py` picks
  the mode via `BACKEND_MODE` (auto-`firebase` on Cloud Run via `K_SERVICE`).
  Local development remains zero-config.
- Firestore layout: `submissions/{uuid}` (reference numbers from a
  transactional counter doc `meta/counters` → same `MMC-YYYY-NNNNNN` format),
  `admins/{email}`, `settings/public`, all snake_case + ISO timestamps so the
  JSON API is byte-identical in both modes.
- `storage_service.py`: image store abstraction. Firebase mode stores
  `submissions/{uuid}/review.jpg` / `upi-qr.png` in a **private** bucket
  (rules deny all client access); images reach the admin only via the new
  authenticated endpoint `GET /api/admin/submissions/{id}/files/{kind}`
  (streaming; cookie/header admin auth). Local mode keeps `/uploads/...`.
- Upload cap lowered 8 MB → **5 MB** (frontend compresses; picker accepts up
  to 10 MB originals per the plan).
- **Duplicate flagging:** same name + order-last-4 within 7 days sets
  `duplicate_of`; the API exposes `flaggedDuplicate`/`duplicateOf` and the
  admin Dashboard + Detail show a "Possible duplicate" badge (never
  auto-rejects).
- Submission IDs in URLs are now strings (integers locally, UUIDs in
  firebase mode) — frontend unaffected.
- Production fail-fast keeps working; firebase mode additionally fails fast
  with actionable guidance when Application Default Credentials are missing.

**Config/deploy artifacts:** `backend/Dockerfile` (+ `.dockerignore`, honors
`$PORT`), `firebase.json` now rewrites `/api/**` → Cloud Run `mahalxmi-api`
(us-central1) before the SPA fallback, plus `firestore.rules` /
`storage.rules` (deny-all) and `.firebaserc`. `backend/.env.example`
documents the new vars.

**Verified this session:** `tests/smoke_local.py` 48/48 (live SQLite backend:
auth, submissions, privacy-safe status, duplicate flag, files endpoint,
storage stats/cleanup, delete-frees-files, password revocation) and
`tests/smoke_firebase.py` 40/40 (same surface against in-memory Firestore +
Storage fakes, incl. seeding, counter references, orphan cleanup, streaming).
Production-gate refusals (missing SESSION_SECRET / ADMIN_*), ADC-missing
error, frontend `vite build` + `eslint` clean. Docker build not testable in
this sandbox (no docker) — Cloud Build validates on deploy.

**Not done / follow-ups:** actual `gcloud`/`firebase` deploys (need your
project credentials), 60-day Storage lifecycle rule (one command in the
guide), budget alerts, migrating any existing SQLite rows (production DB is
empty), and the planned extra marketing settings fields (nextOrderDiscount
etc.) — intentionally deferred; the settings doc is trivially extensible.
`source.md` (generated source map) predates this session and is stale for the
new backend files.

---

## 0. Session update — 2026-09-11 (this branch, not yet merged)

A new feature/security session on `arena/01a08cdb-mahalxmi-review-system` changed
the system substantially. Everything below §0 describes the **pre-session** state;
where this section conflicts with the rest of the document, this section wins.

**New features (admin panel)**
1. **Storage tracking & management.**
   - `GET /api/admin/storage` — disk usage of `backend/uploads/`: used/total bytes,
     review-screenshot vs QR breakdown, orphan-file count (files no submission
     references), quota bytes/MB, `usedPercent`, `overQuota`.
   - **Dashboard** shows a storage bar card (green → amber at 70% → red at 90%,
     over-quota warning) above the table.
   - New **Storage page** (`/#/admin/storage`, sidebar nav item): big quota bar,
     4 stat tiles, orphan-file cleanup button (`POST /api/admin/storage/cleanup`,
     removes only unreferenced files), refresh.
   - **Settings** gains a storage quota field (10–102,400 MB; new
     `app_settings.storage_quota_mb` column, default 1024, auto-migrated).
2. **Permanent delete for every submission.**
   - `DELETE /api/admin/submissions/{id}` removes the DB row AND its uploaded
     screenshot/QR files, and returns the freed size.
   - Dashboard table has a per-row **Delete** button (confirm dialog + spinner);
     the Detail page has a **Delete permanently** button in Admin actions.
3. **Login email no longer pre-filled/revealed.** `Login.jsx` starts with an empty
   email field and generic "only the registered admin account is allowed" copy;
   `/api/settings` no longer exposes `adminEmail`; the backend returns ONE generic
   message for bad email / bad password / unknown account (no enumeration).

**Production hardening (all verified — see smoke tests)**
- **Admin tokens expire** (`exp` claim, `ADMIN_TOKEN_TTL_HOURS`, default 24 h) and
  **password change revokes all outstanding tokens/sessions** via a per-admin
  `token_version` (schema-migrated); the current tab gets a fresh token in the
  change-password response. Session cookies and session-store entries are
  version-checked too.
- **Rate limiting:** login 10 tries / 15 min / IP, submissions 20 / hour / IP
  (in-memory sliding window, `X-Forwarded-For` aware). Verified 429.
- **URL-token channel disabled in production:** backend rejects `?admin_token=`
  when `APP_ENV=production` (tokens in URLs leak to logs); the built frontend
  never appends it (`import.meta.env.DEV` gate). Headers/cookie channels remain.
- **Production response headers:** `Strict-Transport-Security` on every response,
  CSP on served HTML (scripts self, fonts Google, connect self + Google tokeninfo,
  frame accounts.google.com). Dev gets a mirror-image CSP via Vite headers so
  CSP breakage shows up locally.
- **CORS restricted in production** to explicit `CORS_ORIGINS` (comma-separated;
  empty = same-origin only). The e2b.app regex now only applies in dev.
- **Session cookie:** `https_only=True` in production; `max_age=86400`.
- **Validation-before-write:** all form fields (UPI/QR included) are validated
  BEFORE any file is written to disk; a DB failure after write unlinks the new
  files — invalid submissions can no longer create orphan uploads.
- `backend/.env` support (loaded at import; real env wins) +
  `backend/.env.example`; production fail-fast unchanged.
- **Firebase deployment:** root `firebase.json` (hosting: `my-react-app/dist`,
  no-cache index, immutable hashed assets, SPA rewrites); README deployment
  section rewritten for Firebase Hosting + backend on a VPS/container.
  `deploy.yml` now really bakes `VITE_API_BASE_URL` from the repo variable
  (fixes the long-standing doc/workflow drift noted in §7.1).
- Dormant `timeAgo()` bug fixed (ISO string vs epoch math); `formatBytes()` added.

**Verified this session (fresh env):** 20/20 backend smoke checks (health, no-email
settings, generic login errors, token issuance, validation-before-write orphan
check, 2 submissions, storage stats, auth-gated storage, delete frees row+files,
cleanup, login 429, password-change revocation + restore, expired-token 401,
tampered-token 401, quota update, privacy-safe public status, search) and 10/10
production-mode checks (fail-fast ×2, HSTS, no adminEmail, generic errors, login,
query-token rejected, bearer accepted, CORS allow/deny, X-Admin-Token channel,
CSP). Frontend: `eslint` clean, `vite build` clean.

---



## 1. Executive summary

This repository is a **review-for-cashback campaign tool** for **Mahalaxmi Multi Cuisine**
(a restaurant on Swiggy / Toing). A customer who posts a rating + written comment in
the delivery app uploads proof and claims a small cashback (₹15 by default) via UPI ID
or a UPI QR image. A password-protected admin panel reviews each claim and moves it
through `pending → approved → paid` (or `rejected`), with admin notes, search/filter,
campaign pause controls, and a change-password screen.

- **Frontend** — React 19 + Vite 8 + Tailwind CSS 4 (`my-react-app/`), HashRouter, framer-motion
- **Backend** — FastAPI + SQLite + local file uploads (`backend/`), ~670 lines of Python
- **~2,750 lines of live frontend source** — no dead Firebase/legacy layer, no `firebase`
  dependency (grep-verified, source and production bundle)

The system was **re-verified end-to-end during this analysis** (60+ assertions across 28 check groups — see §5): install,
lint, production build, backend boot + seeding, customer submissions (UPI, QR, and WebP),
the hardened upload path, auth (success/failure paths, bearer + session, tampered tokens),
admin workflow transitions, notes preservation, search/filter, static upload serving with
`nosniff`, path traversal resistance, SPA hosting from the backend, campaign pause/resume,
the Vite-proxy failure mode that PR #5 fixed, and the GitHub Pages deploy chain.

**Overall verdict:** clean, small, genuinely functional code for a local / single-restaurant
tool. Relative to the previous analysis, one previously-listed bug is now **fixed and
verified**: `PUT /api/admin/settings` no longer 500s on non-numeric input and no longer
accepts negative cashback (both now return 400 — see §5 check 13; the previous
analysis listed this as an open gap).

It is still **not production-ready as-is**. Top remaining gaps: (1) GitHub Pages deploys a
frontend that needs a backend on a separate host — the workflow now wires the
`VITE_API_BASE_URL` repo variable correctly, but no backend host exists yet and the repo
variable is still unset; (2) no rate limiting on login/submissions; (3) admin tokens
never expire and are not revoked on password change; (4) zero tests / no backend CI;
(5) hard-coded ₹15/₹40 SEO copy that drifts when settings change.

**Fixed during this session (2026-09-10):** the live-preview admin 401 bug — login
succeeded but every follow-up admin call failed with 401 because the preview
gateway/iframe stripped or blocked the single auth channel. Auth is now multi-channel
(token stored in memory + localStorage + a first-party cookie; sent as
`Authorization: Bearer`, `X-Admin-Token`, `?admin_token=`, and the `mm_admin_token`
cookie), the backend accepts all of them, failed auth logs exactly which channels
arrived, logout no longer crashes when the backend is down, the Vite dev server pins
its ports with `strictPort: true` (+ `VITE_BACKEND_URL` proxy override), and the GitHub
Pages workflow now truly bakes `VITE_API_BASE_URL` into the build. All five auth
channels and the reject paths were re-verified (checks 25–30).

---

## 2. Repository layout

```
Mahalxmi_Review_System/
├── README.md                      ← accurate on run/deploy/troubleshooting, but §deploy
│                                    claim about VITE_API_BASE_URL is not implemented (§7.1)
├── PROJECT_ANALYSIS.md            ← this file
├── WINDOWS_LOCAL_SETUP.md         ← PowerShell run/troubleshoot guide (337 ln, good)
├── package-lock.json              ← empty stub, no root package.json — noise, deletable
├── .github/workflows/deploy.yml   ← GitHub Pages deploy: frontend only (see §7 gap)
├── .gitignore                     ← correctly ignores db, uploads, dist, .venv, backend/.env
└── backend/                       ← LIVE API (Python 3.10+, no framework DB/ORM)
    ├── main.py          (496 ln)  all routes, auth, upload hardening, SPA hosting
    ├── database.py      (142 ln)  SQLite schema + idempotent seeding + migrations
    ├── security.py       (32 ln)  PBKDF2-SHA256 (120k iters, per-user salt)
    └── requirements.txt           fastapi 0.116.1, uvicorn 0.35.0, python-multipart, itsdangerous (all pinned)

my-react-app/                      ← LIVE frontend (React 19.2, Vite 8.2, Tailwind 4.3)
├── vite.config.js                 ← /api + /uploads dev proxy → 8000; host+allowedHosts open
├── index.html                     ← SEO meta (hard-coded ₹15/₹40 copy — drift risk, §6.4)
└── src/
    ├── App.jsx                    HashRouter: "/" → CustomerForm, "/admin/*" → lazy AdminApp
    ├── main.jsx                   StrictMode entry
    ├── index.css                  Tailwind 4 @theme: brand orange/cocoa/gold palette, shadows
    ├── pages/CustomerForm.jsx     the entire customer experience (762 ln)
    ├── pages/Success.jsx          reference ID + copy + "submit another"
    ├── pages/admin/AdminApp.jsx   auth gate, shell, offline handling, 15 s polling (338 ln)
    ├── pages/admin/{Login,Dashboard,Detail,Settings}.jsx
    ├── components/ui.jsx          Spinner, StatusPill, ErrorBox, SectionCard, CopyButton,
    │                              ImageUpload (client compression), Lightbox
    ├── components/admin.jsx       StatCard, ImageCell
    ├── components/{FoodIcon,FloatingFood}.jsx   inline-SVG food art + ambient animation
    └── lib/{api,format,image,status,adminRoute}.js
```

**Dependencies are lean and current**: react 19.2.8, react-router-dom 7.18.3,
framer-motion 13.2, lucide-react 1.42, tailwindcss 4.3.3, vite 8.2.2, eslint 10.9.
No state-management, HTTP, or UI-kit libraries — everything is hand-rolled, which keeps
the bundle honest (one 129.6 kB-gzip main chunk + a 9.0 kB-gzip lazy admin chunk).

---

## 3. Architecture — how the live system works

### 3.1 Customer side (`/#/` — `CustomerForm.jsx`)

1. Fetches public settings (`GET /api/settings`) behind a mandatory ~1.2 s branded splash;
   network vs. application failure is distinguished, with a Retry button.
2. Hero shows campaign amount + "₹40 OFF above ₹499" (offer amount **hard-coded**, only the
   cashback amount is configurable — §6.4).
3. If `campaignActive` is false → pause message, form hidden.
4. Otherwise collects: **review screenshot** (required), **customer name** (≥2 chars),
   **order ID last 4 digits** (exactly 4 numeric), payout = **UPI ID** (regex-validated) *or*
   **UPI QR image**. Client-side canvas compression to ≤1600 px / q0.82 before upload.
5. POSTs multipart to `/api/submissions`; success screen shows the generated reference
   (`MMC-<year>-<000001…>`), copy button, "submit another".

### 3.2 Admin side (`/#/admin` — `AdminApp.jsx` shell)

- **Login** (`Login.jsx`): email/password + optional Google Identity Services button
  (rendered only when `VITE_GOOGLE_CLIENT_ID` is set). Email is pre-filled, password is not.
  Server accepts only the single allowed admin email.
- **AdminApp** probes `/api/auth/me` on mount and carefully distinguishes three states:
  *logged in*, *not logged in*, *backend unreachable* (auto-retry every 5 s with a dedicated
  offline screen + "Retry now"). Data (submissions + settings) refreshes every 15 s;
  a failed refresh shows a banner but **never** forces logout — only an explicit re-login
  clears state. This resilience layer is genuinely well-engineered.
- **Dashboard**: stat cards (total/pending/approved/paid/rejected + paid ₹ total), filter
  chips, text search (client-side filter over the polled list), table with review thumbnail
  and status pill.
- **Detail**: full record, lightbox for review screenshot and UPI QR, cashback amount,
  Approve / Mark paid / Reject buttons, editable admin notes (a status-only PATCH preserves
  notes — server-side guard verified).
- **Settings**: business name, cashback amount, success note, pause message, campaign
  toggle, change-password (min 8 chars, requires current password).

### 3.3 Backend (FastAPI, single process, `backend/main.py`)

| Area | Endpoints |
|---|---|
| Public | `GET /api/health`, `GET /api/settings` |
| Submissions | `POST /api/submissions` (multipart: name ≥2 chars, exactly-4-digit order id, magic-byte image validation, 8 MB cap, UPI `*@*` or QR image) |
| Auth | `POST /api/auth/login` (form), `POST /api/auth/google`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password` |
| Admin | `GET/PUT /api/admin/settings`, `GET /api/admin/submissions?search&status`, `GET/PATCH /api/admin/submissions/{id}`, `GET /api/admin/dashboard` (⚠️ still unused by the frontend) |
| Static | `/uploads/*` (StaticFiles); `/` + SPA fallback serve `my-react-app/dist` when built, with `Cache-Control: no-cache` on index.html |

**Data model** (SQLite, auto-created + seeded at startup):

- `admin_users(id, email UNIQUE, password_hash, created/updated_at)` — seeded from
  `ADMIN_EMAIL`/`ADMIN_PASSWORD`; **in `APP_ENV=production` these env vars (and
  `SESSION_SECRET`) are mandatory and the server refuses to boot without them**
  (verified — check 22; dev keeps documented defaults).
- `app_settings(id=1, business_name, cashback_amount, campaign_active, pause_message, success_note, …)`.
- `submissions(id, reference UNIQUE, customer_name, order_last4, customer_comment
  [never collected — §6.3], review_screenshot_path, payout_method, upi_id, upi_qr_path,
  status, admin_notes, created/updated/approved/paid_at)` — timestamps as UTC ISO-8601 strings.

**Auth model:** PBKDF2-SHA256 (120k iterations, random salt, constant-time compare). Login
sets a signed session cookie (starlette SessionMiddleware) and returns a signed bearer token
(itsdangerous URLSafeSerializer) stored in `localStorage`. `resolve_admin()` accepts either.
Google login verifies the ID token against `oauth2.googleapis.com/tokeninfo` with
`aud` + `email_verified` + email-allowlist checks. Approving/paid stamps `approved_at` /
`paid_at`; there is no enforced status workflow (admin may jump any state to any state — the
UI only offers forward actions, so acceptable for a single-admin tool).

**Upload hardening (verified):** `detect_image_extension()` sniffs magic bytes (PNG/JPEG/WebP
only); the extension is derived from the bytes, never from the client filename or
Content-Type; a global middleware adds `X-Content-Type-Options: nosniff`. An HTML file sent
as `image/png` is rejected with 400 (check 8).

**Backend-down resilience (PR #5, verified):** with uvicorn stopped, the Vite proxy returns
an empty `text/plain` 502 for `/api/*`. `apiFetch()` in `lib/api.js` treats any non-JSON
response (or unreadable JSON body) as "backend unreachable", so the customer form shows the
retry screen and the admin panel shows the offline screen — a fake ₹0/"paused" page or a
silent empty login error can no longer be rendered from a proxy error (check 26).

---

## 4. What was fixed since the previous analysis ✔

The merge of PR #5 (and PR #4 before it) resolved nearly all of the previous reports'
findings:

| Previous finding | Status now |
|---|---|
| ~2,000+ lines of dead Firebase/legacy frontend (pages, libs, rules, config) | **Deleted** — no `firebase` import anywhere, not in the production bundle (grep-verified), dependency removed |
| Stored-XSS via uploads (filename/Content-Type trust) | **Fixed** — magic-byte sniffing, server-derived extension, PNG/JPEG/WebP whitelist, `nosniff` on all responses (attack now returns 400 — re-verified) |
| Hard-coded default credentials could reach production | **Mitigated** — `APP_ENV=production` refuses to start without `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`SESSION_SECRET` (verified); password field no longer pre-filled |
| `/uploads` URLs break when frontend/backend hosted separately | **Fixed** — `assetUrl()` in `lib/api.js` prefixes `VITE_API_BASE_URL`, used by Dashboard + Detail |
| Status-only PATCH could wipe admin notes | **Fixed** — server only overwrites notes when the field is actually sent (re-verified) |
| Stale `dist` cached after redeploy | **Fixed** — `Cache-Control: no-cache` on index.html (verified) |
| Confusing offline vs. logged-out admin UX | **Fixed** — dedicated offline screen, 5 s auto-retry, "session expired" banner distinct from data-refresh failure |
| Path traversal in SPA file serving | **Guarded** — resolved-path `relative_to()` check (re-verified `/uploads/../database.py` → 404) |
| Backend-down proxy 502 rendered a fake ₹0/paused page; empty login error | **Fixed in PR #5** — non-JSON responses are classified as "backend unreachable" with retry UI (verified at the HTTP level, §3.3) |
| `PUT /api/admin/settings` 500 on non-numeric `cashbackAmount`; negative values accepted | **Fixed** — `int()` is wrapped in try/except → 400, and values are clamped to 1–10,000 → 400 outside range (re-verified check 13; the previous analysis listed this as an open bug — it no longer reproduces) |
| **Preview admin 401**: login 200 but every follow-up admin call 401 (gateway/iframe strips/blocks the single auth channel) | **Fixed this session** — multi-channel auth: token kept in memory + localStorage + `mm_admin_token` cookie; sent as `Authorization: Bearer`, `X-Admin-Token`, `?admin_token=` and the cookie; backend `resolve_admin()` accepts all of them and logs which channels arrived on failure (checks 25–30) |
| `AdminApp.logout()` throws unhandled when the backend is down (UI never resets) | **Fixed** — `api.logout()` wrapped in try/catch; the token is cleared in `api.logout`'s finally so the login screen always returns |
| Vite silently shifts to 5174/5175 when 5173 is busy, breaking the proxy + docs | **Fixed** — `strictPort: true` on dev + preview (fails loudly instead); proxy target overridable via `VITE_BACKEND_URL` |
| GitHub Pages workflow ignored `VITE_API_BASE_URL` (README/workflow drift) | **Fixed** — `deploy.yml` Build step now sets `env: VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}`; still needs the repo variable set + a real backend host |

---

## 5. Verified behavior (fresh smoke tests run during this analysis)

Environment: Python 3.11.2, Node 22.22.3, npm 10.9.8. Fresh DB seeded at first backend boot.
All 28 check groups below passed exactly as noted.

**Build/lint**
1. `pip install -r backend/requirements.txt` → clean, pinned versions resolve.
2. `npm install`, `npm run lint` (eslint) → **clean**; `npm run build` → succeeds.
3. Bundle: main `index-*.js` 408.07 kB (129.57 kB gzip), lazy `AdminApp` chunk 36.28 kB
   (9.01 kB gzip), CSS 51.31 kB (9.59 kB gzip). No `firebase` string in the bundle.

**Backend & API**
4. Backend boots, creates + seeds `backend/mahalaxmi.db` (admin + settings singleton).
5. `GET /api/health` → `{"ok":true}`; `GET /api/settings` → correct payload.
6. Login: wrong password → 401 "Invalid email or password."; wrong email → 401 "This email
   is not allowed."; correct → session cookie + bearer token.
7. `POST /api/submissions` — UPI+PNG → `MMC-2026-000001`; QR+JPEG → `MMC-2026-000002`;
   WebP review → accepted (`MMC-2026-000003`).
8. **XSS upload attempt** (HTML bytes, filename `.png`, `Content-Type: image/png`) →
   **400 "Only PNG, JPEG or WebP images are accepted."** ✔
9. 3-digit order id → 400; invalid UPI → 400; missing QR for `qr` method → 400;
   1-char name → 400.
10. Admin list without auth → 401; with bearer token → all submissions; with session
    cookie only → same list (both auth channels work).
11. Search `ravi` → 1 hit; `search=ravi&status=paid` → correct hit (LIKE search is
    SQL-parameterized).
12. PATCH `approved` → stamps `approved_at`; notes-only PATCH → saves notes, keeps status;
    **status-only PATCH to `paid` preserves existing notes**; invalid status → 400;
    unknown id → 404. `paid_at` stamped correctly.
13. `PUT /api/admin/settings` validation: `"abc"` → **400** "must be a number";
    `-50` → **400** "between 1 and 10000"; `20000` → **400**; valid payload → saved and
    re-read. (This is the previously-reported 500/negative-accept bug — **fixed**.)
14. Change-password: wrong current password → 400; valid change → 200; old password then
    fails login, new one works. Password restored to the documented default afterwards.
15. **Bearer token issued before a password change remains valid afterwards; the session
    cookie does too** (both re-verified against the changed-password DB — no revocation).
16. Tampered/foreign tokens: garbage bearer → `auth/me` reports `authenticated:false`;
    a token for a non-admin email with an invalid signature → 401 on admin endpoints.
17. `/uploads/<file>` → correct `content-type` **and** `x-content-type-options: nosniff`.
18. `/uploads/../database.py` and `/uploads/../../etc/passwd` (path traversal) → 404.
19. `GET /api/admin/dashboard` → correct stats (endpoint works but no frontend calls it).
20. SPA hosting: `/` serves the built `dist`; deep route `/some/deep/route` → 200 fallback;
    `cache-control: no-cache` on index; missing `/api/*` route → JSON 404, not the SPA.
21. Campaign pause: `campaignActive:false` → `POST /api/submissions` → 400 with the
    pause message; resume → submissions accepted again.
22. **Production fail-fast**: importing `database` or `main` with `APP_ENV=production` and
    no `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`SESSION_SECRET` raises `RuntimeError` — defaults are
    disabled in production. ✔
23. **Rate limiting**: 20 rapid bad-password logins all processed with no throttling —
    none exists (§6.2).
24. Token payload is signed, **not encrypted** — `{"id":1,"email":…}` is visible base64.

**Frontend/dev-server chain**
25. Vite dev server boots on 5173; serves the app; `/api/*` and `/uploads/*` proxy to the
    backend correctly (verified via the proxy).
26. **With the backend stopped**, the Vite proxy returns an empty `text/plain` 502 for
    `/api/settings` and `/api/admin/submissions` — exactly the failure mode the PR #5
    non-JSON detection guards against (the UI shows retry/offline screens instead of a
    fake page).
27. **Multi-channel auth (fix for the live-preview 401 bug) — all verified through the
    Vite proxy:** admin list 200 via `Authorization: Bearer` / via `X-Admin-Token` only /
    via `?admin_token=` query param only / via `mm_admin_token` cookie only / via session
    cookie only. No auth → 401; garbage token via `X-Admin-Token` → 401.
28. Failed-auth diagnostics: an unauthenticated admin request logs the INFO line
    `Admin auth failed — authorization header: False, x-admin-token: False, …` so a
    gateway stripping channels can be identified from the backend log alone.
29. `npm run lint` → clean (after adding Node globals for `vite.config.js`); production
    build succeeds (main 408.39 kB / 129.69 kB gzip, admin chunk 9.01 kB gzip).

**GitHub state**
30. Repo is **public**; Pages is enabled and last built from `main` via the Actions
    workflow (4 successful deploys, one legacy branch build from PR #1's era).
31. `deploy.yml` **now sets** `env: VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}` on
    the Build step (§7.1) — but the repo variable still has to be created and a backend
    host must exist for the deployed site to work. The Pages *source branch* setting still
    points at the old
    `arena/01a07d96-…` branch (stale legacy config) even though Actions deploys from
    `main` now.

---

## 6. Security review (current state, ranked)

1. **Public default credentials.** The repo (public) documents
   `team.duobits@gmail.com / aditya9922`, and dev-mode seeding uses them. Production mode
   requires env vars, but if the real deployment was ever seeded with these defaults,
   anyone reading GitHub can log in. **Action: change the password on the live system and
   treat the documented pair as compromised.** (Also note the token serializer salt is
   public knowledge if `SESSION_SECRET` ever fell back to the dev default.)

2. **Admin tokens: no expiry, no revocation — and now multi-channel.** Bearer tokens are
   signed, **not encrypted** (payload `{"id":1,"email":…}` is visible base64), never
   expire, and stay valid after a password change — re-verified for both the bearer token
   and the session cookie (checks 15, 24). Since this session the same token is ALSO
   accepted from `X-Admin-Token`, the `?admin_token=` query parameter, and the
   `mm_admin_token` cookie (needed to survive preview gateways that strip standard auth
   channels — checks 27–28), which widens the exposure surface: the query-parameter copy
   appears in the backend access log, and a leaked token from ANY channel is valid
   forever. Fix: add an expiry timestamp to the payload, validate it in `resolve_admin()`,
   and include a password-generation marker so changing the password invalidates
   outstanding tokens. (Rotating `SESSION_SECRET` also invalidates all tokens at once.)

3. **No rate limiting / brute-force protection.** `/api/auth/login` and
   `POST /api/submissions` are unbounded (20 rapid attempts processed unthrottled — check
   23). Once #1 is fixed this matters. A tiny in-memory attempt counter (e.g. 10 tries /
   15 min / IP) is enough for a single-host deployment.

4. **Orphan upload on invalid submission (minor).** `create_submission()` writes the review
   file to disk **before** validating the UPI id, and uploads are never deleted (not even
   for rejected submissions). Combined with #3, an unauthenticated client can fill the
   uploads disk with ≤8 MB images regardless of validation outcome. Fix: validate all form
   fields before `save_upload()`, and add periodic garbage collection of unreferenced files.

5. **Session cookie & CORS hardening for production.** `https_only=False` unconditionally
   (fine on plain-HTTP localhost, wrong behind TLS in prod — gate on `APP_ENV`); CORS
   allows `https://.*\.e2b\.app` with credentials (dev convenience that should not ship to
   a production config); no `Strict-Transport-Security`.

6. **Minor:** `/api/settings` discloses the admin email (used by the login screen copy —
   accepted trade-off, but worth knowing); login email pre-filled from a hard-coded string
   in `AdminApp.jsx` (should come from settings); distinct login errors enable email
   enumeration (the allowed email is public anyway — accepted); change-password does not
   log out other sessions (see #2); `AdminApp.logout()` throws unhandled when the backend
   is down (the token is cleared but the UI state never resets — the next poll's
   "session expired" banner covers it); `@app.on_event("startup")` is deprecated in
   FastAPI (use a lifespan handler); Google login accepts a raw `dict` without a pydantic
   model.

**What's done right:** PBKDF2 with per-user salt and constant-time compare; single-admin
email allowlist enforced server-side on both login paths; Google `aud` + `email_verified`
verification against Google's tokeninfo endpoint; magic-byte upload validation with
whitelisted extensions; 8 MB server-side cap; `nosniff` globally; path-traversal guard on
SPA file serving; SQL is fully parameterized (LIKE search included); customer endpoints
never expose other customers' data; only last-4 order digits stored (good privacy instinct);
uploads/db/.env gitignored; production fail-fast on missing secrets.

---

## 7. Functional gaps & deployment readiness

1. **The GitHub Pages deploy: workflow fixed, backend host still missing.** The workflow
   now sets `env: VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}` on the Build step
   (fixed this session — check 31), so the README claim is finally true. What remains:
   create the `VITE_API_BASE_URL` repository variable (Settings → Secrets and variables →
   Actions → Variables), host the backend somewhere (single VPS/container — SQLite + local
   uploads do not survive ephemeral/serverless platforms) with `APP_ENV=production` +
   secrets, and remove the stale Pages *source branch* setting pointing at
   `arena/01a07d96-…` (check 31). Until then the deployed site still can only talk to a
   backend on its own origin.

2. **No tests and no backend CI.** Not one test in the repo; the only workflow deploys.
   The API is small and deterministic — a FastAPI `TestClient` smoke suite (login, submit,
   upload rejection, status transitions) would take an afternoon and belongs in CI.

3. **No pagination.** `GET /api/admin/submissions` returns every row and the admin polls
   the full list every 15 s. Fine for hundreds of rows; will degrade with a popular campaign.

4. **No duplicate/fraud signal.** Only last-4 order digits + eyeballing the screenshot.
   The previous (deleted) generation had screenshot-hash duplicate detection — worth
   re-implementing server-side as the campaign grows.

5. **`customer_comment` column still never collected.** Schema/API/admin serialization
   support it; the form never sends it (grep-verified). Add the optional field or drop the
   column.

6. **Offer copy is hard-coded.** "₹40 Flat OFF / above ₹499" appears 3× in
   `CustomerForm.jsx` and in `index.html` title + meta description (which also hard-codes
   "₹15"). When settings change, the deployed page's SEO copy silently drifts. (Demonstrated
   during this run: changing the DB cashback amount leaves the built page still saying ₹15.)

7. **Cashback-amount drift in the admin UI.** The Dashboard "paid ₹ total" and the Detail
   cashback amount both use the **current** settings amount; no per-submission amount is
   stored, so historical totals are wrong if the amount changes mid-campaign.

8. **Small leftovers:** unused `GET /api/admin/dashboard` endpoint; unused helpers
   (`inspectQrImage`, `timeAgo`, `formatDay`, `clamp`, `uid`, `slugDate` in `lib/` — note
   `formatDate` *is* used by Dashboard/Detail, correcting the previous analysis); empty root
   `package-lock.json` stub with no root `package.json`; `Settings.jsx` uses the render-time
   "adjust state when props change" pattern (legal but easy to get wrong — an effect or
   key-remount would be more conventional); `Login.jsx` re-initializes the Google button
   whenever `busy` changes (harmless, slightly wasteful).

---

## 8. What to do next (priority order)

**Before real traffic**
1. Rotate the live admin password; confirm the deployed backend runs with
   `APP_ENV=production` + env secrets.
2. Add token expiry + password-change revocation in `resolve_admin()`/`make_admin_token()`
   (now more important: the same token is accepted over four channels — §6.2).
3. Add login rate limiting (simple in-memory counter per IP).
4. Validate submissions fully before writing uploads to disk; add orphan-file cleanup.

**Deployment**
5. ~~Fix `deploy.yml` to pass `VITE_API_BASE_URL`~~ (done this session). Now: create the
   repo variable, choose and document the backend host (single VPS/container), gate
   `https_only`/CORS on `APP_ENV=production`, and clean up the stale Pages source-branch
   setting.

**Quality**
6. Add a FastAPI `TestClient` smoke suite + run lint & tests in GitHub Actions.
7. Add pagination to the submissions list; stop polling the full list on an interval.
8. Make the ₹40-off offer (and meta description) settings-driven; collect the optional
   customer comment; port duplicate-screenshot detection server-side.
9. Delete the unused dashboard endpoint, dead `lib/` helpers, and the root
   `package-lock.json` stub; replace deprecated `on_event("startup")` with a lifespan.

---

## 9. File-by-file reference (live code)

**Backend**
- `main.py` — all routes; production fail-fast for `SESSION_SECRET`; CORS; `nosniff`
  middleware; `_token_from_request`/`resolve_admin`/`require_admin` (multi-channel token:
  bearer / `X-Admin-Token` / `?admin_token=` / `mm_admin_token` cookie / session, with
  failure diagnostics); `verify_google_token`; `detect_image_extension` (magic bytes) +
  `save_upload`; submission create/list/get/patch (notes-preserving, validated status,
  1–10,000 cashback clamp); SPA static hosting with no-cache index.
- `database.py` — sqlite3 connection factory, schema, `ensure_column` migration helper,
  idempotent admin/settings seeding (env-driven in production, fail-fast otherwise),
  `utc_now`, `row_to_dict`.
- `security.py` — PBKDF2-SHA256 hash/verify (120k iterations, constant-time compare).

**Frontend**
- `App.jsx` — HashRouter; `/` → CustomerForm, `/admin/*` → lazy AdminApp; unknown → `/`.
- `pages/CustomerForm.jsx` — splash, hero, 3-step explainer, validation, dual upload
  (screenshot + optional QR), UPI/QR payout toggle, animated scroll FAB, error/retry states.
- `pages/Success.jsx` — reference + copy + reset.
- `pages/admin/AdminApp.jsx` — auth probe/offline-retry/polling state machine, shell, nav;
  logout is backend-down safe (try/catch).
- `pages/admin/Login.jsx` — password form + optional Google GIS button (script loader).
- `pages/admin/Dashboard.jsx` — stats, filters, search, table (assetUrl-prefixed thumbnails).
- `pages/admin/Detail.jsx` — full record, lightboxes, status actions, notes editor.
- `pages/admin/Settings.jsx` — settings form + change-password.
- `components/ui.jsx` — Spinner, StatusPill, ErrorBox, SectionCard, CopyButton,
  ImageUpload (canvas compression + preview lifecycle), Lightbox/LightboxArea.
- `components/admin.jsx` — StatCard, ImageCell. `components/FoodIcon.jsx` (inline SVG art),
  `FloatingFood.jsx` (ambient animation).
- `lib/api.js` — fetch wrapper: multi-channel token (memory/localStorage/cookie stores;
  Bearer + `X-Admin-Token` + `?admin_token=` + cookie send), one-shot network retry,
  **non-JSON ⇒ backend-unreachable classification (PR #5)**, auth-401-only token clearing,
  `assetUrl()` API-base prefixing, typed endpoint methods.
- `lib/format.js` — money / UPI validation / date helpers (several unused — §7.8).
- `lib/image.js` — canvas compression (1600px/q0.82); `inspectQrImage` currently unused.
- `lib/status.js` — status pill metadata. `lib/adminRoute.js` — `/admin` constant.
- `index.css` — Tailwind 4 `@theme` (brand/cocoa/gold palette, shadows, keyframes).
- `vite.config.js` — dev proxy `/api` + `/uploads` → `VITE_BACKEND_URL` (default
  127.0.0.1:8000), `strictPort: true`, `host`/`allowedHosts` open for preview environments.
