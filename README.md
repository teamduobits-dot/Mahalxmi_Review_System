# Mahalaxmi Cashback Upload System

A simplified cashback collection app for Mahalaxmi Multi Cuisine.

## What it does

### Customer side
Customers only need to:
- upload their review screenshot
- enter their name
- enter the last 4 digits of their Order ID
- provide a UPI ID **or** upload a UPI QR image

### Admin side
Admin can:
- log in with the allowed email only
- view all submissions in a dashboard
- open each submission in detail
- approve, reject, or mark paid
- save admin notes
- update customer-facing settings
- change the admin password

## Stack
- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** FastAPI (Python)
- **Database:** SQLite (local)
- **Uploads:** saved locally in `backend/uploads/`

## Default admin login (local development)
- **Email:** `team.duobits@gmail.com`
- **Password:** `aditya9922`

You can change the password from the admin settings screen.

**Production:** run the backend with `APP_ENV=production` plus `ADMIN_EMAIL`,
`ADMIN_PASSWORD` and `SESSION_SECRET` set as environment variables. In that
mode all hard-coded defaults are disabled and the server refuses to start if
any of them is missing — never deploy with the default password.

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

## Notes for later cloud deployment
The frontend uses relative `/api` and `/uploads` paths in local dev through Vite proxy.
For cloud deployment later, set `VITE_API_BASE_URL` to your backend URL — image
URLs (`/uploads/...`) are automatically prefixed with it by the frontend, so a
separately-hosted backend works out of the box.

The GitHub Pages deploy (`.github/workflows/deploy.yml`) bakes in
`VITE_API_BASE_URL` from a **repository variable** of the same name
(Settings → Secrets and variables → Actions). Until you set it, the deployed
site can only talk to a backend on its own origin — that is why a deployed
page with no backend URL shows login errors while the local app works.

Start the backend with `APP_ENV=production`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` and
`SESSION_SECRET` set (see above). SQLite + local disk uploads are meant for a
single always-on host (VPS/container), not ephemeral/serverless platforms.

## Operational notes
- **Always use the Vite dev URL (port 5173) for the UI in local dev.** Port 8000
  serves the *built* `dist/` snapshot, which can be stale.
- **A fresh database shows an empty dashboard — that is normal, not an error.**
  New customer submissions appear in the admin table automatically.
- If the UI shows values that differ from `curl http://127.0.0.1:8000/api/settings`,
  you are hitting a **different (stale) backend process** holding an older DB —
  kill the extra `uvicorn` and hard-refresh (see `WINDOWS_LOCAL_SETUP.md` §6–§8).
- The admin panel distinguishes "backend unreachable" (auto-retries with a
  visible offline screen) from "not logged in", and keeps you logged in through
  transient data-refresh failures.

## Backend files
- `backend/main.py` — API routes
- `backend/database.py` — SQLite schema + seeding
- `backend/security.py` — password hashing helpers
- `backend/requirements.txt` — Python dependencies
