# Project Analysis — Mahalaxmi Review / Cashback System

*Analyzed: 2026-09-09 · Branch: `arena/01a0883a-mahalxmi-review-system` (commit `8fa507d`) — this document supersedes the previous analysis and reflects the current state after the cleanup/hardening merge (PR #4).*

---

## 1. Executive summary

This repository is a **review-for-cashback campaign tool** for **Mahalaxmi Multi Cuisine**
(a restaurant on Swiggy / Toing). A customer who posts a rating + written comment in
the delivery app uploads proof and claims a small cashback (₹15 by default) via UPI ID
or a UPI QR image. A password-protected admin panel reviews each claim and moves it
through `pending → approved → paid` (or `rejected`), with admin notes, search/filter,
campaign pause controls, and a change-password screen.

- **Frontend** — React 19 + Vite 8 + Tailwind CSS 4 (`my-react-app/`), HashRouter, framer-motion
- **Backend** — FastAPI + SQLite + local file uploads (`backend/`), ~665 lines of Python
- **~2,750 lines of live frontend source** — the large dead Firebase/legacy layer flagged in the
  previous analysis (~40 % of the frontend) has been **fully removed**, along with the `firebase`
  dependency, the Firestore/Storage rule files, and `firebase.json`

The system was **re-verified end-to-end during this analysis** (28 checks — see §5): install,
lint, production build, backend boot + seeding, customer submissions (UPI and QR), the
hardened upload path, auth (success/failure paths, bearer + session), admin workflow
transitions, notes preservation, search/filter, static upload serving with `nosniff`, path
traversal resistance, and SPA hosting from the backend.

**Overall verdict:** clean, small, genuinely functional code for a local / single-restaurant
tool — and materially **more secure than at the last review** (stored-XSS upload fix, magic-byte
validation, production fail-fast on missing secrets, relative-URL fix for split hosting).
It is still **not production-ready as-is**. Top remaining gaps: (1) the GitHub Pages workflow
deploys a frontend that cannot reach any backend — and the README's claim about
`VITE_API_BASE_URL` is not implemented in the workflow; (2) no rate limiting on login and
default credentials documented in a public repo; (3) admin tokens never expire and are not
revoked on password change; (4) settings validation bugs (HTTP 500 on bad input, negative
cashback accepted); (5) zero tests / no backend CI.

---

## 2. Repository layout

```
Mahalxmi_Review_System/
├── README.md                      ← accurate, honest, covers run + deploy + troubleshooting
├── PROJECT_ANALYSIS.md            ← this file
├── WINDOWS_LOCAL_SETUP.md         ← PowerShell run/troubleshoot guide (337 ln, good)
├── package-lock.json              ← empty stub, no root package.json — noise, deletable
├── .github/workflows/deploy.yml   ← GitHub Pages deploy: frontend only (see §7 gap)
├── .gitignore                     ← correctly ignores db, uploads, dist, .venv, backend/.env
└── backend/                       ← LIVE API (Python 3.10+, no framework DB/ORM)
    ├── main.py          (490 ln)  all routes, auth, upload hardening, SPA hosting
    ├── database.py      (142 ln)  SQLite schema + idempotent seeding + migrations
    ├── security.py       (32 ln)  PBKDF2-SHA256 (120k iters, per-user salt)
    └── requirements.txt           fastapi 0.116.1, uvicorn 0.35.0, python-multipart, itsdangerous (all pinned)

my-react-app/                      ← LIVE frontend (React 19.2, Vite 8.2, Tailwind 4.3)
├── vite.config.js                 ← /api + /uploads dev proxy → 8000; allowedHosts for previews
├── index.html                     ← SEO meta (hard-coded ₹15/₹40 copy — drift risk)
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
the bundle honest (one 129 kB-gzip main chunk + a 9 kB-gzip lazy admin chunk).

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
  (rendered only when `VITE_GOOGLE_CLIENT_ID` is set). Email is pre-filled, password is not
  (fixed since last review). Server accepts only the single allowed admin email.
- **AdminApp** probes `/api/auth/me` on mount and carefully distinguishes three states:
  *logged in*, *not logged in*, *backend unreachable* (auto-retry every 5 s with a dedicated
  offline screen + "Retry now"). Data (submissions + settings) refreshes every 15 s;
  a failed refresh shows a banner but **never** forces logout — only 401-on-auth-endpoint
  clears the stored token. This resilience layer is genuinely well-engineered.
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
  `ADMIN_EMAIL`/`ADMIN_PASSWORD`; **in `APP_ENV=production` these env vars are mandatory
  and the server refuses to boot without them** (dev keeps documented defaults).
- `app_settings(id=1, business_name, cashback_amount, campaign_active, pause_message, success_note, …)`.
- `submissions(id, reference UNIQUE, customer_name, order_last4, customer_comment
  [never collected — §6.3], review_screenshot_path, payout_method, upi_id, upi_qr_path,
  status, admin_notes, created/updated/approved/paid_at)` — timestamps as UTC ISO-8601 strings.

**Auth model:** PBKDF2-SHA256 (120k iterations, random salt, constant-time compare). Login
sets a signed session cookie (starlette SessionMiddleware) and returns a signed bearer token
(itsdangerous URLSafeSerializer) stored in `localStorage`. `resolve_admin()` accepts either.
Google login verifies the ID token against `oauth2.googleapis.com/tokeninfo` with
`aud` + `email_verified` + email-allowlist checks. Approving/paid stamps `approved_at` /
`paid_at`; there is no enforced status workflow (admin may jump any state to any state —
the UI only offers forward actions, so acceptable for a single-admin tool).

**Upload hardening (new since last review, verified):** `detect_image_extension()` sniffs
magic bytes (PNG/JPEG/WebP only); the extension is derived from the bytes, never from the
client filename or Content-Type; a global middleware adds `X-Content-Type-Options: nosniff`.
An HTML file sent as `image/png` is now rejected with 400.

---

## 4. What was fixed since the previous analysis ✔

The merge of PR #4 resolved most of the previous report's findings:

| Previous finding | Status now |
|---|---|
| ~2,000+ lines of dead Firebase/legacy frontend (pages, libs, rules, config) | **Deleted** — no `firebase` import anywhere, not in the production bundle (grep-verified), dependency removed |
| Stored-XSS via uploads (filename/Content-Type trust) | **Fixed** — magic-byte sniffing, server-derived extension, PNG/JPEG/WebP whitelist, `nosniff` on all responses (attack now returns 400 — verified) |
| Hard-coded default credentials could reach production | **Mitigated** — `APP_ENV=production` refuses to start without `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`SESSION_SECRET`; password field no longer pre-filled |
| `/uploads` URLs break when frontend/backend hosted separately | **Fixed** — `assetUrl()` in `lib/api.js` prefixes `VITE_API_BASE_URL`, used by Dashboard + Detail |
| Status-only PATCH could wipe admin notes | **Fixed** — server only overwrites notes when the field is actually sent (verified) |
| Stale `dist` cached after redeploy | **Fixed** — `Cache-Control: no-cache` on index.html |
| Confusing offline vs. logged-out admin UX | **Fixed** — dedicated offline screen, 5 s auto-retry, "session expired" banner distinct from data-refresh failure |
| Path traversal in SPA file serving | **Guarded** — resolved-path `relative_to()` check (verified `/uploads/../database.py` → 404) |

---

## 5. Verified behavior (fresh smoke tests run during this analysis)

Environment: Python 3.11.2, Node 22.22.3. All 28 checks passed except where noted.

**Build/lint**
1. `npm install`, `npx eslint .` → **clean**; `npm run build` → succeeds.
2. Bundle: `index-*.js` 407.85 kB (129.50 kB gzip), lazy `AdminApp` chunk 36.28 kB
   (9.01 kB gzip), CSS 51.31 kB (9.59 kB gzip). No `firebase` string in the bundle.

**Backend & API**
3. Backend boots, creates + seeds `backend/mahalaxmi.db` (admin + settings singleton).
4. `GET /api/health` → `{"ok":true}`; `GET /api/settings` → correct payload.
5. Login: wrong password → 401 "Invalid email or password."; wrong email → 401 "This email
   is not allowed."; correct → session cookie + bearer token.
6. `POST /api/submissions` (UPI variant and QR variant) → 200 with references
   `MMC-2026-000001`, `MMC-2026-000002`.
7. **XSS upload attempt** (HTML bytes, filename `.png`, `Content-Type: image/png`) →
   **400 "Only PNG, JPEG or WebP images are accepted."** ✔ fix confirmed.
8. 3-digit order id → 400; invalid UPI → 400.
9. Admin list without auth → 401; with bearer token → both submissions.
10. PATCH `approved` → stamps `approved_at`; notes-only PATCH → saves notes;
    **status-only PATCH to `paid` preserves existing notes**; invalid status → 400;
    `rejected` + notes works. `paid_at`/`approved_at` stamped correctly.
11. Search `ravi` → 1 hit; `status=paid` filter → 1 hit (LIKE search is SQL-parameterized).
12. `/uploads/<file>` → `content-type: image/png` **and** `x-content-type-options: nosniff`.
13. `/uploads/../database.py` (path traversal) → 404.
14. `GET /api/admin/dashboard` → correct stats (endpoint works but no frontend calls it).
15. Change-password with wrong current password → 400.
16. Bearer token from before remains valid indefinitely (no expiry — see §6).
17. **`PUT /api/admin/settings` with `cashbackAmount:"abc"` → HTTP 500** (unhandled
    `ValueError`); **`cashbackAmount:-50` → accepted (200)** — server-side validation gap.
18. SPA hosting: `/` serves the built `dist`; deep route `/some/deep/route` → 200 fallback;
    `cache-control: no-cache` on index.

---

## 6. Security review (current state, ranked)

1. **Public default credentials.** The repo (public) documents
   `team.duobits@gmail.com / aditya9922`, and dev-mode seeding uses them. Production mode
   now requires env vars, but if the real deployment was ever seeded with these defaults,
   anyone reading GitHub can log in. **Action: change the password on the live system and
   treat the documented pair as compromised.** (Also note the token serializer salt is
   public knowledge if `SESSION_SECRET` ever fell back to the dev default.)

2. **Admin tokens: no expiry, no revocation.** Bearer tokens are signed, **not encrypted**
   (payload `{"id":1,"email":…}` is visible base64), never expire, and stay valid after a
   password change (verified — check 15/16). Fix: add an expiry timestamp to the payload,
   validate it in `resolve_admin()`, and include a password-generation marker so changing
   the password invalidates outstanding tokens.

3. **No rate limiting / brute-force protection.** `/api/auth/login` and
   `POST /api/submissions` are unbounded. Once #1 is fixed this matters. A tiny in-memory
   attempt counter (e.g. 10 tries / 15 min / IP) is enough for a single-host deployment.

4. **Settings endpoint robustness (new finding).** `PUT /api/admin/settings` crashes with
   500 on non-numeric `cashbackAmount` and accepts negative values. Fix: `int()` inside a
   try/except → 400, and clamp to a sane range (1–10,000). A pydantic model for the body
   would fix this class of bug.

5. **Session cookie & CORS hardening for production.** `https_only=False` unconditionally
   (fine on plain-HTTP localhost, wrong behind TLS in prod — gate on `APP_ENV`); CORS
   allows `https://.*\.e2b\.app` with credentials (dev convenience that should not ship to
   a production config); no `Strict-Transport-Security`.

6. **Minor:** `/api/settings` discloses the admin email (used by the login screen copy —
   accepted trade-off, but worth knowing); login email pre-filled from a hard-coded string
   in `AdminApp.jsx` (should come from settings); change-password does not log out other
   sessions; `@app.on_event("startup")` is deprecated in FastAPI (use a lifespan handler);
   Google login accepts a raw `dict` without a pydantic model.

**What's done right:** PBKDF2 with per-user salt and constant-time compare; single-admin
email allowlist enforced server-side on both login paths; Google `aud` + `email_verified`
verification against Google's tokeninfo endpoint; magic-byte upload validation with
whitelisted extensions; 8 MB server-side cap; `nosniff` globally; path-traversal guard on
SPA file serving; SQL is fully parameterized (LIKE search included); customer endpoints
never expose other customers' data; only last-4 order digits stored (good privacy instinct);
uploads/db/.env gitignored.

---

## 7. Functional gaps & deployment readiness

1. **The GitHub Pages deploy is broken by design (doc/workflow drift — new finding).**
   README says the workflow "bakes in `VITE_API_BASE_URL` from a repository variable", but
   `.github/workflows/deploy.yml` has **no `env:` block at all** — the build runs with an
   empty API base, so the deployed site calls same-origin `/api` on `*.github.io`, where no
   backend exists (exactly the "deployed page shows login errors" symptom the README
   describes). Fix: add
   `env: VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}` to the Build step, host the
   backend somewhere (single VPS/container — SQLite + local uploads do not survive
   ephemeral/serverless platforms), and set the repo variable.

2. **No tests and no backend CI.** Not one test in the repo; the only workflow deploys.
   The API is small and deterministic — a FastAPI `TestClient` smoke suite (login, submit,
   upload rejection, status transitions) would take an afternoon and belongs in CI.

3. **No pagination.** `GET /api/admin/submissions` returns every row and the admin polls
   the full list every 15 s. Fine for hundreds of rows; will degrade with a popular campaign.

4. **No duplicate/fraud signal.** Only last-4 order digits + eyeballing the screenshot.
   The previous (deleted) generation had screenshot-hash duplicate detection — worth
   re-implementing server-side as the campaign grows.

5. **`customer_comment` column still never collected.** Schema/API/admin serialization
   support it; the form never sends it. Add the optional field or drop the column.

6. **Offer copy is hard-coded.** "₹40 Flat OFF / above ₹499" appears 3× in
   `CustomerForm.jsx` and in `index.html` title + meta description (which also hard-codes
   "₹15"). When settings change, the deployed page's SEO copy silently drifts.

7. **Small leftovers:** unused `GET /api/admin/dashboard` endpoint; unused helpers
   (`inspectQrImage`, `formatDate`, `timeAgo`, `formatDay`, `clamp`, `uid`, `slugDate` in
   `lib/`); empty root `package-lock.json` stub with no root `package.json`; `Settings.jsx`
   uses the render-time "adjust state when props change" pattern (legal but easy to get
   wrong — an effect or key-remount would be more conventional).

---

## 8. What to do next (priority order)

**Before real traffic**
1. Rotate the live admin password; confirm the deployed backend runs with
   `APP_ENV=production` + env secrets.
2. Add token expiry + password-change revocation in `resolve_admin()`/`make_admin_token()`.
3. Add login rate limiting (simple in-memory counter per IP).
4. Fix `PUT /api/admin/settings` validation (pydantic model; reject non-numeric and
   out-of-range amounts with 400).

**Deployment**
5. Fix `deploy.yml` to pass `VITE_API_BASE_URL` from a repo variable; document the backend
   host choice (single VPS/container); gate `https_only`/CORS on `APP_ENV=production`.

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
  middleware; `resolve_admin`/`require_admin` (bearer or session); `verify_google_token`;
  `detect_image_extension` (magic bytes) + `save_upload`; submission create/list/get/patch
  (notes-preserving); SPA static hosting with no-cache index.
- `database.py` — sqlite3 connection factory, schema, `ensure_column` migration helper,
  idempotent admin/settings seeding (env-driven in production), `utc_now`, `row_to_dict`.
- `security.py` — PBKDF2-SHA256 hash/verify (120k iterations, constant-time compare).

**Frontend**
- `App.jsx` — HashRouter; `/` → CustomerForm, `/admin/*` → lazy AdminApp; unknown → `/`.
- `pages/CustomerForm.jsx` — splash, hero, 3-step explainer, validation, dual upload
  (screenshot + optional QR), UPI/QR payout toggle, animated scroll FAB, error/retry states.
- `pages/Success.jsx` — reference + copy + reset.
- `pages/admin/AdminApp.jsx` — auth probe/offline-retry/polling state machine, shell, nav.
- `pages/admin/Login.jsx` — password form + optional Google GIS button (script loader).
- `pages/admin/Dashboard.jsx` — stats, filters, search, table (assetUrl-prefixed thumbnails).
- `pages/admin/Detail.jsx` — full record, lightboxes, status actions, notes editor.
- `pages/admin/Settings.jsx` — settings form + change-password.
- `components/ui.jsx` — Spinner, StatusPill, ErrorBox, SectionCard, CopyButton,
  ImageUpload (canvas compression + preview lifecycle), Lightbox/LightboxArea.
- `components/admin.jsx` — StatCard, ImageCell. `components/FoodIcon.jsx` (inline SVG art),
  `FloatingFood.jsx` (ambient animation).
- `lib/api.js` — fetch wrapper: bearer token, one-shot network retry, auth-401-only token
  clearing, `assetUrl()` API-base prefixing, typed endpoint methods.
- `lib/format.js` — money / UPI validation / date helpers (several unused — §7.7).
- `lib/image.js` — canvas compression (1600px/q0.82); `inspectQrImage` currently unused.
- `lib/status.js` — status pill metadata. `lib/adminRoute.js` — `/admin` constant.
- `index.css` — Tailwind 4 `@theme` (brand/cocoa/gold palette, shadows, keyframes).
- `vite.config.js` — dev proxy `/api` + `/uploads` → 127.0.0.1:8000, `allowedHosts: true`.
