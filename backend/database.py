from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from dotenv import load_dotenv

from security import hash_password

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "mahalaxmi.db"
UPLOADS_DIR = BASE_DIR / "uploads"


# Load config consistently even when this repository is imported directly.
load_dotenv(BASE_DIR / ".env", override=False)

# In production (APP_ENV=production) the admin credentials must come from the
# environment — no hard-coded fallbacks. Local development keeps the
# documented defaults so `uvicorn main:app` just works out of the box.
APP_ENV = os.getenv("APP_ENV", "").strip().lower()

if APP_ENV == "production":
    DEFAULT_ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").strip().lower()
    DEFAULT_ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
    if not DEFAULT_ADMIN_EMAIL or not DEFAULT_ADMIN_PASSWORD:
        raise RuntimeError(
            "ADMIN_EMAIL and ADMIN_PASSWORD must be set as environment variables "
            "when APP_ENV=production. Hard-coded default credentials are disabled in production."
        )
else:
    DEFAULT_ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "team.duobits@gmail.com").strip().lower()
    DEFAULT_ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "aditya9922")

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS admin_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                token_version INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                business_name TEXT NOT NULL,
                cashback_amount INTEGER NOT NULL,
                campaign_active INTEGER NOT NULL DEFAULT 1,
                pause_message TEXT NOT NULL,
                success_note TEXT NOT NULL,
                storage_quota_mb INTEGER NOT NULL DEFAULT 1024,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reference TEXT UNIQUE,
                customer_name TEXT NOT NULL,
                order_last4 TEXT NOT NULL,
                ordered_app TEXT NOT NULL DEFAULT '',
                customer_comment TEXT NOT NULL DEFAULT '',
                review_screenshot_path TEXT NOT NULL,
                payout_method TEXT NOT NULL,
                upi_id TEXT,
                upi_qr_path TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                admin_notes TEXT NOT NULL DEFAULT '',
                duplicate_of TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                approved_at TEXT,
                paid_at TEXT
            )
            """
        )
        # Lightweight migrations for databases created before these columns existed.
        ensure_column(conn, "submissions", "ordered_app", "TEXT NOT NULL DEFAULT ''")
        ensure_column(conn, "submissions", "customer_comment", "TEXT NOT NULL DEFAULT ''")
        ensure_column(conn, "submissions", "duplicate_of", "TEXT NOT NULL DEFAULT ''")
        ensure_column(conn, "admin_users", "token_version", "INTEGER NOT NULL DEFAULT 1")
        ensure_column(conn, "app_settings", "storage_quota_mb", "INTEGER NOT NULL DEFAULT 1024")

        now = utc_now()
        existing_admin = conn.execute(
            "SELECT id FROM admin_users WHERE email = ?", (DEFAULT_ADMIN_EMAIL,)
        ).fetchone()
        if not existing_admin:
            conn.execute(
                "INSERT INTO admin_users (email, password_hash, token_version, created_at, updated_at) "
                "VALUES (?, ?, 1, ?, ?)",
                (DEFAULT_ADMIN_EMAIL, hash_password(DEFAULT_ADMIN_PASSWORD), now, now),
            )

        existing_settings = conn.execute("SELECT id FROM app_settings WHERE id = 1").fetchone()
        if not existing_settings:
            conn.execute(
                """
                INSERT INTO app_settings (
                    id, business_name, cashback_amount, campaign_active,
                    pause_message, success_note, storage_quota_mb, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    1,
                    "Mahalaxmi Multi Cuisine",
                    15,
                    1,
                    "Cashback submissions are paused right now. Please try again shortly.",
                    "Cashback will be checked and processed after review.",
                    1024,
                    now,
                    now,
                ),
            )


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


# ---------------------------------------------------------------------------
# Repository interface
# ---------------------------------------------------------------------------
# The functions below are the single data-access interface used by main.py.
# firestore_service.py implements the exact same interface against Cloud
# Firestore, so the backend can run on SQLite locally (zero config) and on
# Firestore + Firebase Storage in production without touching the routes.
# ---------------------------------------------------------------------------


def init_store() -> None:
    """Create schema + seed defaults. Alias kept for interface symmetry."""
    init_db()


def get_settings_row() -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM app_settings WHERE id = 1").fetchone()
    return row_to_dict(row)


def update_settings(fields: dict) -> None:
    if not fields:
        return
    assignments = ", ".join(f"{column} = ?" for column in fields)
    with get_connection() as conn:
        conn.execute(
            f"UPDATE app_settings SET {assignments} WHERE id = 1",
            tuple(fields.values()),
        )


def get_admin_by_email(email: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM admin_users WHERE email = ?", (email,)).fetchone()
    return row_to_dict(row)


def set_admin_password(email: str, password_hash: str, token_version: int, updated_at: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE admin_users SET password_hash = ?, token_version = ?, updated_at = ? WHERE email = ?",
            (password_hash, token_version, updated_at, email),
        )


def create_submission(fields: dict, doc_id: str | None = None) -> dict:
    """Insert a new submission and return the stored row (incl. reference).

    ``doc_id`` is only used by the Firestore backend (it becomes the document
    ID); SQLite generates its own integer ID.
    """
    now = fields["created_at"]
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO submissions (
                customer_name, order_last4, ordered_app, customer_comment, review_screenshot_path, payout_method,
                upi_id, upi_qr_path, status, admin_notes, created_at, updated_at, duplicate_of
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fields["customer_name"],
                fields["order_last4"],
                fields.get("ordered_app", ""),
                fields.get("customer_comment", ""),
                fields["review_screenshot_path"],
                fields["payout_method"],
                fields.get("upi_id") or "",
                fields.get("upi_qr_path"),
                fields.get("status", "pending"),
                fields.get("admin_notes", ""),
                now,
                fields.get("updated_at", now),
                fields.get("duplicate_of", ""),
            ),
        )
        row_id = cursor.lastrowid
        reference = f"MMC-{now[:4]}-{row_id:06d}"
        conn.execute("UPDATE submissions SET reference = ? WHERE id = ?", (reference, row_id))
        row = conn.execute("SELECT * FROM submissions WHERE id = ?", (row_id,)).fetchone()
    return row_to_dict(row)


def get_submission_by_id(submission_id: Any) -> dict | None:
    try:
        numeric_id = int(submission_id)
    except (TypeError, ValueError):
        return None
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM submissions WHERE id = ?", (numeric_id,)).fetchone()
    return row_to_dict(row)


def get_submission_by_reference(reference: str) -> dict | None:
    ref = reference.strip().upper()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM submissions WHERE UPPER(reference) = ?", (ref,)
        ).fetchone()
    return row_to_dict(row)


def list_submissions(search: str = "", status: str = "all") -> list[dict]:
    query = "SELECT * FROM submissions WHERE 1=1"
    params: list[str] = []
    if status != "all":
        query += " AND status = ?"
        params.append(status)
    if search.strip():
        needle = f"%{search.strip().lower()}%"
        query += (
            " AND (LOWER(reference) LIKE ? OR LOWER(customer_name) LIKE ? "
            "OR LOWER(order_last4) LIKE ? OR LOWER(COALESCE(ordered_app, '')) LIKE ? OR LOWER(COALESCE(upi_id, '')) LIKE ?)"
        )
        params.extend([needle, needle, needle, needle, needle])
    query += " ORDER BY id DESC"
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
    return [row_to_dict(row) for row in rows]


def all_submission_rows() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM submissions").fetchall()
    return [row_to_dict(row) for row in rows]


def update_submission_fields(submission_id: Any, fields: dict) -> dict | None:
    if not fields:
        return get_submission_by_id(submission_id)
    try:
        numeric_id = int(submission_id)
    except (TypeError, ValueError):
        return None
    assignments = ", ".join(f"{column} = ?" for column in fields)
    with get_connection() as conn:
        conn.execute(
            f"UPDATE submissions SET {assignments} WHERE id = ?",
            (*fields.values(), numeric_id),
        )
        row = conn.execute("SELECT * FROM submissions WHERE id = ?", (numeric_id,)).fetchone()
    return row_to_dict(row)


def delete_submission_row(submission_id: Any) -> dict | None:
    try:
        numeric_id = int(submission_id)
    except (TypeError, ValueError):
        return None
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM submissions WHERE id = ?", (numeric_id,)).fetchone()
        if row is None:
            return None
        conn.execute("DELETE FROM submissions WHERE id = ?", (numeric_id,))
    return row_to_dict(row)


def get_all_upload_paths() -> set[str]:
    paths: set[str] = set()
    for row in all_submission_rows():
        for value in (row["review_screenshot_path"], row["upi_qr_path"]):
            if value:
                paths.add(value)
    return paths


def find_recent_duplicate(customer_name: str, order_last4: str, since_iso: str) -> dict | None:
    """Find a submission with the same name + order digits within the window.

    Order-last-4 alone is NOT unique — the combination of name + digits +
    recency is used to flag suspicious double claims for admin review.
    """
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT * FROM submissions
            WHERE LOWER(customer_name) = LOWER(?) AND order_last4 = ? AND created_at >= ?
            ORDER BY id DESC LIMIT 1
            """,
            (customer_name, order_last4, since_iso),
        ).fetchone()
    return row_to_dict(row)
