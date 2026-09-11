# Cloudinary migration — new uploads only

## Current behavior

- `BACKEND_MODE=local` keeps application data in `backend/mahalaxmi.db`.
- `IMAGE_STORAGE=cloudinary` is the default for new screenshot and UPI QR writes.
- `backend/.env` is loaded before config imports; real environment values take precedence.
- Existing columns `review_screenshot_path` / `upi_qr_path` store the returned secure URL.
- No schema migration, backfill, existing-record rewrite, automatic cleanup, or asset deletion is part of this change.
- Old `/uploads/...` URLs remain served locally. Do not remove that directory or database.
- Cloudinary URLs are delivered directly by the frontend's existing `assetUrl()` helper.
- PNG/JPEG/WebP signature checks and the actual existing **5 MB** limit are retained.
- Cloudinary upload errors fail the request; they never silently save locally.
- Missing credentials produce a startup warning and a 503 on new uploads. The warning is intentional until real credentials are supplied.
- Cloudinary deletion is a no-op, including when submission creation fails after an upload. Admin deletion removes the record but **retains the Cloudinary asset**. A successful first image followed by a failed second upload may leave a remote asset: manual reconciliation is deferred, not automatic deletion.
- Storage stats/cleanup cover legacy storage only, **not Cloudinary quota or assets**. Do not run cleanup as part of this migration.

The optional existing Firestore repository is retained; this change does not move SQLite data to Firestore. `IMAGE_STORAGE=local` explicitly restores offline disk writes; `IMAGE_STORAGE=firebase` retains the old Firebase Storage path with `BACKEND_MODE=firebase`.

## Local setup (Windows PowerShell)

From the project root:

```powershell
& .\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
# Only if .env does not already exist:
if (!(Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
```

Edit `backend/.env` privately:

```dotenv
APP_ENV=development
BACKEND_MODE=local
IMAGE_STORAGE=cloudinary
CLOUDINARY_CLOUD_NAME=n7m4rzvw
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Fill the last two values using your Cloudinary Console. Do not paste secrets in chat,
commit this file, or put credentials in `VITE_*` variables. The local ignored `.env`
is not part of the Git patch and must be configured separately on your machine.

Safe presence check (does not print the API key or secret):

```powershell
python -c "from dotenv import load_dotenv; import os; load_dotenv('backend/.env'); print(os.getenv('CLOUDINARY_CLOUD_NAME')); print(*(bool(os.getenv(k, '').strip()) for k in ('CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET')))"
python -m uvicorn --app-dir backend main:app --host 0.0.0.0 --port 8000
```

In another terminal, run `npm run dev` from `my-react-app`. Alternatively build with
`npm run build` and open the backend URL to use its built frontend.

## Real acceptance test — pending credentials

1. Do not reset the database, modify old rows, or run cleanup.
2. Submit one **new** test claim through the frontend using a non-sensitive test screenshot.
3. Expect HTTP 200 and a new reference. If testing QR payout, also provide a non-sensitive QR image.
4. In Cloudinary Media Library, check folder `mahalaxmi-review-system` for `review-<uuid>` / `upiqr-<uuid>` assets.
5. Read the new record without modifying any rows:

```powershell
python -c "import sqlite3; c=sqlite3.connect('file:backend/mahalaxmi.db?mode=ro', uri=True); print(c.execute('SELECT reference, review_screenshot_path, upi_qr_path FROM submissions ORDER BY id DESC LIMIT 1').fetchone()); c.close()"
```

6. Sign in to admin and verify the new URL renders in thumbnail/detail/lightbox and an old local screenshot still renders.
7. Leave the new claim and asset intact unless separately authorized to remove them.
8. Only after real testing succeeds, remove accidental `backend/node_modules`, `backend/package.json`, and `backend/package-lock.json` **if present**. Do not remove the frontend's Node files or root lockfile.

## Security and production

Server-side upload authentication protects the API secret, **not image delivery**.
These standard Cloudinary secure URLs use HTTPS but are accessible to anyone who
possesses them, including UPI QR images. Private/authenticated delivery is a separate
future change. No public IDs are inferred from URLs, and no SDK destroy operation
is implemented.

Cloud Run environment: `APP_ENV=production`, `BACKEND_MODE=firebase`,
`IMAGE_STORAGE=cloudinary`, `ADMIN_EMAIL`, `CLOUDINARY_CLOUD_NAME`, and the intended
`CORS_ORIGINS`. Supply `ADMIN_PASSWORD`, `SESSION_SECRET`, `CLOUDINARY_API_KEY`, and
`CLOUDINARY_API_SECRET` through Secret Manager. Do not deploy SQLite/local uploads
as durable Cloud Run storage; Cloud Run files are ephemeral. Moving existing SQLite
records/local files to durable cloud storage requires a separately approved migration.
Cloud Run requires billing enabled. No cloud deployment was performed by this change.

## Verification in this checkout

Automated tests mock the SDK and use disposable data only. They verify URL storage,
legacy file delivery, size/type validation, missing configuration, SDK failures,
remote-delete no-op, and database-failure safety. They are not evidence of a real
Cloudinary upload or a successful browser/Cloudinary account acceptance test.
