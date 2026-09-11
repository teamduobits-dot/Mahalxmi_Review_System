"""Firebase initialization + backend mode detection.

Two backend modes:

* ``local``    — SQLite + local ``backend/uploads/`` (zero-config development).
* ``firebase`` — Cloud Firestore + Firebase Storage (Cloud Run production).

The mode is chosen by the ``BACKEND_MODE`` environment variable. When it is
not set, the app auto-detects: on Cloud Run (``K_SERVICE`` is present) it
defaults to ``firebase``; anywhere else it defaults to ``local``. Local
development therefore keeps working with no configuration at all.

In firebase mode the app authenticates with Google Application Default
Credentials:

* Cloud Run: the service account attached to the service (nothing to do).
* Local dev: ``GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json``.

All Firebase SDK imports happen inside functions, so local mode runs even if
``firebase-admin`` is not installed.
"""
from __future__ import annotations

import os
import threading


def detect_backend_mode() -> str:
    mode = os.getenv("BACKEND_MODE", "").strip().lower()
    if mode in {"firebase", "firestore", "cloud"}:
        return "firebase"
    if mode in {"local", "sqlite"}:
        return "local"
    # K_SERVICE is set automatically on every Cloud Run instance.
    return "firebase" if os.getenv("K_SERVICE", "").strip() else "local"


BACKEND_MODE = detect_backend_mode()
IS_FIREBASE_MODE = BACKEND_MODE == "firebase"

_lock = threading.Lock()
_initialized = False


def ensure_firebase() -> None:
    """Initialize the Firebase Admin SDK exactly once (firebase mode only).

    Uses Application Default Credentials so the same code runs on Cloud Run
    and on a developer machine with a service-account JSON file.
    """
    global _initialized
    if not IS_FIREBASE_MODE or _initialized:
        return
    with _lock:
        if _initialized:
            return
        try:
            import firebase_admin
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "BACKEND_MODE=firebase requires the firebase-admin package. "
                "Install it with: pip install firebase-admin"
            ) from exc

        # Render has no Application Default Credentials, so production there
        # supplies the service-account JSON via an env var instead of a file.
        # Never commit this value — set it in the Render dashboard as a
        # secret env var only.
        service_account_json = os.getenv("FIREBASE_CREDENTIALS_JSON", "").strip()
        if not firebase_admin._apps:
            options: dict[str, str] = {}
            project_id = (os.getenv("FIREBASE_PROJECT_ID") or os.getenv("GOOGLE_CLOUD_PROJECT") or "").strip()
            if project_id:
                options["projectId"] = project_id
            bucket = (os.getenv("FIREBASE_STORAGE_BUCKET") or "").strip()
            if bucket:
                options["storageBucket"] = bucket
            credentials = None
            if service_account_json:
                try:
                    import json

                    from firebase_admin import credentials as admin_credentials

                    credentials = admin_credentials.Certificate(json.loads(service_account_json))
                except Exception as exc:
                    raise RuntimeError(
                        "FIREBASE_CREDENTIALS_JSON is set but is not valid service-account "
                        f"JSON. Paste the full JSON file contents. Underlying error: {exc}"
                    ) from exc
            try:
                firebase_admin.initialize_app(credentials, options=options or None)
            except Exception as exc:
                raise RuntimeError(_ADC_HELP + f" Underlying error: {exc}") from exc

        # Fail fast on missing credentials: initialize_app() defers credential
        # lookup, so without this probe the first request would crash deep in
        # the SDK with an unhelpful DefaultCredentialsError. Skipped when an
        # explicit service-account JSON was provided (Render has no ADC).
        if service_account_json:
            _initialized = True
            return
        try:
            import google.auth

            google.auth.default()
        except Exception as exc:
            raise RuntimeError(_ADC_HELP + f" Underlying error: {exc}") from exc
        _initialized = True


_ADC_HELP = (
    "Could not initialize Firebase. In BACKEND_MODE=firebase the backend needs "
    "Application Default Credentials: on Cloud Run attach a service account with "
    "Firestore/Storage access; locally, set GOOGLE_APPLICATION_CREDENTIALS to a "
    "service-account JSON file (or run `gcloud auth application-default login`)."
)


def firestore_client():
    """Return a Cloud Firestore client (firebase mode only)."""
    ensure_firebase()
    from firebase_admin import firestore

    return firestore.client()


def storage_bucket():
    """Return the Firebase Storage bucket (firebase mode only)."""
    ensure_firebase()
    from firebase_admin import storage

    try:
        return storage.bucket()
    except Exception as exc:
        raise RuntimeError(
            "No Firebase Storage bucket configured. Either enable Storage in the "
            "Firebase console (default bucket) or set FIREBASE_STORAGE_BUCKET to "
            f"your bucket name (e.g. your-project.appspot.com). Underlying error: {exc}"
        ) from exc
