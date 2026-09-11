"""Cloud Firestore repository — the production data layer.

Implements the exact same interface as the SQLite helpers in ``database.py``
(see the "Repository interface" section there), so ``main.py`` can swap
between the two without touching any route. Every function returns plain
dicts shaped like the SQLite rows (snake_case keys + an ``id`` key), with
ISO-8601 string timestamps so the JSON API contract is byte-for-byte
identical in both modes.

Firestore layout:

    settings/public          — single doc: customer-facing settings + quota
    admins/{email}           — one doc per admin (email lower-cased)
    submissions/{uuid}       — one doc per cashback claim (UUID document ID)
    meta/counters            — auto-incrementing sequence for references

Timestamps are stored as ISO strings (not Firestore Timestamp objects) so
rows serialize exactly like the SQLite backend; lexicographic comparison of
identically-formatted UTC ISO strings is chronological.
"""
from __future__ import annotations

import logging
from typing import Any

from firebase_service import firestore_client
from security import hash_password

logger = logging.getLogger("mahalaxmi")

SETTINGS_DOC = "settings/public"
ADMINS_COLLECTION = "admins"
SUBMISSIONS_COLLECTION = "submissions"
COUNTERS_DOC = "meta/counters"

# Fill Firestore docs up to the full SQLite column set so every consumer can
# index rows the same way in both modes.
_SUBMISSION_DEFAULTS: dict[str, Any] = {
    "reference": "",
    "customer_name": "",
    "order_last4": "",
    "customer_comment": "",
    "review_screenshot_path": None,
    "payout_method": "upi",
    "upi_id": "",
    "upi_qr_path": None,
    "status": "pending",
    "admin_notes": "",
    "duplicate_of": "",
    "created_at": "",
    "updated_at": "",
    "approved_at": None,
    "paid_at": None,
}


def _submission_row(doc_id: str, data: dict | None) -> dict:
    row = dict(_SUBMISSION_DEFAULTS)
    if data:
        row.update(data)
    row["id"] = doc_id
    return row


def _doc_data(doc_ref) -> dict | None:
    snapshot = doc_ref.get()
    return snapshot.to_dict() if snapshot.exists else None


# ---------------------------------------------------------------------------
# Bootstrapping / seeding
# ---------------------------------------------------------------------------
def init_store() -> None:
    """Seed the settings + admin documents if they do not exist yet.

    Admin credentials come from ADMIN_EMAIL / ADMIN_PASSWORD exactly like the
    SQLite path (database.py enforces that they are present in production).
    """
    # Import here so the config (env loading, credential checks) runs first.
    from database import DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD, utc_now

    client = firestore_client()
    now = utc_now()

    settings_ref = client.document(SETTINGS_DOC)
    if not settings_ref.get().exists:
        settings_ref.set(
            {
                "business_name": "Mahalaxmi Multi Cuisine",
                "cashback_amount": 15,
                "campaign_active": 1,
                "pause_message": "Cashback submissions are paused right now. Please try again shortly.",
                "success_note": "Cashback will be checked and processed after review.",
                "storage_quota_mb": 1024,
                "created_at": now,
                "updated_at": now,
            }
        )
        logger.info("Seeded Firestore settings document %s", SETTINGS_DOC)

    admin_ref = client.collection(ADMINS_COLLECTION).document(DEFAULT_ADMIN_EMAIL)
    if not admin_ref.get().exists:
        admin_ref.set(
            {
                "id": 1,
                "email": DEFAULT_ADMIN_EMAIL,
                "password_hash": hash_password(DEFAULT_ADMIN_PASSWORD),
                "role": "admin",
                "token_version": 1,
                "created_at": now,
                "updated_at": now,
            }
        )
        logger.info("Seeded Firestore admin document for %s", DEFAULT_ADMIN_EMAIL)

    counters_ref = client.document(COUNTERS_DOC)
    if not counters_ref.get().exists:
        counters_ref.set({"submission_seq": 0, "updated_at": now})


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
def get_settings_row() -> dict | None:
    return _doc_data(firestore_client().document(SETTINGS_DOC))


def update_settings(fields: dict) -> None:
    if fields:
        firestore_client().document(SETTINGS_DOC).set(fields, merge=True)


# ---------------------------------------------------------------------------
# Admins
# ---------------------------------------------------------------------------
def get_admin_by_email(email: str) -> dict | None:
    return _doc_data(firestore_client().collection(ADMINS_COLLECTION).document(email))


def set_admin_password(email: str, password_hash: str, token_version: int, updated_at: str) -> None:
    firestore_client().collection(ADMINS_COLLECTION).document(email).update(
        {
            "password_hash": password_hash,
            "token_version": token_version,
            "updated_at": updated_at,
        }
    )


# ---------------------------------------------------------------------------
# Submissions
# ---------------------------------------------------------------------------
def _next_reference(now_iso: str) -> str:
    """MMC-YYYY-NNNNNN from a transactionally incremented counter document."""
    from firebase_admin import firestore as fa_firestore

    client = firestore_client()
    counter_ref = client.document(COUNTERS_DOC)
    transaction = client.transaction()

    @fa_firestore.transactional
    def _bump(tx) -> int:
        snapshot = tx.get(counter_ref)
        seq = int((snapshot.to_dict() or {}).get("submission_seq", 0)) + 1
        tx.set(counter_ref, {"submission_seq": seq, "updated_at": now_iso}, merge=True)
        return seq

    seq = _bump(transaction)
    return f"MMC-{now_iso[:4]}-{seq:06d}"


def create_submission(fields: dict, doc_id: str | None = None) -> dict:
    if not doc_id:
        raise ValueError("Firestore submissions require a document ID (uuid).")
    reference = _next_reference(fields["created_at"])
    document = {key: value for key, value in fields.items()}
    document["reference"] = reference
    firestore_client().collection(SUBMISSIONS_COLLECTION).document(doc_id).set(document)
    return _submission_row(doc_id, document)


def get_submission_by_id(submission_id: Any) -> dict | None:
    if not submission_id:
        return None
    data = _doc_data(firestore_client().collection(SUBMISSIONS_COLLECTION).document(str(submission_id)))
    return _submission_row(str(submission_id), data) if data is not None else None


def get_submission_by_reference(reference: str) -> dict | None:
    ref = reference.strip().upper()
    if not ref:
        return None
    client = firestore_client()
    query = client.collection(SUBMISSIONS_COLLECTION).where("reference", "==", ref).limit(1)
    for snapshot in query.stream():
        return _submission_row(snapshot.id, snapshot.to_dict())
    return None


def all_submission_rows() -> list[dict]:
    client = firestore_client()
    return [
        _submission_row(snapshot.id, snapshot.to_dict())
        for snapshot in client.collection(SUBMISSIONS_COLLECTION).stream()
    ]


def list_submissions(search: str = "", status: str = "all") -> list[dict]:
    """All matching submissions, newest first.

    Firestore has no substring search, so filtering happens in memory — the
    submission volume of a single restaurant stays far below any level where
    that matters.
    """
    needle = search.strip().lower()
    rows: list[dict] = []
    for row in all_submission_rows():
        if status != "all" and row.get("status") != status:
            continue
        if needle:
            haystacks = (
                row.get("reference") or "",
                row.get("customer_name") or "",
                row.get("order_last4") or "",
                row.get("upi_id") or "",
            )
            if not any(needle in value.lower() for value in haystacks):
                continue
        rows.append(row)
    rows.sort(key=lambda item: (item.get("created_at") or "", item.get("reference") or ""), reverse=True)
    return rows


def update_submission_fields(submission_id: Any, fields: dict) -> dict | None:
    doc_ref = firestore_client().collection(SUBMISSIONS_COLLECTION).document(str(submission_id))
    if not doc_ref.get().exists:
        return None
    if fields:
        # None values are stored as null, mirroring SQL NULLs.
        doc_ref.update(fields)
    return get_submission_by_id(submission_id)


def delete_submission_row(submission_id: Any) -> dict | None:
    row = get_submission_by_id(submission_id)
    if row is None:
        return None
    firestore_client().collection(SUBMISSIONS_COLLECTION).document(str(submission_id)).delete()
    return row


def get_all_upload_paths() -> set[str]:
    paths: set[str] = set()
    for row in all_submission_rows():
        for value in (row.get("review_screenshot_path"), row.get("upi_qr_path")):
            if value:
                paths.add(value)
    return paths


def find_recent_duplicate(customer_name: str, order_last4: str, since_iso: str) -> dict | None:
    best: dict | None = None
    for row in all_submission_rows():
        if (row.get("customer_name") or "").strip().lower() != customer_name.strip().lower():
            continue
        if row.get("order_last4") != order_last4:
            continue
        if (row.get("created_at") or "") < since_iso:
            continue
        if best is None or (row.get("created_at") or "") > (best.get("created_at") or ""):
            best = row
    return best
