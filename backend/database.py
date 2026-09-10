from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from security import hash_password

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "mahalaxmi.db"
UPLOADS_DIR = BASE_DIR / "uploads"


def _load_env_file() -> None:
    """Load `backend/.env` into os.environ (existing env vars always win).

    The app reads configuration from environment variables; this makes a
    `backend/.env` file work for local and single-host runs without exporting
    everything by hand. Format: one `KEY=VALUE` per line, `#` comments.
    """
    env_path = BASE_DIR / ".env"
    if not env_path.is_file():
        return
    try:
        lines = env_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("\"'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file()

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
                customer_comment TEXT NOT NULL DEFAULT '',
                review_screenshot_path TEXT NOT NULL,
                payout_method TEXT NOT NULL,
                upi_id TEXT,
                upi_qr_path TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                admin_notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                approved_at TEXT,
                paid_at TEXT
            )
            """
        )
        # Lightweight migrations for databases created before these columns existed.
        ensure_column(conn, "submissions", "customer_comment", "TEXT NOT NULL DEFAULT ''")
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
