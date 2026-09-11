# Cloud deployment guide — Firebase Hosting + Cloud Run + Firestore + Storage

Target architecture:

```
CUSTOMER (scans QR)
   │
   ▼
Firebase Hosting ── mahalxmi-review-system.web.app
   │   (React build: customer form, success, status, admin UI)
   │
   ├── everything except /api/** → static React files
   └── /api/** ─────────────► Google Cloud Run service "mahalxmi-api"
                                   │  (FastAPI, BACKEND_MODE=firebase)
                                   ├── Cloud Firestore   (submissions / admins / settings)
                                   └── Firebase Storage  (private bucket, submissions/{uuid}/…)
```

The backend runs the exact same FastAPI app as local development. One env var
(`BACKEND_MODE`) switches the data layer:

| Mode | Database | Images | When |
|---|---|---|---|
| `local` (default off-cloud) | SQLite `backend/mahalaxmi.db` | `backend/uploads/` | development |
| `firebase` (auto on Cloud Run) | Cloud Firestore | Firebase Storage (private) | production |

The HTTP API contract is identical in both modes, so the frontend needs no
environment-specific code.

---

## Phase 1 — Backup ✅

Already done: the pre-migration state is commit `848dcaf` on `main` (merge of
PR #8). All migration work lives on the branch
`arena/01a0904c-mahalxmi-review-system` until you merge it.

## Phase 2 — Firebase project setup

Project: **mahalxmi-review-system** (already hosts the site at
https://mahalxmi-review-system.web.app).

1. **Enable Firestore** — Firebase console → Build → Firestore Database →
   *Create database* → choose **Native mode** and a location
   (e.g. `asia-south1` Mumbai for lowest latency from India). ⚠️ The location
   cannot be changed later.
2. **Enable Storage** — Build → Storage → *Get started* → same location,
   start in **production mode** (locked down). The bucket name is usually
   `mahalxmi-review-system.appspot.com`.
3. **Billing** — Cloud Run requires the project to be on the Blaze
   (pay-as-you-go) plan. Link billing, then immediately set budget alerts
   (see Phase 10). You stay inside free/minimum cost at restaurant traffic —
   the alerts are a safety net, not an expectation of bills.
4. Enable the APIs (once): `gcloud services enable run.googleapis.com \
   cloudbuild.googleapis.com firestore.googleapis.com`

## Phase 3 — Backend migration ✅ (this branch)

- `backend/database.py` — SQLite implementation + the shared repository interface
- `backend/firestore_service.py` — Firestore implementation of the same interface
- `backend/storage_service.py` — image store (local disk ↔ Firebase Storage)
- `backend/firebase_service.py` — mode detection + Admin SDK init (ADC)
- Firestore layout: `submissions/{uuid}` (reference from a counter doc),
  `admins/{email}`, `settings/public`, `meta/counters`
- Images: private bucket, `submissions/{uuid}/review.jpg` + `upi-qr.jpg`,
  served to the admin only through the authenticated endpoint
  `GET /api/admin/submissions/{id}/files/{kind}` (no public URLs ever)

## Phase 4 — Security configuration

Deploy the locked-down rules (they deny **all** direct client access — only
the Admin SDK on Cloud Run talks to Firestore/Storage):

```bash
firebase deploy --only firestore:rules,storage
```

Secrets: never in git/frontend. On Cloud Run use **Secret Manager** (or env
vars for non-sensitive ones):

```bash
# one-time: create secrets
echo -n "your-strong-admin-password" | gcloud secrets create mahalxmi-admin-password --data-file=-
echo -n "$(openssl rand -hex 32)"   | gcloud secrets create mahalxmi-session-secret --data-file=-
```

Required production env for the service:

| Variable | Value | How |
|---|---|---|
| `APP_ENV` | `production` | env var |
| `ADMIN_EMAIL` | your admin email | env var |
| `ADMIN_PASSWORD` | — | **Secret Manager** |
| `SESSION_SECRET` | — | **Secret Manager** |
| `BACKEND_MODE` | `firebase` | auto (K_SERVICE) — set anyway for clarity |
| `CORS_ORIGINS` | `https://mahalxmi-review-system.web.app` | env var |

The server refuses to boot without the three secrets — there are no
hard-coded production fallbacks. **Change the admin password from the
Settings page after go-live** (invalidates all old tokens); the seeded one is
for first login only and must not stay.

## Phase 5 — Test locally against real Firebase (optional but recommended)

```bash
gcloud auth application-default login        # or use a service-account JSON
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json   # alternative
cd backend
BACKEND_MODE=firebase APP_ENV=production \
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... SESSION_SECRET=... \
../.venv/bin/python -m uvicorn main:app --port 8000
```

Then run through: customer submit (UPI + QR), track at `/#/status`, admin
login, image view, approve/reject/paid, delete, Storage page.

## Phase 6 — Containerize ✅

`backend/Dockerfile` + `.dockerignore` are in this branch
(python:3.12-slim, non-root user, honors `$PORT`). Test locally if Docker is
available: `docker build -t mahalxmi-api backend && docker run --rm -p 8000:8000 mahalxmi-api`.

## Phase 7 — Deploy to Cloud Run

```bash
gcloud run deploy mahalxmi-api \
  --source backend \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi --cpu 1 --min-instances 0 --max-instances 2 \
  --set-env-vars APP_ENV=production,BACKEND_MODE=firebase,ADMIN_EMAIL=you@example.com,CORS_ORIGINS=https://mahalxmi-review-system.web.app \
  --set-secrets ADMIN_PASSWORD=mahalxmi-admin-password:latest,SESSION_SECRET=mahalxmi-session-secret:latest
```

Notes:
- `--allow-unauthenticated` is required so Firebase Hosting's rewrite can
  reach it; the app itself enforces admin auth on every admin endpoint.
  (If you prefer, add the `run.invoker` role only to the Hosting service
  account and drop the flag — same effect, tighter.)
- Confirm the region matches `firebase.json` → hosting rewrites →
  `run.region` (**us-central1** as committed; adjust BOTH if you change it).
- Smoke test: `curl https://mahalxmi-api-xxxx.a.run.app/api/health` → `{"ok":true}`

The Cloud Run default service account already has Firestore/Storage admin
within the project; if you attach a custom SA, grant it
`datastore.user` + `storage.objectAdmin` (or the Firebase Admin role).

## Phase 8 — Connect Firebase Hosting ✅ config in this branch

`firebase.json` now rewrites `/api/**` → Cloud Run **before** the SPA
fallback (order matters). Deploy:

```bash
cd my-react-app && npm run build && cd ..
firebase deploy --only hosting
```

Verify on https://mahalxmi-review-system.web.app :
- `/api/health` returns `{"ok":true}` (routed to Cloud Run)
- customer form loads settings, submission works
- `/#/admin` login works, images load (authenticated streaming)

## Phase 9 — Production test checklist

Mobile phone → scan QR → submit (UPI) → submit (QR) → track via reference →
admin login → view both screenshots → approve → mark paid → duplicate
submission shows "Possible duplicate" → delete one → Storage page updates →
change admin password → old sessions drop.

## Phase 10 — Cost protection

Cloud console → Billing → Budgets & alerts → create budget for the project:
alerts at **₹100 / ₹250 / ₹500** (or equivalent). Expected monthly cost at
restaurant traffic ≈ ₹0–₹100 (Cloud Run scale-to-zero + free tiers).

## Image retention / cleanup (60 days)

Chosen approach: **Storage lifecycle rule** (simplest, fully managed —
"Option C" from the plan). Apply it once:

```bash
cat > /tmp/lifecycle.json <<'EOF'
{ "rule": { "action": { "type": "Delete" }, "condition": { "age": 60 } } }
EOF
gsutil lifecycle set /tmp/lifecycle.json gs://mahalxmi-review-system.appspot.com
```

Objects older than 60 days are deleted automatically; the Firestore record
remains (name, order digits, status, dates), and the admin panel then shows
"The image is no longer available" instead of the image. Two optional
add-ons later: (a) a scheduled Cloud Run job that also anonymizes old
Firestore docs; (b) the existing admin "Cleanup orphans" button already
removes unreferenced objects on demand.

---

## Rollback

- Frontend: `firebase hosting:rollback` (or redeploy the previous build).
- Backend: `gcloud run services update-traffic mahalxmi-api --to-latest` or
  redeploy the previous revision; alternatively run the old SQLite backend
  anywhere — the API contract hasn't changed.
- Data: Firestore is separate from the container — redeploying never touches
  submissions.

## Cost expectations (free tiers, Blaze plan)

| Service | No-cost allowance | Your expected use |
|---|---|---|
| Hosting | 10 GB storage / 360 MB-day transfer (Spark numbers vary by plan) | tiny |
| Firestore | 1 GiB, 50k reads / 20k writes per day | << limit |
| Storage | ~5 GB-month + 100 GB/month downloads (new default buckets) | ~1 GB/month at 30 claims/day, capped by the 60-day lifecycle rule |
| Cloud Run | 2M requests, 360k GB-s/month free | well inside at restaurant traffic |
