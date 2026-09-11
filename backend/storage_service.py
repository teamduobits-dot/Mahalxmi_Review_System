"""Cloudinary for new images; legacy local/Firebase paths remain readable.

IMAGE_STORAGE selects new writes independently of BACKEND_MODE (the database).
Cloudinary URLs are stored verbatim in existing text columns. Cloudinary deletion
is deliberately disabled: no public IDs are inferred and no remote cleanup runs.
"""
from __future__ import annotations

import io
import logging
import os
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

import cloudinary
import cloudinary.uploader

from fastapi import HTTPException

from database import UPLOADS_DIR
from firebase_service import IS_FIREBASE_MODE, storage_bucket

logger = logging.getLogger("mahalaxmi")

# Defaults to Cloudinary; explicit local/firebase modes are retained for offline
# development and existing deployments. Never silently fall back on upload errors.
IMAGE_STORAGE = os.getenv("IMAGE_STORAGE", "cloudinary").strip().lower()
if IMAGE_STORAGE not in {"cloudinary", "local", "firebase"}:
    raise RuntimeError("IMAGE_STORAGE must be cloudinary, local, or firebase.")


def configure_cloudinary() -> bool:
    if IMAGE_STORAGE != "cloudinary":
        return False
    values = [os.getenv(key, "").strip() for key in (
        "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"
    )]
    if not all(values) or any(value.startswith("PUT_YOUR_") for value in values):
        logger.warning(
            "Cloudinary is not fully configured. Set CLOUDINARY_CLOUD_NAME, "
            "CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET privately in backend/.env."
        )
        return False
    cloudinary.config(cloud_name=values[0], api_key=values[1],
                      api_secret=values[2], secure=True)
    return True


def is_cloudinary_url(path: str | None) -> bool:
    if not path:
        return False
    parsed = urlparse(path)
    return parsed.scheme == "https" and parsed.netloc == "res.cloudinary.com"


def _upload_cloudinary(content: bytes, kind: str) -> str:
    if not configure_cloudinary():
        raise HTTPException(status_code=503, detail="Image storage is not configured correctly.")
    try:
        result = cloudinary.uploader.upload(
            io.BytesIO(content),
            folder="mahalaxmi-review-system",
            public_id=f"{kind}-{uuid4().hex}",
            resource_type="image",
            overwrite=False,
            timeout=60,
        )
        url = result.get("secure_url")
        if not isinstance(url, str) or not is_cloudinary_url(url):
            raise ValueError("Missing secure Cloudinary URL")
        return url
    except Exception:
        # SDK exception text may contain request details. Never log credentials.
        logger.error("Cloudinary image upload failed; no local fallback was written.")
        raise HTTPException(status_code=502, detail="Unable to upload image. Please try again.") from None


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
    """Return a secure Cloudinary URL, or a legacy path in explicit test modes."""
    extension = validate_image_bytes(content)

    if IMAGE_STORAGE == "cloudinary":
        return _upload_cloudinary(content, kind)

    if IMAGE_STORAGE == "firebase":
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
    if is_cloudinary_url(path):
        return None  # Delivered directly; the admin file endpoint redirects safely.
    if not path.startswith("/uploads/") and IS_FIREBASE_MODE:
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
    if path.startswith(("https://", "http://")):
        logger.info("Remote image deletion is disabled; asset retained.")
        return
    if not path.startswith("/uploads/") and IS_FIREBASE_MODE:
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
    if IMAGE_STORAGE == "firebase":
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
    if not url_path or not url_path.startswith("/uploads/"):
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
