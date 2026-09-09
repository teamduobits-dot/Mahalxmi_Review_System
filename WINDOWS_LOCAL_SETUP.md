# Windows (PowerShell) — Local Run & Troubleshooting Guide

This guide covers: exact run steps, verifying backend login by hand, resetting the
admin password in SQLite, clearing stale browser state, and diagnosing why the UI
shows different settings than the API.

> **Commands below assume:**
> - Repo root = `C:\Mahalxmi_Review_System` (adjust every `cd` to your real path)
> - Virtual env created at the repo root: `.venv\` (as `.gitignore` expects)
> - Windows PowerShell — in PS, plain `curl` is an alias for `Invoke-WebRequest`.
>   All curl examples below therefore use **`curl.exe`** on purpose.

---

## 1) Exact local run steps (Windows)

### 1.1 Create venv + install backend deps (first time only)

```powershell
cd C:\Mahalxmi_Review_System
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

### 1.2 Start the backend (terminal #1)

Simplest (run **from inside `backend\`** so `main`, `database` and `security`
import cleanly):

```powershell
cd C:\Mahalxmi_Review_System\backend
..\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Equivalent from the repo root (this is the `--app-dir` form that fixes your
`Could not import module "main"` error — the error happened because without
`--app-dir backend`, Python can't find `main.py` which lives in `backend\`):

```powershell
cd C:\Mahalxmi_Review_System
.\.venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --reload --host 0.0.0.0 --port 8000
```

Success looks like: `Uvicorn running on http://0.0.0.0:8000` and, on first start,
`backend\mahalaxmi.db` is created and seeded automatically (admin user + settings).

**Important — passwords come from env vars only at first seed.** The DB row keeps
whatever password was current when the DB was *created*. If a previous shell had
`$env:ADMIN_PASSWORD` set when the DB was first seeded, the documented password will
no longer match that DB. (Reset in §4.)

### 1.3 Start the frontend (terminal #2)

```powershell
cd C:\Mahalxmi_Review_System\my-react-app
npm install
npm run dev
```

Open:
- Customer form → `http://localhost:5173/`
- Admin login → `http://localhost:5173/#/admin`

> **Only use the Vite dev server URL (5173) for the UI in local dev.** If you open
> `http://127.0.0.1:8000/` instead, you see the *previously built* `dist/` snapshot,
> which may be stale.

### 1.4 "Port already in use" cleanup

```powershell
netstat -ano | findstr :8000
netstat -ano | findstr :5173
# Kill any stale PID from the second column:
taskkill /PID 12345 /F
```

---

## 2) Verify the backend manually (PowerShell)

### 2.1 Health + public settings

```powershell
curl.exe -s http://127.0.0.1:8000/api/health
curl.exe -s http://127.0.0.1:8000/api/settings
```

Expected settings JSON:

```json
{"businessName":"Mahalaxmi Multi Cuisine","cashbackAmount":15,"campaignActive":true, ...}
```

### 2.2 Login (form-data, exactly what the frontend sends)

```powershell
curl.exe -s -X POST http://127.0.0.1:8000/api/auth/login `
  -H "Content-Type: application/x-www-form-urlencoded" `
  --data "email=team.duobits@gmail.com&password=aditya9922"
```

Expected success:
`{"ok":true,"admin":{"id":1,"email":"team.duobits@gmail.com"},"token":"..."}`

Wrong password returns HTTP 401 `{"detail":"Invalid email or password."}`.

PowerShell 7 alternative (`-Form` needs PS 7+; works on PS 5.1 too if written as
`-Body` with the urlencoded content type):

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/auth/login -Form @{ email = 'team.duobits@gmail.com'; password = 'aditya9922' }
```

### 2.3 Verify session & admin endpoints

```powershell
# Capture the cookie + token
curl.exe -s -c $env:TEMP\mmc_cookies.txt -X POST http://127.0.0.1:8000/api/auth/login `
  -H "Content-Type: application/x-www-form-urlencoded" `
  --data "email=team.duobits@gmail.com&password=aditya9922"

# Who am I? (session cookie)
curl.exe -s -b $env:TEMP\mmc_cookies.txt http://127.0.0.1:8000/api/auth/me

# List submissions (admin only — expect JSON array, not 401)
curl.exe -s -b $env:TEMP\mmc_cookies.txt http://127.0.0.1:8000/api/admin/submissions

# Also works with the bearer token instead of the cookie:
curl.exe -s -H "Authorization: Bearer <paste-token-here>" http://127.0.0.1:8000/api/admin/submissions
```

Without a session/token you must get **401** from all `/api/admin/*` endpoints.

---

## 3) Inspect what is actually inside the SQLite DB

The DB lives at `backend\mahalaxmi.db` (path is anchored to the file location, so it
is the same DB regardless of which folder you start uvicorn from).

```powershell
cd C:\Mahalxmi_Review_System\backend
..\.venv\Scripts\python.exe -c "import sqlite3; c=sqlite3.connect('mahalaxmi.db'); print('ADMIN:'); [print(r) for r in c.execute('select id,email,password_hash from admin_users')]; print('SETTINGS:'); [print(r) for r in c.execute('select business_name,cashback_amount,campaign_active,pause_message from app_settings')]; print('SUBMISSIONS:', c.execute('select count(*) from submissions').fetchone()[0])"
```

What to look for:

| Column | Healthy value | If you see | Meaning |
|---|---|---|---|
| `email` | `team.duobits@gmail.com` | anything else | DB seeded with a different `ADMIN_EMAIL` |
| `campaign_active` | `1` | `0` | Campaign was toggled off from admin Settings → API returns `campaignActive:false` → UI shows **"Cashback is paused"** |
| `cashback_amount` | `15` | `0` | Settings were saved with amount 0 → API returns `cashbackAmount:0` → UI shows **₹0** |
| `password_hash` | starts `pbkdf2_sha256$` | — | if it does **not** verify against `aditya9922`, login fails (see §4) |

---

## 4) Reset the admin password to `aditya9922`

### Option A — targeted reset (keeps all submissions, recommended)

```powershell
cd C:\Mahalxmi_Review_System\backend
..\.venv\Scripts\python.exe -c "import sqlite3; from security import hash_password; c=sqlite3.connect('mahalaxmi.db'); c.execute('UPDATE admin_users SET password_hash=? WHERE email=?', (hash_password('aditya9922'), 'team.duobits@gmail.com')); c.commit(); print('Admin password reset to aditya9922')"
```

### Option B — full reseed (wipes submissions + uploads; resets settings to defaults)

Only do this if you want a completely clean slate:

```powershell
# 1. Stop the backend (Ctrl+C in its terminal).

# 2. Make sure NO stale password env vars exist in this shell (they override defaults at seed time):
Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:ADMIN_EMAIL -ErrorAction SilentlyContinue

# 3. Delete the DB + uploaded files:
cd C:\Mahalxmi_Review_System\backend
Remove-Item mahalaxmi.db -ErrorAction SilentlyContinue
Remove-Item uploads\* -ErrorAction SilentlyContinue

# 4. Restart the backend — init_db() recreates everything with defaults:
cd C:\Mahalxmi_Review_System\backend
..\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Option C — force settings back to healthy values (no data loss)

```powershell
cd C:\Mahalxmi_Review_System\backend
..\.venv\Scripts\python.exe -c "import sqlite3; c=sqlite3.connect('mahalaxmi.db'); c.execute('UPDATE app_settings SET business_name=?, cashback_amount=?, campaign_active=?, pause_message=? WHERE id=1', ('Mahalaxmi Multi Cuisine', 15, 1, 'Cashback submissions are paused right now. Please try again shortly.')); c.commit(); print('Settings reset to defaults')"
```

Then re-run the §3 inspect command to confirm, and **hard-refresh the browser**
(Ctrl+Shift+R).

---

## 5) Clear stale browser / localStorage / token issues

The frontend stores the admin token under key **`mm_admin_token`** in
`localStorage` (see `my-react-app\src\lib\api.js`); the backend also sets a
`session` cookie.

1. On the app tab, open DevTools (**F12**) → **Application** → **Local Storage** →
   `http://localhost:5173` → delete `mm_admin_token` (or right-click → Clear).
2. **Application → Cookies → `http://localhost:5173`** → delete the `session` cookie
   (delete `http://127.0.0.1:8000` cookies too if you used that host).
3. Hard refresh: **Ctrl+Shift+R**. While DevTools is open you can tick
   **Network → Disable cache** to rule out HTTP caching.
4. Or paste this into the page console and reload:

   ```js
   localStorage.removeItem('mm_admin_token'); localStorage.clear(); location.reload()
   ```

5. Vite's own transform cache can go stale after dependency/.env changes — restart
   with a forced cache clear:

   ```powershell
   cd C:\Mahalxmi_Review_System\my-react-app
   npm run dev -- --force
   ```

6. Close old tabs pointed at other ports/hosts (e.g., an old `:8000` tab or the
   GitHub Pages URL) — they show an old app state.

---

## 6) Make sure the frontend talks to YOUR local backend

1. Check `my-react-app\.env`. For local dev it should look like this (values empty
   **or** pointing exactly at your backend):

   ```env
   VITE_API_BASE_URL=
   VITE_GOOGLE_CLIENT_ID=
   ```

   - **Empty** → the browser calls `/api` on `localhost:5173`, and Vite proxies it to
     `http://127.0.0.1:8000` (see `my-react-app\vite.config.js`).
   - If you set it, use exactly `VITE_API_BASE_URL=http://127.0.0.1:8000` (the
     backend's CORS allows `localhost:5173` / `127.0.0.1:5173` page origins).
2. **Any `.env` change requires restarting `npm run dev`** — Vite only reads env at
   startup.
3. Verify the proxy is healthy — these two must return **identical JSON**:

   ```powershell
   curl.exe -s http://127.0.0.1:8000/api/settings    # direct
   curl.exe -s http://localhost:5173/api/settings    # through the Vite proxy
   ```

4. Confirm only one backend is listening, and check where each Python process came
   from (catches the classic "two copies of the repo / two DBs" trap):

   ```powershell
   netstat -ano | findstr :8000
   Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Select-Object ProcessId, CommandLine | Format-List
   ```

   You should see exactly **one** uvicorn process, started from the repo you are
   editing. Kill the rest (`taskkill /PID <pid> /F`).

---

## 7) "UI shows ₹0 / Cashback is paused but API returns 15 / true" — diagnosis order

The frontend does **not** transform these values: it renders exactly what
`GET /api/settings` returns (`CustomerForm.jsx` → `api.getSettings()`). So a
mismatch means the UI fetched settings from a *different source* than the one you
checked. Check in this order:

1. **Which URL is the browser on?** Must be `http://localhost:5173/` (Vite dev).
   If it is `http://127.0.0.1:8000/` or the GitHub Pages site, you are viewing the
   stale built frontend or a site with no backend. Refresh after switching.
2. **Open DevTools → Network**, reload the page, click the `api/settings` request
   and read its actual **Response**. Compare against the §6.3 direct API call.
   - If they differ → you are hitting a different backend instance.
3. **Is an old backend still running on :8000?** (§6.4) An old process may hold an
   old DB where the campaign was paused / amount was 0.
4. **Inspect the DB** (§3): if `campaign_active=0` or `cashback_amount=0` in the DB
   the running server uses, the API *will* return those — the JSON you quoted may
   have come from a different server/DB than the one on :8000 right now.
   Fix with §4 Option C, then refresh.
5. **Stale tab / stale bundle:** hard-refresh (Ctrl+Shift+R), restart Vite with
   `-- --force` (§5).
6. If everything above matches and it still misbehaves, paste the exact
   `api/settings` response from DevTools and the §3 DB dump — that isolates DB vs
   server vs browser in one shot.

---

## 8) "Admin login fails" — diagnosis order

The login is a plain form POST (`email`, `password`) that verifies against the
`admin_users` row for `team.duobits@gmail.com` in the DB the server uses.

1. **Test the login by hand first** (§2.2). If curl returns 401
   `Invalid email or password`, the frontend is not the problem — the DB hash is.
2. **Did you ever use Settings → Change password?** The DB then stores the new hash
   and the documented default no longer applies to that DB. Reset with §4 Option A.
3. **Was the DB seeded while `ADMIN_PASSWORD` / `ADMIN_EMAIL` env vars were set?**
   Check:
   ```powershell
   Write-Output "Session: $env:ADMIN_PASSWORD / $env:ADMIN_EMAIL"
   [Environment]::GetEnvironmentVariable('ADMIN_PASSWORD','User')
   [Environment]::GetEnvironmentVariable('ADMIN_PASSWORD','Machine')
   ```
   If any is set, either unset it and reseed (§4 Option B) or reset the hash to the
   password you actually want (§4 Option A).
4. **Stale `mm_admin_token` in localStorage:** it can put the admin panel into a
   confusing logged-out state after server restarts. Clear it (§5). If a token's
   signature no longer validates (server secret changed), `apiFetch` gets 401 and
   auto-clears it — a hard refresh then shows the login normally.
5. **Cookies from a different host/port:** the login sets a `session` cookie. If you
   previously hit `127.0.0.1:8000` directly and now use the `localhost:5173` proxy,
   delete cookies for both hosts (§5).
6. If hand-testing succeeds (step 1) but the browser still fails, watch the
   **Network** tab on the login click: check the `api/auth/login` request URL
   (must be `http://localhost:5173/api/auth/login`) and its status/response. A 401
   there with a successful curl = stale token/bundle (fix §5); a failed/other URL =
   wrong `.env`/proxy (fix §6).

---

## 9) Reference — files that matter for these issues

| File | Role |
|---|---|
| `backend\database.py` | DB path, schema, seeding (`ADMIN_EMAIL`/`ADMIN_PASSWORD` env defaults) |
| `backend\security.py` | `hash_password()` / `verify_password()` used by the reset commands |
| `backend\main.py` | `/api/auth/login`, `/api/settings`, uploads, static `dist/` hosting |
| `my-react-app\vite.config.js` | Dev proxy `/api` + `/uploads` → `127.0.0.1:8000` |
| `my-react-app\.env` | `VITE_API_BASE_URL`, `VITE_GOOGLE_CLIENT_ID` (read only at Vite startup) |
| `my-react-app\src\lib\api.js` | `mm_admin_token` localStorage key; Bearer header |
| `my-react-app\src\pages\CustomerForm.jsx` | renders settings; pause banner + cashback amount |
| `my-react-app\src\pages\admin\Login.jsx` | pre-fills the documented default credentials |
