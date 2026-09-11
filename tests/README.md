# Verification suites

Two end-to-end smoke suites cover the two backend modes. Run them from the
**repository root** with the project virtualenv.

## Cloudinary migration — safe isolated tests

```bash
.venv/bin/pip install -r tests/requirements.txt
.venv/bin/python -m unittest discover -s tests -p test_cloudinary.py -v
```

Uses temporary SQLite/uploads and mocks the Cloudinary SDK. Does not create or
remove real Cloudinary assets and does not touch the application's database.
This does **not** replace a real credential/upload/browser check. See
`CLOUDINARY_MIGRATION.md` for the manual check.

**Do not run the legacy suites below against existing data during migration.**
The local suite expects a disposable empty database and performs deletions.

## Local (SQLite) mode — `smoke_local.py`

Exercises the running backend over HTTP (start it first). Covers: settings,
generic login errors, token issue/revoke, submission create (UPI + QR),
validation-before-write (no orphan files), 5 MB cap, magic-byte type checks,
privacy-safe public status, duplicate flagging, search/filter, PATCH status +
notes, authenticated image streaming, storage stats + orphan cleanup, delete
that frees files, and password-change revocation.

```bash
# 1. fresh backend (local mode is the default)
rm -f backend/mahalaxmi.db && rm -rf backend/uploads
IMAGE_STORAGE=local .venv/bin/python -m uvicorn --app-dir backend main:app --port 8000 &

# 2. run the suite
.venv/bin/python tests/smoke_local.py
```

## Firebase mode — `smoke_firebase.py`

Boots the real FastAPI app with `BACKEND_MODE=firebase` against in-memory
fakes (`fake_firebase.py`) for Firestore + Storage — no GCP credentials or
emulator needed. Validates the Firestore repository: reference counter,
duplicate flag, document/object creation under `submissions/{uuid}/`, CRUD,
private image streaming from the bucket, storage stats + orphan cleanup, and
token revocation.

```bash
.venv/bin/python tests/smoke_firebase.py
```

Both exit non-zero on any failure so they can gate a commit/PR.
