# Render deployment — Firebase Hosting + Render + Firestore + Cloudinary

Target architecture (implemented and ready to deploy):

```
Firebase Hosting (React)
        │  VITE_API_BASE_URL=https://<your-service>.onrender.com
        ▼
Render (FastAPI, BACKEND_MODE=firebase, IMAGE_STORAGE=cloudinary)
     │              │
     ▼              ▼
Firestore      Cloudinary
(user data)    (screenshots)
```

Render free-tier services sleep after ~15 min idle and need 30–60 s to wake.
The frontend handles this silently: it pre-warms the backend on page load,
and at submit time it polls ONLY the lightweight health endpoint until the
backend answers, then POSTs the real submission exactly once. Users only ever
see friendly loading messages — never "server sleeping" style errors.

---

## 1. What changed for this deployment

| File | Change |
|---|---|
| `backend/main.py` | Added `GET /health` alias (`{"status":"ok","ok":true}`). Same cost as existing `GET /api/health` (no DB/auth/storage); Render's `healthCheckPath` points here. |
| `backend/firebase_service.py` | Additive: `FIREBASE_CREDENTIALS_JSON` env var (raw service-account JSON) so Render — which has no Application Default Credentials — can reach Firestore. Unset = old ADC behavior, unchanged. |
| `my-react-app/src/lib/api.js` | Added abortable/timeout `checkBackendHealth()` probe (no auth, no retry); `createSubmission` now sends with `retry:false` so a lost response can never duplicate the record. |
| `my-react-app/src/lib/backend.js` | NEW: `waitForBackendReady()` — polls health only (3 s interval, 90 s budget, abortable). |
| `my-react-app/src/components/SubmitOverlay.jsx` | NEW: full-screen staged loading overlay (Submitting → Almost there → Saving → Still working). Non-technical copy only. |
| `my-react-app/src/pages/CustomerForm.jsx` | Silent pre-warm on load; submit = lock form → wait for readiness (health only) → POST once; settings load auto-retries on network failure; production error copy is friendly; form data preserved on every failure. |
| `render.yaml` | NEW: Render Blueprint (service, `/health` check, env var list). |
| `backend/.env.example`, `my-react-app/.env.example` | Documented `FIREBASE_CREDENTIALS_JSON`, production `CORS_ORIGINS`, production `VITE_API_BASE_URL`. |

Deliberately NOT changed: `database.py`, `firestore_service.py`,
`storage_service.py`, `security.py`, admin UI, `Success`/`Status` pages,
`firestore.rules`, `storage.rules`, `Dockerfile`, workflows.

---

## 2. Audit findings (verified in code, not guessed)

- **Health endpoint:** `GET /api/health` already existed (`{"ok":true}`, no
  side effects) — reused for frontend polling; `/health` is a thin alias for
  Render platform checks. No duplicates.
- **Submissions (production):** `BACKEND_MODE=firebase` → `firestore_service`
  (`submissions/{uuid}`, reference from transactional `meta/counters`).
  `IMAGE_STORAGE=cloudinary` → screenshot/QR uploaded to Cloudinary, the
  returned `secure_url` stored in Firestore. Verified in
  `main.py:create_submission` + `storage_service.save_image`.
- **Admin read:** Firestore docs → Cloudinary URLs served directly
  (`is_cloudinary_url` passthrough; `/files/{kind}` redirects). Works.
- **Admin delete:** deletes the Firestore record; **the Cloudinary asset is
  intentionally retained** (`delete_file` is a no-op for remote URLs, by
  design per `CLOUDINARY_MIGRATION.md`). This is the current business
  behavior — preserved, not changed. Decide separately if you want real
  Cloudinary destroy later.
- **Duplicates:** same name + order-last-4 within 7 days sets an advisory
  `duplicate_of` flag (admin badge, never auto-reject). No hard uniqueness —
  preserved. Double-submit is now prevented by the submit lock + overlay +
  single POST with no retry.
- **CORS:** production allows ONLY `CORS_ORIGINS` (comma-separated) with
  credentials — correct for Firebase Hosting → Render. No code change needed;
  just set the value (see §4).
- **API URL config:** single variable `VITE_API_BASE_URL` (empty = local Vite
  proxy; Render URL = production). No `localhost:8000` hard-coding in `src/`
  (only the dev-only `VITE_BACKEND_URL` proxy default in `vite.config.js`).
- **Idempotency:** NOT added (would need a schema/unique-key change). The
  single-POST + no-retry + submit-lock design achieves the goal at current
  scale; revisit only if duplicate incidents occur.

---

## 3. Local development env

`backend/.env` (never commit):

```dotenv
APP_ENV=development
BACKEND_MODE=local
IMAGE_STORAGE=local            # offline; or cloudinary with creds below
CLOUDINARY_CLOUD_NAME=n7m4rzvw
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

`my-react-app/.env`: leave `VITE_API_BASE_URL` empty (Vite proxies to
`http://127.0.0.1:8000`).

---

## 4. Render production env vars (set in dashboard, never in git)

| Variable | Value |
|---|---|
| `APP_ENV` | `production` |
| `BACKEND_MODE` | `firebase` |
| `IMAGE_STORAGE` | `cloudinary` |
| `FIREBASE_PROJECT_ID` | `mahalxmi-review-system` |
| `CORS_ORIGINS` | `https://mahalxmi-review-system.web.app,https://mahalxmi-review-system.firebaseapp.com` |
| `ADMIN_EMAIL` | your admin email (secret) |
| `ADMIN_PASSWORD` | strong password (secret — rotate from default) |
| `SESSION_SECRET` | long random string (secret — Render can generate) |
| `CLOUDINARY_CLOUD_NAME` | from Cloudinary console |
| `CLOUDINARY_API_KEY` | secret |
| `CLOUDINARY_API_SECRET` | secret |
| `FIREBASE_CREDENTIALS_JSON` | full service-account JSON, pasted as one env value (secret) |

Service-account JSON: Firebase console → Project settings → Service
accounts → Generate new private key (needs Firestore access). The file itself
must NEVER be committed — paste its contents into the env var only.

Optional: `ADMIN_TOKEN_TTL_HOURS` (default 24), `GOOGLE_CLIENT_ID` (only with
matching frontend `VITE_GOOGLE_CLIENT_ID`).

---

## 5. Deployment checklist

1. [ ] Push branch to GitHub, merge to `main`.
2. [ ] Render → New → Blueprint → pick repo (uses `render.yaml`) — or New →
    Web Service → Docker → `backend/Dockerfile`, health check path `/health`.
3. [ ] Fill all secret env vars from §4 in the Render dashboard.
4. [ ] Deploy; wait for `GET https://<service>.onrender.com/health` → 200.
5. [ ] Smoke-test backend directly (see §6).
6. [ ] Build frontend with production API URL:
    `VITE_API_BASE_URL=https://<service>.onrender.com npm run build`
    (from `my-react-app/`), then `firebase deploy --only hosting`.
7. [ ] Cold-start test: let Render idle 15+ min, open site, submit
    immediately → friendly overlay → success, exactly ONE Firestore doc +
    ONE Cloudinary asset.
8. [ ] Admin test: log in at `/#/admin`, view submission + images, test
    approve/paid/notes; note delete retains the Cloudinary asset.

Note: `firebase.json` still contains the Cloud Run `/api/**` rewrite from the
older architecture. With Render, the frontend calls the Render URL directly
via `VITE_API_BASE_URL`, so the rewrite is unused but harmless — leave it
unless you remove Cloud Run entirely.

---

## 6. Backend smoke test (production service)

```bash
BASE=https://<service>.onrender.com
curl -s $BASE/health                          # {"status":"ok","ok":true}
curl -s $BASE/api/health                      # {"ok":true}
curl -s $BASE/api/settings                    # public settings JSON (no admin email)
```

Then submit one real test claim via the site and verify in Firestore
(`submissions` collection) + Cloudinary Media Library
(`mahalxmi-review-system/` folder), and in the admin panel.

---

## 7. Remaining risks / manual steps

- **First wake after deploy** takes 30–60 s; the UI covers this, but Render
  free-tier boots can occasionally exceed 90 s — the user then sees a
  friendly retry message with data preserved. Upgrading Render plan removes
  sleeping entirely.
- **Cloudinary URLs are capability URLs** (anyone with the link can view,
  incl. UPI QRs). Authenticated/private delivery is a separate future change.
- **Delete retains Cloudinary assets** (see §2). Orphan remote assets need
  manual Cloudinary-console cleanup if this matters.
- **No backend request log persistence** on free tier; use Render logs +
  Firestore data for debugging.
- **Rotate the default admin password** (`aditya9922` is in git history) via
  `ADMIN_PASSWORD` + the Settings screen after first login.
