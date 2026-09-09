from __future__ import annotations

import json
import os
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

ALLOWED_STATUSES = {"pending", "approved", "paid", "rejected"}

# The signing secret must come from the environment in production — with the
# hard-coded fallback, anyone could mint a valid admin token.
_APP_ENV = os.getenv("APP_ENV", "").strip().lower()
if _APP_ENV == "production" and not os.getenv("SESSION_SECRET", "").strip():
    raise RuntimeError(
        "SESSION_SECRET must be set as an environment variable when APP_ENV=production. "
        "The default local secret is disabled in production."
    )
SESSION_SECRET = os.getenv("SESSION_SECRET", "").strip() or "mahalaxmi-local-secret"
GOOGLE_CLIENT_ID = (os.getenv("GOOGLE_CLIENT_ID") or os.getenv("VITE_GOOGLE_CLIENT_ID") or "").strip()
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
FRONTEND_DIST_DIR = PROJECT_DIR / "my-react-app" / "dist"
FRONTEND_INDEX = FRONTEND_DIST_DIR / "index.html"
token_serializer = URLSafeSerializer(SESSION_SECRET, salt="admin-token")

app = FastAPI(title="Mahalaxmi Review Cashback API")
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    same_site="lax",
    https_only=False,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_origin_regex=r"https://.*\.e2b\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    return response


def public_settings_payload() -> dict:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM app_settings WHERE id = 1").fetchone()
    data = row_to_dict(row) or {}
    return {
        "businessName": data.get("business_name", "Mahalaxmi Multi Cuisine"),
        "cashbackAmount": data.get("cashback_amount", 15),
        "campaignActive": bool(data.get("campaign_active", 1)),
        "pauseMessage": data.get("pause_message", "Cashback submissions are paused right now."),
        "successNote": data.get("success_note", "Cashback will be checked and processed after review."),
        "adminEmail": DEFAULT_ADMIN_EMAIL,
        "googleAuthEnabled": bool(GOOGLE_CLIENT_ID),
    }


def admin_session_payload(email: str) -> dict:
    normalized = email.strip().lower()
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM admin_users WHERE email = ?", (normalized,)).fetchone()
    admin = row_to_dict(row)
    if not admin:
        raise HTTPException(status_code=401, detail="Admin account not found.")
    return {"id": admin["id"], "email": admin["email"]}


def make_admin_token(admin: dict) -> str:
    return token_serializer.dumps({"id": admin["id"], "email": admin["email"]})


def resolve_admin(request: Request) -> dict | None:
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        if token:
            try:
                payload = token_serializer.loads(token)
                email = str(payload.get("email", "")).strip().lower()
                admin_id = int(payload.get("id", 0))
                if email == DEFAULT_ADMIN_EMAIL and admin_id > 0:
                    return {"id": admin_id, "email": email}
            except (BadSignature, ValueError, TypeError):
                return None

    admin = request.session.get("admin")
    if admin and str(admin.get("email", "")).strip().lower() == DEFAULT_ADMIN_EMAIL:
        return admin
    return None


def require_admin(request: Request) -> dict:
    admin = resolve_admin(request)
    if not admin:
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


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/settings")
def get_public_settings() -> dict:
    return public_settings_payload()


@app.post("/api/submissions")
async def create_submission(
    customerName: str = Form(...),
    orderLast4: str = Form(...),
    customerComment: str = Form(""),
    payoutMethod: Literal["upi", "qr"] = Form(...),
    upiId: str = Form(""),
    reviewScreenshot: UploadFile = File(...),
    upiQr: UploadFile | None = File(default=None),
):
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

    await validate_image(reviewScreenshot, "Review screenshot")
    review_path = await save_upload(reviewScreenshot, "review")

    final_upi = upiId.strip()
    qr_path = None
    if payoutMethod == "upi":
        if not final_upi or "@" not in final_upi:
            raise HTTPException(status_code=400, detail="Valid UPI ID is required.")
    else:
        await validate_image(upiQr, "UPI QR image")
        qr_path = await save_upload(upiQr, "upiqr")
        final_upi = ""

    now = utc_now()
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

    return {
        "message": "Submission received successfully.",
        "reference": reference,
        "status": "pending",
    }


@app.post("/api/auth/login")
def login(request: Request, email: str = Form(...), password: str = Form(...)) -> dict:
    normalized = email.strip().lower()
    if normalized != DEFAULT_ADMIN_EMAIL:
        raise HTTPException(status_code=401, detail="This email is not allowed.")

    with get_connection() as conn:
        row = conn.execute("SELECT * FROM admin_users WHERE email = ?", (normalized,)).fetchone()
    admin = row_to_dict(row)
    if not admin or not verify_password(password, admin["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    session_admin = {"id": admin["id"], "email": admin["email"]}
    request.session.clear()
    request.session["admin"] = session_admin
    return {"ok": True, "admin": session_admin, "token": make_admin_token(session_admin)}


@app.post("/api/auth/google")
def login_with_google(request: Request, payload: dict) -> dict:
    credential = str(payload.get("credential", ""))
    session_admin = verify_google_token(credential)
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
    if len(newPassword.strip()) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")

    with get_connection() as conn:
        row = conn.execute("SELECT * FROM admin_users WHERE id = ?", (admin["id"],)).fetchone()
        current = row_to_dict(row)
        if not current or not verify_password(currentPassword, current["password_hash"]):
            raise HTTPException(status_code=400, detail="Current password is incorrect.")
        conn.execute(
            "UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE id = ?",
            (hash_password(newPassword.strip()), utc_now(), admin["id"]),
        )
    return {"ok": True, "message": "Password updated successfully."}


@app.get("/api/admin/settings")
def get_admin_settings(request: Request) -> dict:
    require_admin(request)
    return public_settings_payload()


@app.put("/api/admin/settings")
def update_admin_settings(request: Request, payload: dict) -> dict:
    require_admin(request)
    business_name = str(payload.get("businessName", "")).strip() or "Mahalaxmi Multi Cuisine"
    cashback_amount = int(payload.get("cashbackAmount", 15) or 15)
    campaign_active = 1 if payload.get("campaignActive", True) else 0
    pause_message = str(payload.get("pauseMessage", "")).strip() or "Cashback submissions are paused right now. Please try again shortly."
    success_note = str(payload.get("successNote", "")).strip() or "Cashback will be checked and processed after review."
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE app_settings
            SET business_name = ?, cashback_amount = ?, campaign_active = ?,
                pause_message = ?, success_note = ?, updated_at = ?
            WHERE id = 1
            """,
            (business_name, cashback_amount, campaign_active, pause_message, success_note, utc_now()),
        )
    return public_settings_payload()


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


# index.html must never be cached, or a redeployed frontend can keep serving a
# stale bundle (and a stale bundle keeps pointing at an old backend).
NO_CACHE_HTML = {"Cache-Control": "no-cache"}


@app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
def frontend_index():
    if FRONTEND_INDEX.exists():
        return FileResponse(FRONTEND_INDEX, headers=NO_CACHE_HTML)
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
