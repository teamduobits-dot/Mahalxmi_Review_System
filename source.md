# source.md — Complete Source Map & Architecture Guide

> **Purpose:** one-stop reference for reading this codebase without re-reading every file.
> Covers every source file (path, role, contents, key functions), the runtime flow
> architecture, the data model, the API contract, and where things connect.
>
> **Generated:** 2026-09-10 · Branch `arena/01a08a4b-mahalxmi-review-system` (== `main` tip, commit `8f9161f`)
> **Stack:** React 19 + Vite 8 + Tailwind 4 (frontend) · FastAPI + SQLite (backend)
> **Companion docs:** `README.md` (run/deploy), `PROJECT_ANALYSIS.md` (verdicts + findings), `WINDOWS_LOCAL_SETUP.md` (PowerShell troubleshooting)

---

## 1. Big picture (30-second version)

A **review-for-cashback campaign tool** for **Mahalaxmi Multi Cuisine** (Swiggy/Toing).

```
Customer (public)                        Admin (password-protected)
┌────────────────────────────┐          ┌──────────────────────────────┐
│  /  (CustomerForm.jsx)     │          │  /#/admin  (AdminApp.jsx)    │
│  uploads review screenshot │          │  Login → Dashboard/Detail/   │
│  + name + order last-4     │          │  Settings; approve/paid/     │
│  + UPI ID or UPI QR image  │          │  reject; notes; pause;       │
└────────────┬───────────────┘          │  change password             │
             │ multipart POST            └────────────┬─────────────────┘
             ▼                                         ▼ bearer token or session cookie
        FastAPI (backend/main.py)  ──►  SQLite (backend/mahalaxmi.db) + backend/uploads/
        port 8000, single process

Frontend dev (Vite, port 5173) proxies /api and /uploads → 127.0.0.1:8000.
In production the backend itself serves the built frontend from my-react-app/dist.
```

**State machine of a submission:** `pending → approved → paid` (or `rejected`).
**Reference ID format:** `MMC-<year>-<zero-padded-6-digit-row-id>` e.g. `MMC-2026-000042`.

---

## 2. Complete file tree (with role)

```
Mahalxmi_Review_System/                      repo root
├── README.md                                run + deploy + troubleshooting (116 ln)
├── PROJECT_ANALYSIS.md                      analysis verdicts, security findings (≈345 ln)
├── WINDOWS_LOCAL_SETUP.md                   PowerShell guide + password reset (337 ln)
├── source.md                                ← this file
├── package-lock.json                        EMPTY STUB (no root package.json) — noise, deletable
├── .gitignore                               ignores backend/.env, *.db, uploads/, .venv/, __pycache__/
│
├── .github/workflows/deploy.yml             GitHub Pages deploy — frontend only; bakes VITE_API_BASE_URL from repo variable
│
└── backend/                                 Python API (flat imports; run uvicorn from inside this dir)
    ├── main.py              (496 ln)        ALL routes, auth, upload hardening, SPA hosting
    ├── database.py          (142 ln)        SQLite schema, idempotent seeding, connection helper
    ├── security.py           (32 ln)        PBKDF2-SHA256 password hashing
    └── requirements.txt                     fastapi==0.116.1, uvicorn[standard]==0.35.0,
                                             python-multipart==0.0.20, itsdangerous==2.2.0  (all pinned)

└── my-react-app/                            React frontend (Vite)
    ├── package.json                         scripts + deps (react 19, vite 8, tailwind 4, framer-motion, lucide-react, react-router-dom 7)
    ├── vite.config.js                       dev server 5173 (strictPort), proxy /api + /uploads → VITE_BACKEND_URL (default 127.0.0.1:8000)
    ├── index.html                           HTML shell + SEO meta (hard-coded ₹15/₹40 copy)
    ├── eslint.config.js                     flat config: js recommended + react-hooks + react-refresh + node globals for config files
    ├── .env.example                         VITE_API_BASE_URL, VITE_GOOGLE_CLIENT_ID (both empty locally)
    ├── .gitignore                           node_modules, dist, .env, .firebase/, editors
    ├── public/
    │   ├── favicon.svg                      brand favicon
    │   └── icons.svg                        extra icon set
    └── src/
        ├── main.jsx           (10 ln)       React entry: StrictMode + createRoot
        ├── App.jsx            (33 ln)       HashRouter: "/" → CustomerForm, "/admin/*" → lazy AdminApp
        ├── index.css         (189 ln)       Tailwind 4 @theme (palette/shadows/anims) + utility classes
        │
        ├── lib/                              (pure helpers, no JSX except api.js)
        │   ├── api.js        (192 ln)       fetch wrapper, multi-channel bearer token, retry, unreachable detection, API methods
        │   ├── format.js      (63 ln)       money/date/UPI-regex helpers (several unused)
        │   ├── image.js       (93 ln)       client canvas compression + (unused) QR inspection
        │   ├── status.js       (6 ln)       STATUS_META colors/labels per status
        │   └── adminRoute.js   (1 ln)       ADMIN_ROUTE = '/admin'
        │
        ├── components/
        │   ├── ui.jsx        (209 ln)       Spinner, StatusPill, ErrorBox, SectionCard, CopyButton,
        │   │                                ImageUpload, Lightbox/LightboxArea
        │   ├── admin.jsx      (42 ln)       StatCard, ImageCell
        │   ├── FoodIcon.jsx  (131 ln)       8 hand-drawn inline-SVG food icons
        │   └── FloatingFood.jsx (38 ln)     ambient floating-food background animation
        │
        └── pages/
            ├── CustomerForm.jsx (762 ln)    ENTIRE customer experience (splash, hero, steps, form, success)
            ├── Success.jsx      (36 ln)     reference ID + copy + "submit another"
            └── admin/
                ├── AdminApp.jsx  (338 ln)   auth gate, shell/nav, offline screen, 15 s polling
                ├── Login.jsx     (178 ln)   password form + optional Google Sign-In button
                ├── Dashboard.jsx (144 ln)   stat cards, filter chips, search, submissions table
                ├── Detail.jsx    (176 ln)   single submission: images, actions, notes
                └── Settings.jsx  (148 ln)   campaign settings form + change password
```

---

## 3. Runtime flow architecture

### 3.1 Customer submission flow (public)

```
Browser opens /            CustomerForm.jsx
   │ 1. useEffect: api.getSettings()          → GET /api/settings
   │    - minimum ~1.2 s branded splash (OpeningLoader) always shown
   │    - network failure (error.isNetwork) vs other failure → different retry screens
   │ 2. renders hero (cashbackAmount from settings; "₹40 OFF above ₹499" is HARD-CODED)
   │    - if campaignActive == false → "Cashback is paused" card, form hidden
   │ 3. user fills: review screenshot (ImageUpload → canvas compression),
   │    customerName (≥2 chars), orderLast4 (exactly 4 digits, input strips non-digits),
   │    payoutMethod toggle: 'upi' (UPI ID, regex-validated) | 'qr' (UPI QR image)
   │ 4. submit() builds FormData →
   ▼
POST /api/submissions  (multipart; backend/main.py create_submission)
   │   checks campaignActive → 400 pauseMessage
   │   name ≥ 2 chars · orderLast4 exactly 4 digits
   │   validate_image + save_upload(reviewScreenshot, "review")   ← written to disk FIRST
   │   UPI: requires "@" in upiId   |   QR: validate + save_upload(upiQr, "upiqr")
   │   INSERT submissions row (status 'pending', notes '')
   │   reference = f"MMC-{year}-{rowid:06d}"  (two-step: INSERT then UPDATE reference)
   ▼
{message, reference, status:"pending"}  →  CustomerForm sets success
   ▼
Success.jsx shows reference + CopyButton + "Submit another request" (resets form)
```

**Client image pipeline:** file pick (`accept="image/*"`, ≤8 MB client check) →
`compressImageFile()` (`lib/image.js`): draw to canvas scaled to ≤1600 px, white background
fill, re-encode PNG→PNG else JPEG at q0.82 → new `File` → blob preview URL.

**Server image pipeline:** read bytes → reject >8 MB → `detect_image_extension()` magic-byte
sniff (PNG `\x89PNG\r\n\x1a\n`, JPEG `\xff\xd8\xff`, WebP `RIFF....WEBP`; extension derived
from BYTES, never from filename/Content-Type) → store as `{prefix}-{uuid4hex}{ext}` in
`backend/uploads/` → return `/uploads/<name>` path. All responses carry
`X-Content-Type-Options: nosniff` (global middleware). HTML disguised as PNG → 400.

### 3.2 Admin auth flow

```
/#/admin  →  AdminApp.jsx mounts
   │ probeAuth(): GET /api/auth/me  (pure function, no setState)
   │   ├─ {user: admin}     → logged in; loadData()
   │   ├─ {user: null}      → not logged in; clearToken() (stale token); render <Login/>
   │   └─ {serverError}     → backend UNREACHABLE → ServerOfflineScreen (auto-retry every 5 s)
   │
   ▼ Login.jsx (two paths)
   │   path A: email+password form → onLogin → api.login
   │        POST /api/auth/login (form-encoded)
   │        - email ≠ DEFAULT_ADMIN_EMAIL → 401 "This email is not allowed."
   │        - PBKDF2 verify fails        → 401 "Invalid email or password."
   │        - success: server sets signed session cookie AND returns bearer token
   │   path B (only if VITE_GOOGLE_CLIENT_ID set): Google Identity Services button
   │        → api.loginWithGoogle → POST /api/auth/google
   │        - server verifies ID token at oauth2.googleapis.com/tokeninfo
   │        - checks aud == GOOGLE_CLIENT_ID, email_verified == "true",
   │          email == DEFAULT_ADMIN_EMAIL
   ▼
api.js stores token (multi-channel):
   - localStorage key "mm_admin_token" + IN-MEMORY fallback (survives sandboxed iframes)
   - first-party cookie "mm_admin_token" (survives gateways that strip headers)
   and sends it on every admin request via ALL of:
   - Authorization: Bearer <token>
   - X-Admin-Token: <token>
   - ?admin_token=<token> query param (admin endpoints only)
   - Cookie: mm_admin_token=<token>
   (preview gateways/iframe contexts can strip or block any single channel, so the
   backend accepts all of them — see resolve_admin)
   ▼
finishLogin → setAuthState({user}) → loadData()
   ▼
AdminShell renders sidebar/nav; Routes: Dashboard | Detail (submission/:id) | Settings
```

**Auth on every admin request:** `require_admin()` accepts the token from ANY of:
`Authorization: Bearer`, `X-Admin-Token` header, `?admin_token=` query param,
`mm_admin_token` cookie, or the starlette session cookie (`request.session["admin"]`),
and requires the payload email to equal `DEFAULT_ADMIN_EMAIL`. Failed auth logs exactly
which channels were present (INFO line with 5 booleans) so gateway stripping can be
diagnosed from the backend log alone.

### 3.3 Admin data flow (polling + resilience)

```
loadData() (AdminApp.jsx):
   Promise.all([ api.getSubmissions(), api.getAdminSettings() ])   → 15 s interval while logged in
   - success → setSubmissions/setSettings, clear pollError
   - failure → setPollError({message, status}), THROW (banner shows, user STAYS logged in)
PollBanner:
   - pollError.status === 401 → "session no longer valid" + "Sign in again" button (→ logout)
   - otherwise → "Could not refresh data: …" + "retrying automatically"
ConnectionBadge in shell: Online/Offline from pollError
```

**Offline vs logged-out vs bad-token (the PR #5 fix):** `apiFetch` treats any response
whose content-type is not `application/json` (e.g. Vite proxy's empty `text/plain` 502 when
the backend is down) or whose JSON body can't be parsed as `error.isNetwork = true`
("backend unreachable") — so the UI never renders a fake ₹0/"paused" page or an empty
login error from a proxy failure. A 401 clears the stored token ONLY on auth endpoints
(`/api/auth/me`, `/login`, `/google`); a 401 on data endpoints shows the session banner
instead of logging out.

### 3.4 Admin action flow (Detail.jsx)

```
Detail loads GET /api/admin/submissions/{id} (one-shot)
updateSubmission(status = current):
   PATCH /api/admin/submissions/{id}  JSON: {status, adminNotes: notes}
   server: status ∈ {pending,approved,paid,rejected} else 400
   adminNotes: only overwritten when the key is PRESENT (status-only PATCH preserves notes)
   approved_at stamped when moving to approved/paid (if unset); paid_at when paid
   → onUpdated() triggers parent loadData() refresh
```

### 3.5 Settings flow (Settings.jsx)

```
form state initialized from settings prop (render-time "adjust when props change" pattern)
Save settings → PUT /api/admin/settings
   server: businessName (default fallback), cashbackAmount int() in try/except → 400 on
   non-numeric; must be 1–10,000 → else 400; campaignActive truthy → 1/0; pauseMessage/
   successNote defaults. Updates app_settings id=1; returns fresh public payload.
Change password → POST /api/auth/change-password (form: currentPassword, newPassword)
   requires current password (PBKDF2 verify), new ≥ 8 chars. NOTE: does NOT invalidate
   existing tokens/sessions (known gap).
```

### 3.6 Static / SPA hosting (backend main.py, bottom)

- `GET|HEAD /` → `my-react-app/dist/index.html` if built, with `Cache-Control: no-cache`;
  else JSON `{ok, message: "Frontend build not found yet."}`.
- `GET|HEAD /{full_path}` → `api*`/`uploads*` prefixes → 404; resolve candidate inside
  `dist/` with `relative_to()` path-traversal guard; serve file if it exists, else SPA
  fallback to index.html (no-cache).
- `/uploads/*` is mounted as Starlette StaticFiles.

---

## 4. Backend reference (backend/)

> **Import gotcha:** `main.py` uses flat imports (`from database import ...`), so uvicorn
> must run **from inside `backend/`**: `cd backend && uvicorn main:app` (or
> `uvicorn main:app --app-dir backend` from the root).

### 4.1 `backend/database.py` (142 ln) — schema, seeding, connections

| Symbol | What it does |
|---|---|
| `BASE_DIR`, `DB_PATH` | `backend/mahalaxmi.db` |
| `UPLOADS_DIR` | `backend/uploads` (mkdir at import time) |
| `APP_ENV` | `os.getenv("APP_ENV")` lowercased |
| `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` | production: from `ADMIN_EMAIL`/`ADMIN_PASSWORD` env — **RuntimeError if missing**; dev: `team.duobits@gmail.com` / `aditya9922` (env-overridable) |
| `utc_now()` | `datetime.now(timezone.utc).isoformat()` string |
| `get_connection()` | context manager: `sqlite3.connect(DB_PATH, check_same_thread=False)`, `row_factory=Row`, commit on success, always close |
| `ensure_column(conn, table, column, definition)` | lightweight migration: `ALTER TABLE ... ADD COLUMN` if missing (PRAGMA table_info) |
| `init_db()` | CREATE TABLE IF NOT EXISTS ×3 + seed admin user + settings row (idempotent, runs in `on_startup`) |
| `row_to_dict(row)` | `sqlite3.Row` → dict (or None) |

**Schema DDL (exact):**

```sql
admin_users(id INTEGER PK AUTOINCREMENT, email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)

app_settings(id INTEGER PK CHECK (id = 1), business_name TEXT NOT NULL,
             cashback_amount INTEGER NOT NULL, campaign_active INTEGER NOT NULL DEFAULT 1,
             pause_message TEXT NOT NULL, success_note TEXT NOT NULL,
             created_at TEXT NOT NULL, updated_at TEXT NOT NULL)

submissions(id INTEGER PK AUTOINCREMENT, reference TEXT UNIQUE, customer_name TEXT NOT NULL,
            order_last4 TEXT NOT NULL, customer_comment TEXT NOT NULL DEFAULT '',  ← NEVER COLLECTED
            review_screenshot_path TEXT NOT NULL, payout_method TEXT NOT NULL,
            upi_id TEXT, upi_qr_path TEXT, status TEXT NOT NULL DEFAULT 'pending',
            admin_notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL, approved_at TEXT, paid_at TEXT)
```

**Password seeding note:** the admin row is seeded only if absent — env password changes
later do NOT update an existing DB row.

### 4.2 `backend/security.py` (32 ln) — password hashing

- `_ITERATIONS = 120_000`; `hash_password(pw)` → `"pbkdf2_sha256$120000$<salt-hex32>$<digest-hex64>"` (salt = `secrets.token_hex(16)`).
- `verify_password(pw, stored)` → split by `$`, check algorithm, recompute PBKDF2-SHA256, `hmac.compare_digest` (constant-time); any exception → False.

### 4.3 `backend/main.py` (496 ln) — everything else

**Module-level setup (in order):**
1. `ALLOWED_STATUSES = {"pending","approved","paid","rejected"}`
2. Production guard: `APP_ENV=production` without `SESSION_SECRET` → RuntimeError.
3. `SESSION_SECRET` = env or `"mahalaxmi-local-secret"` (dev fallback).
4. `GOOGLE_CLIENT_ID` = `GOOGLE_CLIENT_ID` or `VITE_GOOGLE_CLIENT_ID` env.
5. `FRONTEND_DIST_DIR` = `my-react-app/dist`, `FRONTEND_INDEX` = `dist/index.html`.
6. `token_serializer = URLSafeSerializer(SESSION_SECRET, salt="admin-token")`.
7. Middleware stack: `SessionMiddleware(same_site="lax", https_only=False)` →
   `CORSMiddleware(allow_origins=["http://localhost:5173","http://127.0.0.1:5173"],
   allow_origin_regex=r"https://.*\.e2b\.app", allow_credentials=True)` →
   `add_security_headers` (@app.middleware("http")): `X-Content-Type-Options: nosniff`
   on every response.
8. `app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR))`.

**Helpers:**

| Function | Behavior |
|---|---|
| `public_settings_payload()` | reads `app_settings` id=1 → camelCase dict: businessName, cashbackAmount, campaignActive, pauseMessage, successNote, **adminEmail (DEFAULT_ADMIN_EMAIL — public!)**, googleAuthEnabled |
| `admin_session_payload(email)` | lookup admin row → `{id, email}` or 401 "Admin account not found." |
| `make_admin_token(admin)` | serializer.dumps({id, email}) — signed, no expiry |
| `_token_from_request(request)` | extracts the bearer token from whichever channel survived: `Authorization: Bearer` → `X-Admin-Token` header → `?admin_token=` query param → `mm_admin_token` cookie (returns '' if none) |
| `resolve_admin(request)` | loads token from `_token_from_request`, requires email == DEFAULT_ADMIN_EMAIL and id > 0 (`BadSignature/ValueError/TypeError` → warning log + None); falls back to session cookie `request.session["admin"]` with email match |
| `require_admin(request)` | resolve or 401 "Please log in as admin." + diagnostic INFO log of which auth channels were present |
| `verify_google_token(credential)` | requires GOOGLE_CLIENT_ID; GET `oauth2.googleapis.com/tokeninfo?id_token=…` (timeout 10 s); checks `aud` == client id, `email_verified` == "true", `email` == admin email; network errors → 401 "Unable to verify Google sign-in." |
| `detect_image_extension(content)` | magic bytes → `.png` / `.jpg` / `.webp` / None (see §3.1) |
| `validate_image(file, field_name)` | missing file → 400 `"{field_name} is required."` |
| `save_upload(file, prefix)` | ≤8 MB; sniff extension; write `{prefix}-{uuid4.hex}{ext}`; return `/uploads/<name>` |
| `serialize_submission(row_dict)` | snake_case row → camelCase JSON: id, reference, customerName, orderLast4, customerComment, reviewScreenshotUrl, payoutMethod, upiId, upiQrUrl, status, adminNotes, createdAt, updatedAt, approvedAt, paidAt |

**Endpoints (full contract — see §6 for table):**

| Endpoint | Notes |
|---|---|
| `GET /api/health` | `{"ok": true}` |
| `GET /api/settings` | public settings payload |
| `POST /api/submissions` | multipart form; campaign gate; validations; creates row + reference (see §3.1) |
| `POST /api/auth/login` | form `email`, `password`; email allowlist → PBKDF2 → session + token |
| `POST /api/auth/google` | JSON `{credential}`; tokeninfo verification |
| `POST /api/auth/logout` | clears session (token is client-side only) |
| `GET /api/auth/me` | `{authenticated: bool, admin}` — never 401s |
| `POST /api/auth/change-password` | form `currentPassword`, `newPassword` (≥8 chars) |
| `GET /api/admin/settings` | require_admin → public settings payload |
| `PUT /api/admin/settings` | require_admin; validates businessName/cashback (1–10,000)/campaignActive/pauseMessage/successNote |
| `GET /api/admin/submissions?search=&status=` | require_admin; `status` != "all" filters exactly; search does `LIKE %x%` on LOWER(reference), customer_name, order_last4, COALESCE(upi_id,''); ORDER BY id DESC |
| `GET /api/admin/submissions/{id}` | require_admin; 404 if missing |
| `PATCH /api/admin/submissions/{id}` | require_admin; status whitelist; notes-preserving (see §3.4); stamps approved_at/paid_at |
| `GET /api/admin/dashboard` | require_admin; full list + counts `{submissions, stats:{total,pending,approved,paid,rejected}}` — **UNUSED by frontend** |
| `GET\|HEAD /` and `/{full_path}` | SPA hosting (see §3.6) |

**Known gaps (details in PROJECT_ANALYSIS.md §6–§8):** no token expiry/revocation; no rate
limiting; review file saved to disk before UPI validation (orphan risk); `https_only=False`
unconditionally; e2b.app CORS regex ships everywhere; deprecated `@app.on_event("startup")`;
Google endpoint accepts raw dict (no pydantic model); uploads never garbage-collected.

---

## 5. Frontend reference (my-react-app/)

### 5.1 Config & shell

**`package.json`** — scripts: `dev` (vite), `build` (vite build), `lint` (eslint .), `preview`.
Deps: `@tailwindcss/vite ^4.3.3`, `framer-motion ^13.2.0`, `lucide-react ^1.42.0`,
`react ^19.2.8`, `react-dom ^19.2.8`, `react-router-dom ^7.18.3`, `tailwindcss ^4.3.3`.
DevDeps: eslint 10 stack, vite 8, @vitejs/plugin-react 6, types packages, globals.
No state-management/HTTP/UI-kit libraries — everything hand-rolled.

**`vite.config.js`** — `defineConfig(({ mode }) => …)`; `loadEnv(mode, process.cwd(), '')`
so `.env` files work; dev server: `host: true`, `port: 5173`, **`strictPort: true`**
(fails loudly instead of silently shifting ports when busy), `allowedHosts: true`
(preview-friendly); proxy `/api` and `/uploads` → `env.VITE_BACKEND_URL ||
'http://127.0.0.1:8000'`; preview on 4173 with `strictPort: true`. `base: '/'`.

**`index.html`** — favicon `/favicon.svg`; theme-color `#FF5A1F`; meta description +
`<title>` **hard-code ₹15/₹40 copy** (drifts when admin changes settings); Google Fonts
Outfit + Plus Jakarta Sans; `#root`; module script `/src/main.jsx`.

**`.env.example`** — `VITE_API_BASE_URL=` (leave empty locally — Vite proxy handles it;
set to backend origin for split hosting) and `VITE_GOOGLE_CLIENT_ID=` (enables Google login).

### 5.2 Entry & routing

**`src/main.jsx`** — `createRoot(document.getElementById('root'))` renders `<StrictMode><App/></StrictMode>`, imports `./index.css`.

**`src/App.jsx`** — `HashRouter` (hash routing so it works on static hosts):
- `/` → `CustomerForm`
- `/admin/*` → `lazy(() => import('./pages/admin/AdminApp'))` inside `Suspense` (fallback "Opening admin dashboard...")
- `*` → `Navigate to "/"`

**`src/index.css`** (189 ln) — Tailwind 4 `@import "tailwindcss"` + `@theme` tokens:
- fonts: `--font-display: "Outfit", …`, `--font-sans: "Plus Jakarta Sans", …`
- palettes: `cream-50..300`, `brand-50..900` (orange: 500 = `#ff5a1f`, 600 = `#ef4209`),
  `cocoa-50..950` (brown text scale), `gold-50..700` (cashback accents)
- shadows: `--shadow-soft/card/pop/glow`; radii `4xl/5xl`
- keyframes/animations: `float`, `drift`, `pulseGlow`, `shimmer`, `pop`, `wiggle`, `twinkle`
  (+ `--animate-*` tokens)
- base: smooth scroll, no tap highlight, `overscroll-behavior-y: none`, antialiasing
- utility classes: `.no-scrollbar`, `.pb-safe/.pt-safe` (iOS safe-area),
  `.text-gradient-brand/.text-gradient-gold`, `.surface-warm/.surface-dark` (radial+linear
  gradients), `.btn-shine` (sweep ::after using `shimmer`), `.thin-scroll` (admin table),
  `prefers-reduced-motion` media query kills animations.

### 5.3 `src/lib/` (helpers)

**`lib/adminRoute.js`** — `export const ADMIN_ROUTE = '/admin'` (used by App.jsx + AdminApp redirect).

**`lib/status.js`** — `STATUS_META` per status: `{label, color, bg, dot}` for StatusPill:
pending (amber `#D97706`), approved (green `#15803D`), paid (olive `#4D7C0F`),
rejected (red `#B91C1C`).

**`lib/api.js`** (192 ln) — the entire HTTP layer. Key internals:
- `API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/,'')`
- `TOKEN_KEY = 'mm_admin_token'`, `TOKEN_COOKIE = 'mm_admin_token'`;
  `AUTH_PATHS = ['/api/auth/me','/api/auth/login','/api/auth/google']`; `RETRY_DELAY_MS = 700`
- `memoryToken` module variable — **in-memory token fallback** (sandboxed preview
  iframes can block localStorage entirely; the memory copy keeps the session alive)
- `getToken()` — localStorage value OR memory fallback (try/catch)
- `setToken(token)` — writes memory + localStorage AND a first-party
  `mm_admin_token` cookie (`Path=/; SameSite=Lax; Max-Age=86400`) — each store is a
  fallback for the others; `setToken('')` clears all three
- `clearToken()` — `setToken('')`
- `assetUrl(path)` — prefixes `API_BASE` to same-origin `/uploads/...` paths (skips
  absolute/data: URLs) so images work when frontend/backend are split
- `unreachableError(response)` — `Error` with `.isNetwork = true` + `.status`
- `fetchWithRetry` — one automatic retry after 700 ms on network failure
- `apiFetch(path, options)` — attaches BOTH `Authorization: Bearer` AND
  `X-Admin-Token` headers + `credentials:'include'`; for `/api/admin/*` paths also
  appends `?admin_token=` to the URL (last-resort channel when headers and cookies
  are stripped by preview gateways); **non-JSON response or unparseable body →
  unreachableError** (the PR #5 fix); HTTP error → `Error(data.detail)`; 401 on auth
  paths clears the stored token
- exported `api` methods: `getSettings`, `createSubmission(formData)`, `login(email,password)`
  (stores token), `loginWithGoogle(credential)` (stores token), `logout` (clears token in
  finally), `me`, `changePassword`, `getAdminSettings`, `saveAdminSettings(payload)`,
  `getSubmissions({search, status})`, `getSubmission(id)`, `updateSubmission(id, payload)`

**`lib/format.js`** (63 ln) — `formatDate` (en-IN, used by Dashboard+Detail),
`formatDateTime` (en-IN), `money(amount, '₹')` (en-IN locale grouping), `validUpiId` =
`/^[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}$/`. UNUSED: `timeAgo`, `formatDay`, `clamp`, `uid`,
`slugDate`.

**`lib/image.js`** (93 ln) — `compressImageFile(file, maxDim=1600, quality=0.82)`: Image +
object URL → canvas (scaled, white bg fill) → `toBlob` (PNG stays PNG, else JPEG) → new
File with corrected extension. UNUSED: `inspectQrImage` (BarcodeDetector + squareness
heuristic) and its `basicImageInfo` helper.

### 5.4 `src/components/`

**`components/ui.jsx`** (209 ln) — shared UI kit:
- `Spinner` — lucide Loader2 spinning
- `StatusPill({status})` — colored dot+label from STATUS_META (falls back to pending)
- `ErrorBox` — red rounded alert
- `SectionCard` — `forwardRef` white card (`ref` needed by CustomerForm scroll targets)
- `CopyButton` — clipboard API + `document.execCommand('copy')` fallback; 1800 ms "Copied" state
- `Lightbox({src, onClose})` — framer-motion fixed overlay, click-outside close
- `ImageUpload({label, hint, value, onChange, onRemove, disabled, maxMB=8})` — hidden file
  input; validates `image/*` + size; compresses; value shape `{file, previewUrl, fileName,
  size}`; blob URL revoked on change/unmount; replace/remove buttons over the preview
- `LightboxArea({src, onClose, children})` — wraps content + AnimatePresence Lightbox

**`components/admin.jsx`** (42 ln) — `StatCard({icon, label, value, sub, tone, delay})`
(motion entrance; tones brand/gold/green/blue/red) and `ImageCell({src, alt, className})`
(lazy `<img>` with rounded border; placeholder icon when no src).

**`components/FoodIcon.jsx`** (131 ln) — 8 hand-drawn inline SVG shapes (burger, fries,
pizza, taco, drink, hotdog, icecream, donut) in a `SHAPES` map with a shared `palette`;
default export `FoodIcon({type='burger', size=56, className})`. No external images.

**`components/FloatingFood.jsx`** (38 ln) — `ITEMS` array (8 absolute positions with
drift/float durations); `FloatingFood({count=6, opacity})` renders `aria-hidden`
pointer-events-none absolutely-positioned FoodIcons with CSS `drift`/`float` animations
(the ambient background on customer pages).

### 5.5 `src/pages/`

**`pages/CustomerForm.jsx`** (762 ln) — the whole public experience.
- Constants: `SWIGGY_URL`, `TOING_URL`, `INITIAL_FORM` (customerName, orderLast4,
  payoutMethod:'upi', upiId, reviewScreenshot, upiQr), `STEP_ITEMS` (3 explainer steps).
- State: settings / settingsError / form / touched / busy / loading / error / success /
  jumpMode; refs for steps/form scroll targets + rAF scroll animation.
- Effects: (1) settings load with ≥1.2 s splash floor and cleanup; (2) scroll listener
  computing `jumpMode` ('to-steps' / 'to-form' / 'back-to-steps') for the floating
  jump FAB (animated `animateScrollTo` with cubic easing).
- `validations` memo: nameOk (≥2), last4Ok (`/^\d{4}$/`), screenshotOk, upiBaseOk
  (validUpiId OR QR file); `canSubmit` = all.
- `submit()`: marks touched, builds FormData (`customerName`, `orderLast4`, `payoutMethod`,
  `reviewScreenshot`, + `upiId` or `upiQr`), `api.createSubmission`, on success stores
  response, resets form, scrolls top.
- Render branches: loading → `OpeningLoader` (animated food orbit splash); no settings →
  error/retry card (network vs generic message); main page → hero card (businessName,
  `money(settings.cashbackAmount)`, hard-coded "₹40 Flat OFF", OfferPills, amber
  "written comment is mandatory" notice) → paused card OR [3-step cards, success card,
  claim form (review ImageUpload + Swiggy/Toing PlatformCards, name + orderLast4 inputs,
  UPI/QR payout toggle, conditional UPI input or QR upload, ErrorBox, submit button),
  admin-access card (link `#/admin`), jump FAB].
- Subcomponents: `OfferPill` (tone → classes), `OpeningLoader`, `PlatformCard`
  (swiggy orange / toing pink styles, external links `target="_blank" rel="noreferrer"`).

**`pages/Success.jsx`** (36 ln) — `Success({reference, note, onReset})`: ✅ animation,
reference in mono font, success note, `CopyButton`, "Submit another request" (calls
`onReset` → hides success card and clears form).

**`pages/admin/AdminApp.jsx`** (338 ln) — auth gate + shell + data orchestration.
- `probeAuth()` — pure probe of `/api/auth/me` returning `{user}` or `{serverError}`.
- `ConnectionBadge`, `ServerOfflineScreen` (auto-retry every 5 s + "Retry now"),
  `PollBanner` (session-expired vs data-failure variants).
- `AdminShell` — desktop sidebar (Dashboard/Settings links, user email, ConnectionBadge,
  Logout) + mobile top bar/tab row.
- `AdminApp` state: `authState {loading, user, serverError}`, `authError`, `settings`,
  `submissions`, `loadingData`, `pollError {message, status}`.
- `loadData()` — `Promise.all([getSubmissions(), getAdminSettings()])`; failures set
  pollError and rethrow (never log out).
- Mount effect → probeAuth; if user → loadData. Offline retry interval while
  `serverError`. 15 s data poll while logged in. `retryNow` manual probe.
- `finishLogin` — requires `loginResponse.admin.email`, sets user, loads data.
- `login` / `loginWithGoogle` / `logout` (logout: `api.logout()` wrapped in try/catch —
  a dead backend still resets the UI to the login screen because `api.logout` clears
  the token in its finally block).
- Render: spinner while loading → offline screen → `<Login defaultEmail="team.duobits@gmail.com">`
  (hard-coded) → shell + PollBanner + Routes: index → Dashboard, `submission/:id` → Detail,
  `settings` → Settings, `*` → redirect `/admin`.

**`pages/admin/Login.jsx`** (178 ln) — dark glassmorphism login card.
- `GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID`; `loadGoogleScript()` loads
  `https://accounts.google.com/gsi/client` (deduped via data-attribute).
- Effect: if client id set → `google.accounts.id.initialize({client_id, callback})` +
  `renderButton` into ref (pill, outline); deps `[busy, onGoogleLogin]` (re-inits when
  busy changes). Google callback → `onGoogleLogin(credential)`.
- Password form: email pre-filled from `defaultEmail` (password NEVER pre-filled), submit
  → `onLogin(email.trim(), password)`; error text; footer shows `API_BASE` target and a
  hint when login fails but the API works elsewhere.

**`pages/admin/Dashboard.jsx`** (144 ln) — list + stats.
- `FILTERS = ['all','pending','approved','paid','rejected']`; client-side `filtered` memo
  (status + search across reference, customerName, orderLast4, upiId).
- `stats` memo: total/pending/approved/paid/rejected; Paid card sub =
  `money(paid * (settings?.cashbackAmount || 15))` (current amount — drifts historically).
- Header + Refresh button (`loading ? 'Refreshing...'`); 5 StatCards; filter chips; search
  input; table (min-w-820, horizontal scroll) columns: Reference (link to
  `submission/:id`), Customer, Order last 4, Review (`ImageCell` with `assetUrl`), Payout
  (upiId or 'UPI QR uploaded'), Status (`StatusPill`), Created (`formatDateTime`).
- Empty states distinguish fresh DB ("No submissions yet … normal, not an error") from
  filter mismatch.

**`pages/admin/Detail.jsx`** (176 ln) — single submission workspace.
- Loads `getSubmission(id)` + seeds notes state; `updateSubmission(status = current)` PATCHes
  `{status, adminNotes: notes}` and calls `onUpdated()` (parent refresh).
- Layout: back button; header (reference + StatusPill); 2/3 column: Customer details
  (Info cards), Review screenshot (click → Lightbox), Payout details (current cashback
  amount, UPI ID or QR lightbox); 1/3 column: Admin actions (Mark approved / Mark paid /
  Reject request), Admin notes textarea + "Save notes", error box, Quick links.
- `assetUrl()` prefixes screenshot/QR URLs for split hosting; `Info` helper component.

**`pages/admin/Settings.jsx`** (148 ln) — campaign settings + password.
- Form initialized from `settings` prop using the render-time "adjust state when props
  change" pattern (`settings !== prevSettings` → setForm).
- Customer form settings: businessName, cashbackAmount (number input, client clamps to
  ≥1), successNote, pauseMessage, campaignActive toggle switch → `saveSettings()` →
  `api.saveAdminSettings(form)` → `onSaved(updated)` + success message.
- Change password: current/next/confirm (required + match checks) →
  `api.changePassword` → clears fields; server enforces ≥8 chars + correct current.

---

## 6. Data model & API contract (quick reference)

### 6.1 Endpoint table

| Method | Path | Auth | Request | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/health` | — | — | `{ok:true}` | — |
| GET | `/api/settings` | — | — | public settings (incl. adminEmail) | — |
| POST | `/api/submissions` | — | multipart: customerName, orderLast4, payoutMethod (`upi`\|`qr`), reviewScreenshot (file), upiId?, upiQr? (file), customerComment? | `{message, reference, status:"pending"}` | 400: paused / name / last4 / UPI / QR missing / >8MB / bad magic bytes |
| POST | `/api/auth/login` | — | form: email, password | `{ok, admin:{id,email}, token}` | 401 email-not-allowed / invalid creds |
| POST | `/api/auth/google` | — | JSON `{credential}` | same as login | 400/401 (not configured / verify fail / not allowed) |
| POST | `/api/auth/logout` | — | — | `{ok:true}` | — |
| GET | `/api/auth/me` | optional | — | `{authenticated, admin}` | — |
| POST | `/api/auth/change-password` | required | form: currentPassword, newPassword | `{ok, message}` | 400 wrong current / <8 chars; 401 unauth |
| GET | `/api/admin/settings` | required | — | public settings payload | 401 |
| PUT | `/api/admin/settings` | required | JSON: businessName, cashbackAmount, campaignActive, pauseMessage, successNote | public settings payload | 400 non-numeric / out-of-range cashback; 401 |
| GET | `/api/admin/submissions?search=&status=` | required | query | serialized list (id DESC) | 401 |
| GET | `/api/admin/submissions/{id}` | required | — | serialized submission | 401 / 404 |
| PATCH | `/api/admin/submissions/{id}` | required | JSON: status?, adminNotes? | updated submission | 400 invalid status; 401; 404 |
| GET | `/api/admin/dashboard` | required | — | `{submissions, stats}` | 401 |
| GET/HEAD | `/`, `/{path}` | — | — | dist files / SPA fallback | 404 for api/uploads prefixes |

### 6.2 Client storage & tokens

The token is stored THREE ways client-side and sent FOUR ways per request — whichever
combination survives the hosting environment wins:
- **Memory** (module variable) — always works within the page session; survives blocked localStorage.
- **localStorage** `mm_admin_token` — survives reloads in normal browsers.
- **Cookie** `mm_admin_token` (JS-set, first-party, `SameSite=Lax`, 1 day) — sent on every request, survives gateways that strip custom headers.
- **Sent as**: `Authorization: Bearer`, `X-Admin-Token` header, `?admin_token=` query param (admin endpoints), and the `mm_admin_token` cookie.
- **Session cookie** — starlette `SessionMiddleware` (name `session`, `same_site=lax`,
  `https_only=False`) holds `{admin: {id, email}}`; accepted by `resolve_admin()` too.
- Token = itsdangerous URLSafeSerializer signed payload `{"id":1,"email":…}` — signed,
  NOT encrypted, no expiry. The `?admin_token=` copy appears in backend access logs;
  rotating `SESSION_SECRET` invalidates all outstanding tokens.

### 6.3 Environment variables

| Var | Where read | Effect |
|---|---|---|
| `APP_ENV` | backend (database.py, main.py) | `"production"` → fail-fast without secrets; disables default creds |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | database.py | production admin (mandatory in prod; optional override in dev) |
| `SESSION_SECRET` | main.py | signs sessions + bearer tokens (mandatory in prod) |
| `GOOGLE_CLIENT_ID` (or `VITE_GOOGLE_CLIENT_ID`) | main.py | enables `/api/auth/google` |
| `VITE_API_BASE_URL` | api.js (build-time) | backend origin for split hosting (empty = same origin / Vite proxy) |
| `VITE_GOOGLE_CLIENT_ID` | Login.jsx (build-time) | shows Google sign-in button |
| `VITE_BACKEND_URL` | vite.config.js (dev-server only, via loadEnv) | proxy target override for `/api` + `/uploads` (default `http://127.0.0.1:8000`) |

---

## 7. Cross-file dependency graph (who imports whom)

```
backend:
  main.py ──► database.py ──► security.py
               (init_db, get_connection, row_to_dict, utc_now, DEFAULT_ADMIN_EMAIL, UPLOADS_DIR)
  main.py ──► security.py (hash_password, verify_password)

frontend:
  main.jsx ──► App.jsx ──► CustomerForm.jsx
                        └─► lazy pages/admin/AdminApp.jsx
  CustomerForm.jsx ──► lib/api, lib/format (money, validUpiId), components/ui
                       (ErrorBox, ImageUpload, SectionCard, Spinner), components/FoodIcon,
                       components/FloatingFood, pages/Success
  Success.jsx ──► components/ui (CopyButton, SectionCard)
  AdminApp.jsx ──► lib/api (api, clearToken), lib/adminRoute, components/ui (Spinner),
                   pages/admin/{Login, Dashboard, Detail, Settings}
  Login.jsx ──► lib/api (API_BASE), components/ui (Spinner)
  Dashboard.jsx ──► lib/api (assetUrl), lib/format (formatDateTime, money),
                    components/admin (StatCard, ImageCell), components/ui (StatusPill)
  Detail.jsx ──► lib/api (api, assetUrl), lib/format (formatDateTime, money),
                 components/admin (ImageCell), components/ui (ErrorBox, LightboxArea,
                 SectionCard, Spinner, StatusPill)
  Settings.jsx ──► lib/api, components/ui (ErrorBox, SectionCard, Spinner)
  ui.jsx ──► lib/image (compressImageFile), lib/status (STATUS_META)
  admin.jsx ──► (lucide-react only)
  FloatingFood.jsx ──► FoodIcon
```

**Data flow shortcuts to remember:**
- Settings come ONLY from `GET /api/settings` (customer) and `GET /api/admin/settings` (admin shell).
- Submissions reach the Dashboard ONLY through `AdminApp.loadData()` polling (15 s) —
  child pages never fetch the list themselves.
- The only auth state is the `authState` in AdminApp + the localStorage token in api.js.

---

## 8. Naming conventions & gotchas

- **Reference ID:** `MMC-<YYYY>-<6-digit rowid>` — rowid from `cursor.lastrowid`, zero-padded.
- **Uploaded files:** `review-<uuid4hex>.<ext>` / `upiqr-<uuid4hex>.<ext>` in `backend/uploads/`; DB stores the URL path `/uploads/<name>`; the admin UI prefixes `VITE_API_BASE_URL` via `assetUrl()`.
- **Timestamps:** UTC ISO-8601 strings (`utc_now()`), displayed with `formatDateTime` (en-IN).
- **Statuses:** lowercase strings — `pending, approved, paid, rejected` (`ALLOWED_STATUSES` / `STATUS_META` / `FILTERS` all agree).
- **JSON casing:** backend serializes to camelCase; DB columns are snake_case.
- **The hard-coded copy:** "₹40 Flat OFF above ₹499" (CustomerForm ×3), "₹15" (index.html title + meta) — these do NOT follow settings changes.
- **Unused/dead code:** `api/admin/dashboard` endpoint; `lib` helpers `timeAgo, formatDay, clamp, uid, slugDate, inspectQrImage`; `customer_comment` column (never collected); root `package-lock.json` stub.
- **Backend must run from `backend/`** (flat imports). Frontend must run from `my-react-app/` (npm scripts).
- **`Settings.jsx` mutates state during render** to sync prop changes (legal React pattern, intentional).

---

## 9. Where to look when something breaks

| Symptom | Start here |
|---|---|
| Customer page shows "Cannot reach the backend" | backend down / not on 8000; or opened port 8000 instead of 5173. `api.js → apiFetch → unreachableError`; `CustomerForm.jsx` `!settings` branch |
| Admin shows offline screen | same, but `AdminApp.jsx → ServerOfflineScreen` (auto-retry 5 s) |
| Admin login succeeds but dashboard says 401/"Please log in as admin." | the hosting gateway/iframe is stripping auth channels — the app now sends the token 4 ways (Bearer, X-Admin-Token, ?admin_token=, mm_admin_token cookie) and keeps 3 stores (memory, localStorage, cookie); check the backend log's `Admin auth failed — …` INFO line to see which channels arrived |
| Login works in Swagger but not in the UI | different backend process / stale DB — `WINDOWS_LOCAL_SETUP.md` §6–§8; UI also prints the API target under the login form |
| Vite exits with "Port 5173 is already in use" | intended (strictPort) — kill the process holding the port instead of letting Vite silently shift ports |
| Upload rejected "Only PNG, JPEG or WebP…" | `main.py → detect_image_extension` (magic bytes) — file isn't really one of those (or >8 MB) |
| Reference ID wrong / duplicate | `main.py → create_submission` two-step INSERT+UPDATE reference |
| Admin notes vanished after status change | `main.py → update_submission` notes-preserving logic (payload.get("adminNotes") is None check) |
| Deployed GitHub Pages site can't log in | expected: no backend on `*.github.io`; `deploy.yml` never sets `VITE_API_BASE_URL` (README drift — see PROJECT_ANALYSIS.md §7.1) |
| Stale frontend after redeploy | `main.py` serves index.html with `Cache-Control: no-cache`; hard-refresh |
| Cashback amount shown differs from DB | settings come from `/api/settings`; ₹15 in title/meta is hard-coded HTML |
| Password reset without the UI | `WINDOWS_LOCAL_SETUP.md` §4 (SQLite update via Python hash helper) |

---

## 10. How to run it (60-second version)

```bash
# backend (from repo root)
python -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
cd backend && ../.venv/bin/python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
# → creates + seeds backend/mahalaxmi.db on first start

# frontend (second terminal)
cd my-react-app && npm install && npm run dev
# → http://localhost:5173/  (customer)   http://localhost:5173/#/admin  (admin)
# API docs: http://localhost:8000/docs
```

**Default local admin:** `team.duobits@gmail.com` / `aditya9922` (dev only — production
requires `APP_ENV=production` + `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`SESSION_SECRET`).
