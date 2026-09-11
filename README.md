# Mahalaxmi Cashback Upload System

A simplified cashback collection app for Mahalaxmi Multi Cuisine.

## What it does

### Customer side
Customers only need to:
- upload their review screenshot
- enter their name
- enter the last 4 digits of their Order ID
- provide a UPI ID **or** upload a UPI QR image

After submitting, they land on a dedicated animated success page ("your cashback is
on its way") and can later **track their cashback status** with the reference ID
at `/#/status` (public, no login — via `GET /api/submissions/status/{reference}`,
which never exposes name, UPI, or screenshots).

### Admin side
The admin panel is reached **only** by its URL (`/#/admin`) — the customer page
intentionally shows no admin link. Admin can:
- log in with the allowed admin email **typed manually** (the email is never
  pre-filled or revealed anywhere in the app)
- view all submissions in a dashboard
- open each submission in detail
- approve, reject, or mark paid
- save admin notes
- **permanently delete any submission** (row + its uploaded screenshot/QR files)
- **track upload storage usage** (review screenshots vs QR images vs orphan
  files, quota bar on the dashboard + a dedicated Storage page with orphan
  cleanup and an editable quota in Settings)
- update customer-facing settings
- change the admin password (invalidates all other sessions/tokens)

## Stack
- **Frontend:** React + Vite + Tailwind CSS (hosted on Firebase Hosting)
- **Backend:** FastAPI (Python), runs locally or on Google Cloud Run
- **Two backend modes** (same API, chosen by `BACKEND_MODE`):
  - `local` — SQLite (`backend/mahalaxmi.db`) + uploads on disk
    (`backend/uploads/`). Zero-config development. **This is the default
    everywhere except Cloud Run.**
  - `firebase` — Cloud Firestore + Firebase Storage (private bucket).
    Auto-selected on Cloud Run (`K_SERVICE` present). See
    `CLOUD_DEPLOYMENT.md` for the full Hosting → Cloud Run → Firestore /
    Storage architecture and step-by-step deployment.
- Admin image access is private in both modes; in firebase mode the bucket is
  locked down and images stream through an authenticated admin endpoint.

## Default admin login (local development only)
- **Email:** `team.duobits@gmail.com`
- **Password:** `aditya9922`

⚠️ These hard-coded defaults exist **only so local dev works out of the box**.
They are disabled entirely in production (`APP_ENV=production` refuses to boot
without `ADMIN_EMAIL`/`ADMIN_PASSWORD`), and the production admin password must
come from Secret Manager — never from this file or the repo. **Rotate the
password from the admin Settings screen before/after going live.**

You can change the password from the admin settings screen. **Changing it
invalidates every outstanding admin token and session** (except the current
tab, which receives a fresh token).

**Production:** run the backend with `APP_ENV=production` plus `ADMIN_EMAIL`,
`ADMIN_PASSWORD` and `SESSION_SECRET` set as environment variables (or in a
`backend/.env` file — see `backend/.env.example`). In that mode all hard-coded
defaults are disabled and the server refuses to start if any of them is
missing — never deploy with the default password. In production the login
errors are generic (no account enumeration), admin tokens expire
(`ADMIN_TOKEN_TTL_HOURS`, default 24 h), the URL-token auth channel is
disabled, `https_only` sessions + HSTS + CSP are enforced, CORS is restricted
to `CORS_ORIGINS` (set it to your Firebase Hosting domain), and login +
submission endpoints are rate-limited.

## Local setup (quick start)

**Prerequisites:** Node.js 20+ and Python 3.10+.
(Windows PowerShell: use `.venv\Scripts\` instead of `.venv/bin/`, and `curl.exe` instead of `curl`.)

### 1) Install (first time only)
```bash
# backend — virtual env at the repo root
python -m venv .venv
.venv/bin/pip install -r backend/requirements.txt

# frontend
cd my-react-app
npm install
cd ..
```

### 2) Run (two terminals)
```bash
# terminal 1 — backend API on port 8000
cd backend
../.venv/bin/python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# terminal 2 — frontend on port 5173
cd my-react-app
npm run dev
```
First start creates and seeds `backend/mahalaxmi.db` (admin + settings) automatically.

### 3) Open
- Customer form: `http://localhost:5173/`
- Admin panel: `http://localhost:5173/#/admin` (use the credentials above)
- API docs (Swagger): `http://localhost:8000/docs`

### 4) Optional env vars — copy `my-react-app/.env.example` to `my-react-app/.env`
- `VITE_API_BASE_URL` — **leave empty in local dev** (Vite proxies `/api` and `/uploads` to port 8000). Set it to your backend URL only when the frontend is hosted elsewhere. Restart `npm run dev` after any `.env` change.
- `VITE_GOOGLE_CLIENT_ID` — enables the Google sign-in button on the admin login (only the allowed admin email can sign in).
- `VITE_BACKEND_URL` — dev-server only: overrides where the Vite proxy sends `/api` and `/uploads` (default `http://127.0.0.1:8000`). Set it only if your backend runs on a different port/host.

> **Ports are fixed by design:** frontend `5173`, backend `8000` (preview `4173`). The dev
> server uses `strictPort: true`, so if a port is busy it **fails loudly** instead of
> silently shifting to `5174`/`8001` and breaking the proxy + docs. Kill whatever holds
> the port (`netstat -ano | findstr :5173` on Windows) and restart.

## Cloud deployment (Firebase Hosting + Cloud Run)

The production architecture is fully serverless — see
**[`CLOUD_DEPLOYMENT.md`](CLOUD_DEPLOYMENT.md)** for the step-by-step guide
(Firebase project setup → Cloud Run deploy → Hosting rewrite → secrets →
budget alerts → 60-day image retention).

Summary:

- **Firebase Hosting** serves the React build. `firebase.json` rewrites
  `/api/**` to the Cloud Run service (`mahalxmi-api`, **before** the SPA
  fallback), so the deployed site keeps calling same-origin `/api/...` —
  `VITE_API_BASE_URL` stays empty and there is no CORS at all.
- **Cloud Run** runs this same FastAPI app from `backend/Dockerfile` with
  `BACKEND_MODE=firebase` (auto-detected on Cloud Run), which swaps the data
  layer to **Cloud Firestore** (`submissions` / `admins` / `settings`
  collections) and **Firebase Storage** (private bucket,
  `submissions/{uuid}/review.jpg`).
- **Firestore & Storage rules** (`firestore.rules`, `storage.rules`) deny all
  direct client access; only the backend's Admin SDK reaches them. Admin
  image viewing goes through the authenticated endpoint
  `GET /api/admin/submissions/{id}/files/{kind}` — no public image URLs.
- Secrets (`ADMIN_PASSWORD`, `SESSION_SECRET`) live in **Secret Manager**,
  never in git or the frontend.

Build + deploy in short:

```bash
cd my-react-app && npm run build && cd ..   # frontend bundle
firebase deploy --only hosting,firestore:rules,storage
gcloud run deploy mahalxmi-api --source backend --region us-central1 ...  # see guide
```

> **Legacy alternative (VPS + SQLite):** the old deployment style — build with
> `VITE_API_BASE_URL=https://your-backend-host.com` and run the backend in
> local mode behind nginx — still works, since local mode is unchanged. The
> GitHub Pages workflow (`.github/workflows/deploy.yml`) follows that pattern.
> It is superseded by the Cloud Run architecture for this project.

## Operational notes
- **Always use the Vite dev URL (port 5173) for the UI in local dev.** Port 8000
  serves the *built* `dist/` snapshot, which can be stale.
- **Rate limits:** login 10 attempts / 15 min / IP; submissions 20 / hour / IP
  (per IP seen by the server). A 429 means wait and retry.
- **Storage:** uploaded screenshots + QR images live in `backend/uploads/`
  (local mode) or the Firebase Storage bucket (firebase mode). The admin
  dashboard bar and the Storage page track usage against the quota (default
  1024 MB, editable in Settings) in both modes. Deleting a submission frees
  its files permanently.
- **Abuse protection:** a new claim with the same name + order last-4 as one
  in the previous 7 days is flagged "Possible duplicate" in the admin panel
  (never auto-rejected). Order digits alone are not unique, so every
  submission's real identity is a UUID + generated reference.
- **A fresh database shows an empty dashboard — that is normal, not an error.**
  New customer submissions appear in the admin table automatically.
- If the UI shows values that differ from `curl http://127.0.0.1:8000/api/settings`,
  you are hitting a **different (stale) backend process** holding an older DB —
  kill the extra `uvicorn` and hard-refresh (see `WINDOWS_LOCAL_SETUP.md` §6–§8).
- The admin panel distinguishes "backend unreachable" (auto-retries with a
  visible offline screen) from "not logged in", and keeps you logged in through
  transient data-refresh failures.
- The customer form does the same: if `/api/settings` does not come back as
  JSON (e.g. the Vite proxy's 502 while the backend is down), it shows a
  "Cannot reach the backend" screen with a Retry button — it can never render
  a fake ₹0 / "paused" page from a proxy error again.

## Backend files
- `backend/main.py` — API routes (mode-agnostic; picks the repository below)
- `backend/database.py` — SQLite schema/seeding **and** the shared repository
  interface (local mode)
- `backend/firestore_service.py` — Cloud Firestore implementation of the same
  interface (firebase mode)
- `backend/storage_service.py` — image store: local disk ↔ Firebase Storage
- `backend/firebase_service.py` — mode detection + Firebase Admin init (ADC)
- `backend/security.py` — password hashing helpers
- `backend/requirements.txt` — Python dependencies
- `backend/Dockerfile` / `backend/.dockerignore` — Cloud Run image
- Root: `firebase.json` (Hosting + `/api/**` → Cloud Run rewrite),
  `firestore.rules`, `storage.rules`, `.firebaserc`
- `tests/` — end-to-end smoke suites for both modes (see `tests/README.md`)
