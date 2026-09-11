"""Unified image storage: local disk (dev) or Firebase Storage (production).

Local mode keeps the existing flat ``backend/uploads/`` layout. Firebase mode
stores objects under a per-submission folder with a UUID path, as required:

    submissions/{uuid}/review.jpg
    submissions/{uuid}/upi-qr.png

The bucket stays private (see storage.rules); images are never exposed via
public URLs. The admin panel streams them through an authenticated backend
endpoint instead (see ``main.py``: GET /api/admin/submissions/{id}/files/...).

File names never contain customer data — only UUIDs and fixed prefixes.
"""
from __future__ import annotations

import logging
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException

from database import UPLOADS_DIR
from firebase_service import IS_FIREBASE_MODE, storage_bucket

logger = logging.getLogger("mahalaxmi")

# Plan target: screenshots are compressed client-side to ~300 KB–1 MB, so the
# hard server-side cap can be tight. Anything bigger is rejected.
MAX_IMAGE_BYTES = 5 * 1024 * 1024

CONTENT_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"}


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


def validate_image_bytes(content: bytes) -> str:
    """Validate size + type; return the extension. Raises 400 on failure."""
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image must be under 5 MB.")
    extension = detect_image_extension(content)
    if not extension:
        raise HTTPException(status_code=400, detail="Only PNG, JPEG or WebP images are accepted.")
    return extension


def _firebase_object_name(submission_key: str, kind: str, extension: str) -> str:
    file_stem = "upi-qr" if kind == "upiqr" else "review"
    return f"submissions/{submission_key}/{file_stem}{extension}"


def save_image(content: bytes, kind: str, submission_key: str) -> str:
    """Validate and store an image; return the path recorded in the database.

    ``kind`` is ``review`` or ``upiqr``. The returned value is exactly what
    ``read_file`` / ``delete_file`` expect in the current mode:

    * local:    ``/uploads/review-<uuid>.jpg``
    * firebase: ``submissions/<uuid>/review.jpg``
    """
    extension = validate_image_bytes(content)

    if IS_FIREBASE_MODE:
        object_name = _firebase_object_name(submission_key, kind, extension)
        blob = storage_bucket().blob(object_name)
        blob.upload_from_string(content, content_type=CONTENT_TYPES[extension])
        return object_name

    name = f"{kind}-{uuid4().hex}{extension}"
    (UPLOADS_DIR / name).write_bytes(content)
    return f"/uploads/{name}"


def read_file(path: str | None) -> bytes | None:
    """Return the stored image bytes, or None when the object no longer exists."""
    if not path:
        return None
    if IS_FIREBASE_MODE:
        blob = storage_bucket().blob(path)
        if not blob.exists():
            return None
        return blob.download_as_bytes()
    target = _local_path(path)
    if target is None or not target.is_file():
        return None
    return target.read_bytes()


def delete_file(path: str | None) -> None:
    if not path:
        return
    if IS_FIREBASE_MODE:
        try:
            storage_bucket().delete_blob(path)
        except Exception as exc:  # NotFound and friends — deleting is best-effort
            logger.warning("Could not delete storage object %s: %s", path, exc)
        return
    target = _local_path(path)
    if target and target.is_file():
        try:
            target.unlink()
        except OSError:
            logger.warning("Could not delete upload file %s", target)


def all_files() -> list[tuple[str, int]]:
    """Every stored image as ``(path, size_in_bytes)`` pairs for the current mode."""
    if IS_FIREBASE_MODE:
        bucket = storage_bucket()
        return [(blob.name, blob.size or 0) for blob in bucket.list_blobs(prefix="submissions/")]
    if not UPLOADS_DIR.exists():
        return []
    return [
        (f"/uploads/{path.name}", path.stat().st_size)
        for path in UPLOADS_DIR.iterdir()
        if path.is_file()
    ]


def _local_path(url_path: str | None) -> Path | None:
    """Resolve a stored ``/uploads/<name>`` path safely inside UPLOADS_DIR."""
    if not url_path:
        return None
    name = url_path.rsplit("/", 1)[-1]
    if not name or name in {".", ".."} or name.startswith(".") or "/" in name or "\\" in name:
        return None
    target = (UPLOADS_DIR / name).resolve()
    try:
        target.relative_to(UPLOADS_DIR.resolve())
    except ValueError:
        return None
    return target
