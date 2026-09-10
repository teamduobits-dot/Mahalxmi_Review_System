from __future__ import annotations

import json
import logging
import os
import threading
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from itsdangerous import BadSignature, URLSafeSerializer
from starlette.middleware.sessions import SessionMiddleware

from database import DEFAULT_ADMIN_EMAIL, UPLOADS_DIR, get_connection, init_db, row_to_dict, utc_now
from security import hash_password, verify_password

logger = logging.getLogger("mahalaxmi")
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s: %(name)s: %(message)s"))
    logger.addHandler(_handler)
logger.setLevel(logging.INFO)

ALLOWED_STATUSES = {"pending", "approved", "paid", "rejected"}

# ---------------------------------------------------------------------------
# Environment & production gating
# ---------------------------------------------------------------------------
_APP_ENV = os.getenv("APP_ENV", "").strip().lower()
IS_PRODUCTION = _APP_ENV == "production"
# The signing secret must come from the environment in production — with the
# hard-coded fallback, anyone could mint a valid admin token.
if IS_PRODUCTION and not os.getenv("SESSION_SECRET", "").strip():
    raise RuntimeError(
        "SESSION_SECRET must be set as an environment variable when APP_ENV=production. "
        "The default local secret is disabled in production."
    )
SESSION_SECRET = os.getenv("SESSION_SECRET", "").strip() or "mahalaxmi-local-secret"

# Admin bearer tokens expire after ADMIN_TOKEN_TTL_HOURS (default 24 h).
# Changing the password additionally invalidates all outstanding tokens
# immediately via the per-admin `token_version` (see change_password).
try:
    ADMIN_TOKEN_TTL_SECONDS = max(3600, int(os.getenv("ADMIN_TOKEN_TTL_HOURS", "24")) * 3600)
except ValueError:
    ADMIN_TOKEN_TTL_SECONDS = 24 * 3600

GOOGLE_CLIENT_ID = (os.getenv("GOOGLE_CLIENT_ID") or os.getenv("VITE_GOOGLE_CLIENT_ID") or "").strip()
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
FRONTEND_DIST_DIR = PROJECT_DIR / "my-react-app" / "dist"
FRONTEND_INDEX = FRONTEND_DIST_DIR / "index.html"
token_serializer = URLSafeSerializer(SESSION_SECRET, salt="admin-token")

# CORS: dev allows the local Vite origins + preview hosts; production allows
# ONLY the origins listed in CORS_ORIGINS (comma-separated, e.g. your Firebase
# Hosting domain). An empty list = same-origin only.
_cors_env = os.getenv("CORS_ORIGINS", "")
if IS_PRODUCTION:
    _CORS_ORIGINS = [origin.strip() for origin in _cors_env.split(",") if origin.strip()]
    _CORS_REGEX = None
else:
    _CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
    _CORS_REGEX = r"https://.*\.e2b\.app"

app = FastAPI(title="Mahalaxmi Review Cashback API")
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    same_site="lax",
    https_only=IS_PRODUCTION,
    max_age=86400,
)
_cors_kwargs = {
    "allow_origins": _CORS_ORIGINS,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if _CORS_REGEX:
    _cors_kwargs["allow_origin_regex"] = _CORS_REGEX
app.add_middleware(CORSMiddleware, **_cors_kwargs)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# ---------------------------------------------------------------------------
# Rate limiting (in-memory sliding window — designed for a single-process host)
# ---------------------------------------------------------------------------
LOGIN_RATE_LIMIT = 10
LOGIN_RATE_WINDOW_SECONDS = 15 * 60
SUBMIT_RATE_LIMIT = 20
SUBMIT_RATE_WINDOW_SECONDS = 60 * 60


class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_seconds: int) -> None:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > window_seconds:
                hits.popleft()
            if len(hits) >= limit:
                raise HTTPException(
                    status_code=429,
                    detail="Too many attempts. Please wait a few minutes and try again.",
                )
            hits.append(now)
            if len(self._hits) > 10_000:  # prune idle keys so memory stays bounded
                for stale_key in [key for key, value in self._hits.items() if not value]:
                    del self._hits[stale_key]


login_limiter = SlidingWindowRateLimiter()
submit_limiter = SlidingWindowRateLimiter()


def client_ip(request: Request) -> str:
    # Behind a reverse proxy (nginx, Firebase, Render, …) the real client is in
    # X-Forwarded-For; fall back to the socket address for direct connections.
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return forwarded or (request.client.host if request.client else "unknown")


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    if IS_PRODUCTION:
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


# ---------------------------------------------------------------------------
# Settings payloads
# ---------------------------------------------------------------------------
def _settings_row() -> dict:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM app_settings WHERE id = 1").fetchone()
    return row_to_dict(row) or {}


def _public_settings_from(data: dict) -> dict:
    # Note: the admin email is deliberately NOT included — the login screen
    # must never reveal which account is allowed to sign in.
    return {
        "businessName": data.get("business_name", "Mahalaxmi Multi Cuisine"),
        "cashbackAmount": data.get("cashback_amount", 15),
        "campaignActive": bool(data.get("campaign_active", 1)),
        "pauseMessage": data.get("pause_message", "Cashback submissions are paused right now."),
        "successNote": data.get("success_note", "Cashback will be checked and processed after review."),
        "googleAuthEnabled": bool(GOOGLE_CLIENT_ID),
    }


def public_settings_payload() -> dict:
    return _public_settings_from(_settings_row())


def admin_settings_payload() -> dict:
    data = _settings_row()
    payload = _public_settings_from(data)
    payload["storageQuotaMb"] = int(data.get("storage_quota_mb", 1024))
    return payload


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def _load_admin_row(email: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM admin_users WHERE email = ?", (email,)).fetchone()
    return row_to_dict(row)


def admin_session_payload(email: str) -> dict:
    normalized = email.strip().lower()
    admin = _load_admin_row(normalized)
    if not admin:
        raise HTTPException(status_code=401, detail="Admin account not found.")
    return {"id": admin["id"], "email": admin["email"], "v": int(admin["token_version"])}


def make_admin_token(admin: dict) -> str:
    return token_serializer.dumps(
        {
            "id": admin["id"],
            "email": admin["email"],
            "v": int(admin.get("v") or 0),
            "exp": time.time() + ADMIN_TOKEN_TTL_SECONDS,
        }
    )


def _token_from_request(request: Request) -> str:
    """Extract the admin bearer token from whichever channel survived the trip.

    Preview gateways and embedded/iframe browser contexts can strip the
    Authorization header, block localStorage, or drop third-party cookies —
    any single channel can fail in isolation. The token is therefore accepted
    from several places, in order:

      1. Authorization: Bearer <token>   (standard)
      2. X-Admin-Token: <token>          (survives gateways that drop Authorization)
      3. ?admin_token=<token>            (last resort — survives everything)
      4. mm_admin_token cookie           (first-party fallback store set by the frontend)

    In production the query-parameter channel is disabled: tokens in URLs end
    up in access logs, so they must never be accepted there.
    """
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        if token:
            return token
    x_token = request.headers.get("x-admin-token", "").strip()
    if x_token:
        return x_token
    if not IS_PRODUCTION:
        query_token = request.query_params.get("admin_token", "").strip()
        if query_token:
            return query_token
    return (request.cookies.get("mm_admin_token") or "").strip()


def resolve_admin(request: Request) -> dict | None:
    token = _token_from_request(request)
    if token:
        try:
            payload = token_serializer.loads(token)
            email = str(payload.get("email", "")).strip().lower()
            admin_id = int(payload.get("id", 0))
            version = int(payload.get("v", 0))
            expires = float(payload.get("exp", 0))
            if expires <= time.time():
                logger.warning("Admin auth rejected: token expired")
                return None
            admin = _load_admin_row(email)
            if admin and admin["id"] == admin_id and int(admin["token_version"]) == version:
                return {"id": admin["id"], "email": admin["email"], "v": version}
            logger.warning("Admin auth rejected: token no longer valid (password changed or account mismatch)")
        except (BadSignature, ValueError, TypeError):
            logger.warning("Admin auth rejected: token failed signature validation")
        return None

    session_admin = request.session.get("admin")
    if session_admin and isinstance(session_admin, dict):
        email = str(session_admin.get("email", "")).strip().lower()
        admin = _load_admin_row(email)
        if (
            admin
            and int(session_admin.get("id", 0)) == admin["id"]
            and int(session_admin.get("v", 0)) == int(admin["token_version"])
        ):
            return {"id": admin["id"], "email": admin["email"], "v": int(admin["token_version"])}
    return None


def require_admin(request: Request) -> dict:
    admin = resolve_admin(request)
    if not admin:
        # Diagnostic detail for exactly which auth channel failed — the frontend
        # sends the token several ways, so this pinpoints gateway stripping.
        logger.info(
            "Admin auth failed — authorization header: %s, x-admin-token: %s, "
            "query token: %s, cookie token: %s, session cookie: %s",
            bool(request.headers.get("authorization")),
            bool(request.headers.get("x-admin-token")),
            bool(request.query_params.get("admin_token")),
            bool(request.cookies.get("mm_admin_token")),
            bool(request.session.get("admin")),
        )
        raise HTTPException(status_code=401, detail="Please log in as admin.")
    return admin


def verify_google_token(credential: str) -> dict:
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=400,
            detail="Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID or VITE_GOOGLE_CLIENT_ID first.",
        )
    if not credential.strip():
        raise HTTPException(status_code=400, detail="Google credential is required.")

    tokeninfo_url = "https://oauth2.googleapis.com/tokeninfo?" + urlencode({"id_token": credential})
    try:
        with urlopen(tokeninfo_url, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError):
        raise HTTPException(status_code=401, detail="Unable to verify Google sign-in.")

    email = str(payload.get("email", "")).strip().lower()
    audience = str(payload.get("aud", "")).strip()
    email_verified = str(payload.get("email_verified", "")).strip().lower() == "true"

    if audience != GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=401, detail="Google sign-in client ID mismatch.")
    if not email_verified:
        raise HTTPException(status_code=401, detail="Google account email is not verified.")
    if email != DEFAULT_ADMIN_EMAIL:
        raise HTTPException(status_code=401, detail="This Google account is not allowed.")

    return admin_session_payload(email)


# ---------------------------------------------------------------------------
# Upload helpers
# ---------------------------------------------------------------------------
def detect_image_extension(content: bytes) -> str | None:
    """Identify the image type from the file's actual bytes (magic numbers).

    Only PNG / JPEG / WebP are accepted; everything else returns None.
    This — not the client-supplied filename or Content-Type header — is the
    source of truth, which prevents e.g. uploading `x.html` as "image/png".
    """
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if content.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return ".webp"
    return None


async def validate_image(file: UploadFile | None, field_name: str) -> UploadFile:
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail=f"{field_name} is required.")
    return file


async def save_upload(file: UploadFile, prefix: str) -> str:
    content = await file.read()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 8 MB.")
    extension = detect_image_extension(content)
    if not extension:
        raise HTTPException(status_code=400, detail="Only PNG, JPEG or WebP images are accepted.")
    name = f"{prefix}-{uuid4().hex}{extension}"
    target = UPLOADS_DIR / name
    target.write_bytes(content)
    return f"/uploads/{name}"


def _upload_name_from_url(url_path: str | None) -> str | None:
    """Extract a safe file name from a stored `/uploads/<name>` path."""
    if not url_path:
        return None
    name = url_path.rsplit("/", 1)[-1]
    if (
        not name
        or name in {"", ".", ".."}
        or name.startswith(".")
        or "/" in name
        or "\\" in name
    ):
        return None
    return name


def _delete_upload_file(url_path: str | None) -> None:
    name = _upload_name_from_url(url_path)
    if not name:
        return
    target = (UPLOADS_DIR / name).resolve()
    try:
        target.relative_to(UPLOADS_DIR.resolve())
    except ValueError:
        return
    if target.is_file():
        try:
            target.unlink()
        except OSError:
            logger.warning("Could not delete upload file %s", target)


def _submission_upload_paths() -> set[str]:
    with get_connection() as conn:
        rows = conn.execute("SELECT review_screenshot_path, upi_qr_path FROM submissions").fetchall()
    paths: set[str] = set()
    for row in rows:
        for value in (row["review_screenshot_path"], row["upi_qr_path"]):
            if value:
                paths.add(value)
    return paths


def compute_storage_stats() -> dict:
    """Disk usage of backend/uploads + how much of it is referenced/orphaned."""
    files = [path for path in UPLOADS_DIR.iterdir() if path.is_file()] if UPLOADS_DIR.exists() else []
    referenced = _submission_upload_paths()

    total_bytes = review_bytes = qr_bytes = other_bytes = orphan_bytes = 0
    review_files = qr_files = other_files = orphan_files = 0
    for path in files:
        size = path.stat().st_size
        total_bytes += size
        relative = f"/uploads/{path.name}"
        if relative not in referenced:
            orphan_bytes += size
            orphan_files += 1
        elif path.name.startswith("review-"):
            review_bytes += size
            review_files += 1
        elif path.name.startswith("upiqr-"):
            qr_bytes += size
            qr_files += 1
        else:
            other_bytes += size
            other_files += 1

    quota_mb = int(_settings_row().get("storage_quota_mb", 1024))
    quota_bytes = quota_mb * 1024 * 1024
    return {
        "usedBytes": total_bytes,
        "totalFiles": len(files),
        "reviewBytes": review_bytes,
        "reviewFiles": review_files,
        "qrBytes": qr_bytes,
        "qrFiles": qr_files,
        "otherBytes": other_bytes,
        "otherFiles": other_files,
        "orphanBytes": orphan_bytes,
        "orphanFiles": orphan_files,
        "quotaBytes": quota_bytes,
        "quotaMb": quota_mb,
        "usedPercent": round(total_bytes * 100 / quota_bytes, 1) if quota_bytes else 0.0,
        "overQuota": total_bytes > quota_bytes,
    }


def serialize_submission(submission: dict | None) -> dict:
    if not submission:
        return {}
    return {
        "id": submission["id"],
        "reference": submission["reference"],
        "customerName": submission["customer_name"],
        "orderLast4": submission["order_last4"],
        "customerComment": submission["customer_comment"] or "",
        "reviewScreenshotUrl": submission["review_screenshot_path"],
        "payoutMethod": submission["payout_method"],
        "upiId": submission["upi_id"],
        "upiQrUrl": submission["upi_qr_path"],
        "status": submission["status"],
        "adminNotes": submission["admin_notes"],
        "createdAt": submission["created_at"],
        "updatedAt": submission["updated_at"],
        "approvedAt": submission["approved_at"],
        "paidAt": submission["paid_at"],
    }


@app.on_event("startup")
def on_startup() -> None:
    init_db()


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/settings")
def get_public_settings() -> dict:
    return public_settings_payload()


@app.post("/api/submissions")
async def create_submission(
    request: Request,
    customerName: str = Form(...),
    orderLast4: str = Form(...),
    customerComment: str = Form(""),
    payoutMethod: Literal["upi", "qr"] = Form(...),
    upiId: str = Form(""),
    reviewScreenshot: UploadFile = File(...),
    upiQr: UploadFile | None = File(default=None),
):
    submit_limiter.check(client_ip(request), SUBMIT_RATE_LIMIT, SUBMIT_RATE_WINDOW_SECONDS)

    settings = public_settings_payload()
    if not settings["campaignActive"]:
        raise HTTPException(status_code=400, detail=settings["pauseMessage"])

    customer_name = customerName.strip()
    last4 = orderLast4.strip()
    customer_comment = customerComment.strip()
    if len(customer_name) < 2:
        raise HTTPException(status_code=400, detail="Customer name is required.")
    if len(last4) != 4 or not last4.isdigit():
        raise HTTPException(status_code=400, detail="Order ID last 4 digits must be exactly 4 numbers.")

    final_upi = upiId.strip()
    if payoutMethod == "upi":
        if not final_upi or "@" not in final_upi:
            raise HTTPException(status_code=400, detail="Valid UPI ID is required.")
    else:
        await validate_image(upiQr, "UPI QR image")

    # Only after EVERY form field validated do we read + write files to disk —
    # an invalid submission must never leave orphan uploads behind.
    await validate_image(reviewScreenshot, "Review screenshot")
    review_path = await save_upload(reviewScreenshot, "review")

    qr_path = None
    if payoutMethod == "qr":
        qr_path = await save_upload(upiQr, "upiqr")
        final_upi = ""

    now = utc_now()
    try:
        with get_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO submissions (
                    customer_name, order_last4, customer_comment, review_screenshot_path, payout_method,
                    upi_id, upi_qr_path, status, admin_notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', '', ?, ?)
                """,
                (customer_name, last4, customer_comment, review_path, payoutMethod, final_upi, qr_path, now, now),
            )
            row_id = cursor.lastrowid
            reference = f"MMC-{now[:4]}-{row_id:06d}"
            conn.execute("UPDATE submissions SET reference = ? WHERE id = ?", (reference, row_id))
    except Exception:
        # DB failure — remove the files we just wrote so they don't become orphans.
        _delete_upload_file(review_path)
        _delete_upload_file(qr_path)
        raise

    return {
        "message": "Submission received successfully.",
        "reference": reference,
        "status": "pending",
    }


@app.get("/api/submissions/status/{reference}")
def get_submission_status(reference: str) -> dict:
    """Public, privacy-safe status lookup by reference ID.

    Lets a customer track their claim from the status page. Deliberately returns
    only non-sensitive fields — no name, UPI ID, screenshots, or admin notes —
    so a leaked (or guessed) reference reveals nothing about payout details.
    """
    ref = reference.strip().upper()
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT reference, status, created_at, updated_at, approved_at, paid_at
            FROM submissions WHERE UPPER(reference) = ?
            """,
            (ref,),
        ).fetchone()
    submission = row_to_dict(row)
    if not submission:
        raise HTTPException(
            status_code=404,
            detail="No submission found with this reference. Please check the reference ID and try again.",
        )
    return {
        "reference": submission["reference"],
        "status": submission["status"],
        "createdAt": submission["created_at"],
        "updatedAt": submission["updated_at"],
        "approvedAt": submission["approved_at"],
        "paidAt": submission["paid_at"],
    }


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@app.post("/api/auth/login")
def login(request: Request, email: str = Form(...), password: str = Form(...)) -> dict:
    login_limiter.check(client_ip(request), LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW_SECONDS)
    normalized = email.strip().lower()
    admin = _load_admin_row(normalized)
    # One generic message for every failure (bad email, bad password, unknown
    # account) — distinct errors let attackers enumerate which admin email the
    # system uses, and the email must never be revealed anyway.
    if not admin or not verify_password(password, admin["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    session_admin = {"id": admin["id"], "email": admin["email"], "v": int(admin["token_version"])}
    request.session.clear()
    request.session["admin"] = session_admin
    return {"ok": True, "admin": session_admin, "token": make_admin_token(session_admin)}


@app.post("/api/auth/google")
def login_with_google(request: Request, payload: dict) -> dict:
    session_admin = verify_google_token(payload.get("credential", ""))
    request.session.clear()
    request.session["admin"] = session_admin
    return {"ok": True, "admin": session_admin, "token": make_admin_token(session_admin)}


@app.post("/api/auth/logout")
def logout(request: Request) -> dict:
    request.session.clear()
    return {"ok": True}


@app.get("/api/auth/me")
def me(request: Request) -> dict:
    admin = resolve_admin(request)
    return {"authenticated": bool(admin), "admin": admin}


@app.post("/api/auth/change-password")
def change_password(
    request: Request,
    currentPassword: str = Form(...),
    newPassword: str = Form(...),
) -> dict:
    admin = require_admin(request)
    new = newPassword.strip()
    if len(new) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")

    with get_connection() as conn:
        row = conn.execute("SELECT * FROM admin_users WHERE id = ?", (admin["id"],)).fetchone()
        current = row_to_dict(row)
        if not current or not verify_password(currentPassword, current["password_hash"]):
            raise HTTPException(status_code=400, detail="Current password is incorrect.")
        next_version = int(current["token_version"]) + 1
        conn.execute(
            "UPDATE admin_users SET password_hash = ?, token_version = ?, updated_at = ? WHERE id = ?",
            (hash_password(new), next_version, utc_now(), admin["id"]),
        )

    # Refresh the session with the new version so the current tab stays logged
    # in; every OTHER session/token (old version) is now invalid everywhere.
    fresh = {"id": admin["id"], "email": admin["email"], "v": next_version}
    request.session.clear()
    request.session["admin"] = fresh
    return {"ok": True, "message": "Password updated successfully.", "token": make_admin_token(fresh)}


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------
@app.get("/api/admin/settings")
def get_admin_settings(request: Request) -> dict:
    require_admin(request)
    return admin_settings_payload()


@app.put("/api/admin/settings")
def update_admin_settings(request: Request, payload: dict) -> dict:
    require_admin(request)
    business_name = str(payload.get("businessName", "")).strip() or "Mahalaxmi Multi Cuisine"
    try:
        cashback_amount = int(payload.get("cashbackAmount", 15))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Cashback amount must be a number.")
    if not 1 <= cashback_amount <= 10_000:
        raise HTTPException(status_code=400, detail="Cashback amount must be between 1 and 10000.")
    try:
        storage_quota_mb = int(payload.get("storageQuotaMb", 1024))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Storage quota must be a number.")
    if not 10 <= storage_quota_mb <= 102_400:
        raise HTTPException(status_code=400, detail="Storage quota must be between 10 MB and 102400 MB.")
    campaign_active = 1 if payload.get("campaignActive", True) else 0
    pause_message = str(payload.get("pauseMessage", "")).strip() or "Cashback submissions are paused right now. Please try again shortly."
    success_note = str(payload.get("successNote", "")).strip() or "Cashback will be checked and processed after review."
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE app_settings
            SET business_name = ?, cashback_amount = ?, campaign_active = ?,
                pause_message = ?, success_note = ?, storage_quota_mb = ?, updated_at = ?
            WHERE id = 1
            """,
            (business_name, cashback_amount, campaign_active, pause_message, success_note, storage_quota_mb, utc_now()),
        )
    return admin_settings_payload()


@app.get("/api/admin/submissions")
def list_submissions(request: Request, search: str = "", status: str = "all") -> list[dict]:
    require_admin(request)
    query = "SELECT * FROM submissions WHERE 1=1"
    params: list[str] = []
    if status != "all":
        query += " AND status = ?"
        params.append(status)
    if search.strip():
        needle = f"%{search.strip().lower()}%"
        query += " AND (LOWER(reference) LIKE ? OR LOWER(customer_name) LIKE ? OR LOWER(order_last4) LIKE ? OR LOWER(COALESCE(upi_id, '')) LIKE ?)"
        params.extend([needle, needle, needle, needle])
    query += " ORDER BY id DESC"
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
    return [serialize_submission(row_to_dict(row)) for row in rows]


@app.get("/api/admin/submissions/{submission_id}")
def get_submission(request: Request, submission_id: int) -> dict:
    require_admin(request)
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM submissions WHERE id = ?", (submission_id,)).fetchone()
    submission = row_to_dict(row)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found.")
    return serialize_submission(submission)


@app.patch("/api/admin/submissions/{submission_id}")
def update_submission(request: Request, submission_id: int, payload: dict) -> dict:
    require_admin(request)
    status = payload.get("status")
    if status and status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status.")

    with get_connection() as conn:
        existing = conn.execute("SELECT * FROM submissions WHERE id = ?", (submission_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Submission not found.")
        current = row_to_dict(existing)
        # Only overwrite notes when the client actually sent the field, so a
        # status-only PATCH never wipes existing admin notes.
        if payload.get("adminNotes") is None:
            admin_notes = current.get("admin_notes") or ""
        else:
            admin_notes = str(payload["adminNotes"]).strip()

        next_status = status or current["status"]
        approved_at = current.get("approved_at")
        paid_at = current.get("paid_at")
        now = utc_now()
        if next_status in {"approved", "paid"} and not approved_at:
            approved_at = now
        if next_status == "paid" and not paid_at:
            paid_at = now

        conn.execute(
            """
            UPDATE submissions
            SET status = ?, admin_notes = ?, updated_at = ?, approved_at = ?, paid_at = ?
            WHERE id = ?
            """,
            (next_status, admin_notes, now, approved_at, paid_at, submission_id),
        )
        row = conn.execute("SELECT * FROM submissions WHERE id = ?", (submission_id,)).fetchone()
    return serialize_submission(row_to_dict(row))


@app.delete("/api/admin/submissions/{submission_id}")
def delete_submission(request: Request, submission_id: int) -> dict:
    """Permanently delete a submission: DB row AND its uploaded files."""
    require_admin(request)
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM submissions WHERE id = ?", (submission_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Submission not found.")
        submission = row_to_dict(row)
        conn.execute("DELETE FROM submissions WHERE id = ?", (submission_id,))
    _delete_upload_file(submission.get("review_screenshot_path"))
    _delete_upload_file(submission.get("upi_qr_path"))
    return {
        "ok": True,
        "message": "Submission deleted permanently.",
        "id": submission_id,
        "reference": submission.get("reference"),
        "freedBytes": compute_storage_stats()["usedBytes"],
    }


# ---------------------------------------------------------------------------
# Storage tracking
# ---------------------------------------------------------------------------
@app.get("/api/admin/storage")
def storage_stats(request: Request) -> dict:
    require_admin(request)
    return compute_storage_stats()


@app.post("/api/admin/storage/cleanup")
def cleanup_orphan_uploads(request: Request) -> dict:
    """Delete upload files that no submission references (e.g. uploads left
    behind by interrupted submissions). Safe: only files under the uploads
    directory are touched, using their exact basename."""
    require_admin(request)
    referenced = _submission_upload_paths()
    removed_bytes = 0
    removed_files = 0
    for path in UPLOADS_DIR.iterdir():
        if not path.is_file():
            continue
        if f"/uploads/{path.name}" in referenced:
            continue
        try:
            removed_bytes += path.stat().st_size
            path.unlink()
            removed_files += 1
        except OSError:
            logger.warning("Could not delete orphan upload %s", path)
    stats = compute_storage_stats()
    return {
        "ok": True,
        "message": f"Removed {removed_files} unreferenced file(s) and freed {removed_bytes} bytes.",
        "removedFiles": removed_files,
        "freedBytes": removed_bytes,
        "storage": stats,
    }


@app.get("/api/admin/dashboard")
def dashboard(request: Request) -> dict:
    require_admin(request)
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM submissions ORDER BY id DESC").fetchall()
    submissions = [serialize_submission(row_to_dict(row)) for row in rows]
    counts = {key: 0 for key in ["pending", "approved", "paid", "rejected"]}
    for item in submissions:
        if item["status"] in counts:
            counts[item["status"]] += 1
    return {"submissions": submissions, "stats": {"total": len(submissions), **counts}}


# ---------------------------------------------------------------------------
# SPA hosting (built frontend served by the backend itself)
# ---------------------------------------------------------------------------
# index.html must never be cached, or a redeployed frontend can keep serving a
# stale bundle (and a stale bundle keeps pointing at an old backend).
NO_CACHE_HTML = {"Cache-Control": "no-cache"}


@app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
def frontend_index():
    if FRONTEND_INDEX.exists():
        response = FileResponse(FRONTEND_INDEX, headers=NO_CACHE_HTML)
        if IS_PRODUCTION:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                "font-src https://fonts.gstatic.com; img-src 'self' data: blob:; "
                "connect-src 'self' https://oauth2.googleapis.com; frame-src https://accounts.google.com"
            )
        return response
    return {
        "ok": True,
        "message": "Frontend build not found yet.",
        "next": "Run npm run build in my-react-app to publish the app preview.",
    }


@app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
def frontend_files(full_path: str):
    if full_path.startswith("api") or full_path.startswith("uploads"):
        raise HTTPException(status_code=404, detail="Not found.")

    if FRONTEND_DIST_DIR.exists() and full_path:
        candidate = (FRONTEND_DIST_DIR / full_path).resolve()
        try:
            candidate.relative_to(FRONTEND_DIST_DIR.resolve())
        except ValueError:
            raise HTTPException(status_code=404, detail="Not found.")
        if candidate.is_file():
            return FileResponse(candidate)

    if FRONTEND_INDEX.exists():
        return FileResponse(FRONTEND_INDEX, headers=NO_CACHE_HTML)
    raise HTTPException(status_code=404, detail="Not found.")


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
