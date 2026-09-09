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

## Optional Google login for admin
A Google sign-in button is added in the admin login page.
To make it work, set a Google OAuth Client ID in the frontend env:

```env
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

The backend accepts only the allowed admin email after Google verification.

## Local development

### 1) Start backend
```bash
cd backend
../.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2) Start frontend
```bash
cd my-react-app
npm install
npm run dev
```

### 3) Open app
- Customer form: `http://localhost:5173/`
- Admin: `http://localhost:5173/#/admin`

## Notes for later cloud deployment
The frontend uses relative `/api` and `/uploads` paths in local dev through Vite proxy.
For cloud deployment later, set `VITE_API_BASE_URL` to your backend URL — image
URLs (`/uploads/...`) are automatically prefixed with it by the frontend, so a
separately-hosted backend works out of the box.

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
