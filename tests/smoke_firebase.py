"""Firebase-mode smoke test using in-memory fakes for Firestore + Storage.

Boots the real FastAPI app with BACKEND_MODE=firebase against a fake
Firestore client and a fake Storage bucket, then exercises every route the
same way smoke_local.py does. This validates the Firestore repository logic
(reference counter, duplicate flagging, normalization, CRUD, orphan cleanup,
private image streaming) without needing GCP credentials or the emulator.
"""
import io
import json
import os
import struct
import sys
import zlib

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

os.environ["BACKEND_MODE"] = "firebase"
os.environ["IMAGE_STORAGE"] = "firebase"  # This suite specifically tests legacy Firebase Storage.
os.environ.pop("APP_ENV", None)  # dev defaults allowed

# Stub google's transactional decorator before the app imports it: the fake
# transaction is a plain object, and the decorator's retry protocol is the
# only thing we are not testing here.
import firebase_admin.firestore as fa_firestore

fa_firestore.transactional = lambda func: func

import firebase_service
from fake_firebase import FakeBucket, FakeFirestoreClient

FAKE_CLIENT = FakeFirestoreClient()
FAKE_BUCKET = FakeBucket()

firebase_service.ensure_firebase = lambda: None
firebase_service.IS_FIREBASE_MODE = True

import firestore_service
import storage_service

firestore_service.firestore_client = lambda: FAKE_CLIENT
storage_service.storage_bucket = lambda: FAKE_BUCKET

from fastapi.testclient import TestClient
import main as backend_main

PASSED = []
FAILED = []


def check(name, condition, detail=""):
    if condition:
        PASSED.append(name)
        print(f"  PASS  {name}")
    else:
        FAILED.append(name)
        print(f"  FAIL  {name}  {detail}")


def make_png(color=(200, 30, 30)):
    def chunk(tag, data):
        raw = tag + data
        return struct.pack(">I", len(data)) + raw + struct.pack(">I", zlib.crc32(raw))

    ihdr = struct.pack(">IIBBBBB", 8, 8, 8, 2, 0, 0, 0)
    row = b"\x00" + bytes(color) * 8
    idat = zlib.compress(row * 8)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


ADMIN_EMAIL = "team.duobits@gmail.com"
ADMIN_PASSWORD = "aditya9922"

with TestClient(backend_main.app) as client:
    # --- seeding ---
    check("firestore settings doc seeded", "settings/public" in FAKE_CLIENT.store)
    check("firestore admin doc seeded", f"admins/{ADMIN_EMAIL}" in FAKE_CLIENT.store)
    check("firestore counters doc seeded", FAKE_CLIENT.store.get("meta/counters", {}).get("submission_seq") == 0)

    # --- public settings ---
    r = client.get("/api/settings")
    check("settings 200 + no adminEmail", r.status_code == 200 and "adminEmail" not in r.json())

    # --- login ---
    r = client.post("/api/auth/login", data={"email": ADMIN_EMAIL, "password": "nope"})
    check("login bad -> generic 401", r.status_code == 401 and r.json()["detail"] == "Invalid email or password.")
    r = client.post("/api/auth/login", data={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    check("login ok", r.status_code == 200 and r.json().get("token"), r.text)
    token = r.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    png = make_png()

    # --- submission #1 (UPI) ---
    r = client.post(
        "/api/submissions",
        data={"customerName": "Aditya Test", "orderLast4": "4821", "customerComment": "Great!", "payoutMethod": "upi", "upiId": "aditya@upi"},
        files={"reviewScreenshot": ("review.png", io.BytesIO(png), "image/png")},
    )
    check("submit upi 200", r.status_code == 200, r.text)
    ref1 = r.json()["reference"]
    check("reference counter starts at 1", ref1.endswith("-000001"), ref1)

    doc_ids = [key for key in FAKE_CLIENT.store if key.startswith("submissions/")]
    check("firestore submission doc created", len(doc_ids) == 1, str(doc_ids))
    sub_doc = FAKE_CLIENT.store[doc_ids[0]]
    check("doc stores paths under submissions/{uuid}/", sub_doc["review_screenshot_path"].startswith("submissions/") and sub_doc["review_screenshot_path"].endswith("/review.png"), sub_doc["review_screenshot_path"])
    check("storage object uploaded", sub_doc["review_screenshot_path"] in FAKE_BUCKET.objects and FAKE_BUCKET.objects[sub_doc["review_screenshot_path"]] == png)
    check("uuid doc id (no customer data in id)", len(doc_ids[0].split("/", 1)[1]) == 32)

    # --- submission #2 (duplicate of #1) ---
    r = client.post(
        "/api/submissions",
        data={"customerName": "Aditya Test", "orderLast4": "4821", "payoutMethod": "upi", "upiId": "aditya@upi"},
        files={"reviewScreenshot": ("review.png", io.BytesIO(png), "image/png")},
    )
    ref2 = r.json()["reference"]
    check("reference increments", ref2.endswith("-000002"), ref2)

    # --- submission #3 (QR) ---
    r = client.post(
        "/api/submissions",
        data={"customerName": "Rahul QR", "orderLast4": "9284", "payoutMethod": "qr"},
        files={
            "reviewScreenshot": ("review.png", io.BytesIO(png), "image/png"),
            "upiQr": ("qr.png", io.BytesIO(make_png((30, 30, 200))), "image/png"),
        },
    )
    check("submit qr 200", r.status_code == 200, r.text)
    ref3 = r.json()["reference"]
    qr_doc_ids = [key for key in FAKE_CLIENT.store if key.startswith("submissions/") and FAKE_CLIENT.store[key].get("upi_qr_path")]
    check("qr object stored as upi-qr.png", len(qr_doc_ids) == 1 and FAKE_CLIENT.store[qr_doc_ids[0]]["upi_qr_path"].endswith("/upi-qr.png"), str(qr_doc_ids))

    # invalid submits create nothing
    n_docs = len([k for k in FAKE_CLIENT.store if k.startswith("submissions/")])
    n_objects = len(FAKE_BUCKET.objects)
    r = client.post(
        "/api/submissions",
        data={"customerName": "Valid Person", "orderLast4": "1234", "payoutMethod": "upi", "upiId": "ok@upi"},
        files={"reviewScreenshot": ("evil.html", io.BytesIO(b"<html/>"), "text/html")},
    )
    check("non-image rejected", r.status_code == 400)
    check("no orphans after invalid submit (firestore)", len([k for k in FAKE_CLIENT.store if k.startswith("submissions/")]) == n_docs and len(FAKE_BUCKET.objects) == n_objects)

    # --- public status ---
    r = client.get(f"/api/submissions/status/{ref1.lower()}")
    body = r.json()
    check("public status privacy-safe", r.status_code == 200 and set(body) == {"reference", "status", "createdAt", "updatedAt", "approvedAt", "paidAt"}, str(set(body)))

    # --- admin ---
    r = client.get("/api/admin/dashboard", headers=headers)
    check("dashboard auth ok", r.status_code == 200)
    dash = r.json()
    check("dashboard counts", dash["stats"]["total"] == 3 and dash["stats"]["pending"] == 3, str(dash["stats"]))
    items = {item["reference"]: item for item in dash["submissions"]}
    check("duplicate flagged (firestore)", items[ref2]["flaggedDuplicate"] is True and items[ref2]["duplicateOf"] == ref1)
    check(
        "image URLs point at authenticated streaming endpoint",
        items[ref1]["reviewScreenshotUrl"] == f"/api/admin/submissions/{items[ref1]['id']}/files/review"
        and items[ref3]["upiQrUrl"] == f"/api/admin/submissions/{items[ref3]['id']}/files/upi-qr",
        str(items[ref1]["reviewScreenshotUrl"]),
    )
    check("order newest-first", [i["reference"] for i in dash["submissions"]] == [ref3, ref2, ref1], str([i["reference"] for i in dash["submissions"]]))

    anon = TestClient(backend_main.app)  # fresh client: no cookies, no headers
    check("dashboard requires auth", anon.get("/api/admin/dashboard").status_code == 401)

    r = client.get(f"/api/admin/submissions?search=rahul", headers=headers)
    check("search works (in-memory)", r.status_code == 200 and len(r.json()) == 1 and r.json()[0]["reference"] == ref3, r.text[:200])

    # PATCH
    sub1 = items[ref1]
    r = client.patch(f"/api/admin/submissions/{sub1['id']}", headers=headers, json={"status": "approved"})
    check("patch approve (firestore)", r.status_code == 200 and r.json()["status"] == "approved" and r.json()["approvedAt"], r.text[:200])
    r = client.patch(f"/api/admin/submissions/{sub1['id']}", headers=headers, json={"adminNotes": "ok"})
    check("patch notes keeps status", r.json()["status"] == "approved" and r.json()["adminNotes"] == "ok")

    # private image streaming from fake bucket
    r = client.get(f"/api/admin/submissions/{sub1['id']}/files/review", headers=headers)
    check("files/review streams from bucket", r.status_code == 200 and r.content == png and r.headers["content-type"] == "image/png")
    check("files requires auth", anon.get(f"/api/admin/submissions/{sub1['id']}/files/review").status_code == 401)

    # storage stats + orphan cleanup
    FAKE_BUCKET.objects["submissions/deadbeef/review.png"] = png  # orphan
    r = client.get("/api/admin/storage", headers=headers)
    st = r.json()
    check("storage stats (bucket)", st["totalFiles"] == 5 and st["reviewFiles"] == 3 and st["qrFiles"] == 1 and st["orphanFiles"] == 1, json.dumps(st))
    r = client.post("/api/admin/storage/cleanup", headers=headers)
    check("cleanup removes orphan object", r.json()["removedFiles"] == 1 and "submissions/deadbeef/review.png" not in FAKE_BUCKET.objects, r.text[:200])

    # settings update
    r = client.put("/api/admin/settings", headers=headers, json={"businessName": "Mahalaxmi Multi Cuisine", "cashbackAmount": 20, "campaignActive": False, "pauseMessage": "paused!", "successNote": "s", "storageQuotaMb": 2048})
    check("settings update (firestore)", r.status_code == 200 and r.json()["cashbackAmount"] == 20 and r.json()["storageQuotaMb"] == 2048, r.text[:200])
    check("campaign pause enforced", client.post(
        "/api/submissions",
        data={"customerName": "Blocked Person", "orderLast4": "5555", "payoutMethod": "upi", "upiId": "b@upi"},
        files={"reviewScreenshot": ("review.png", io.BytesIO(png), "image/png")},
    ).status_code == 400)
    client.put("/api/admin/settings", headers=headers, json={"businessName": "Mahalaxmi Multi Cuisine", "cashbackAmount": 20, "campaignActive": True, "pauseMessage": "p", "successNote": "s", "storageQuotaMb": 2048})

    # delete frees doc + objects
    item3 = items[ref3]
    paths3 = [FAKE_CLIENT.store[f"submissions/{item3['id']}"]["review_screenshot_path"], FAKE_CLIENT.store[f"submissions/{item3['id']}"]["upi_qr_path"]]
    r = client.delete(f"/api/admin/submissions/{item3['id']}", headers=headers)
    check("delete ok (firestore)", r.status_code == 200 and r.json()["ok"] is True, r.text[:200])
    check("doc + objects deleted", f"submissions/{item3['id']}" not in FAKE_CLIENT.store and all(p not in FAKE_BUCKET.objects for p in paths3))
    check("deleted submission 404", client.get(f"/api/admin/submissions/{item3['id']}", headers=headers).status_code == 404)

    # password change revocation
    r = client.post("/api/auth/change-password", headers=headers, data={"currentPassword": ADMIN_PASSWORD, "newPassword": "temppass-12345"})
    check("change password (firestore)", r.status_code == 200 and r.json().get("token"), r.text[:200])
    new_token = r.json()["token"]
    check("old token revoked", client.get("/api/admin/dashboard", headers=headers).status_code == 401)
    check("new token works", client.get("/api/admin/dashboard", headers={"Authorization": f"Bearer {new_token}"}).status_code == 200)
    check("admin doc token_version bumped", FAKE_CLIENT.store[f"admins/{ADMIN_EMAIL}"]["token_version"] == 2)

print()
print(f"RESULT: {len(PASSED)} passed, {len(FAILED)} failed")
sys.exit(1 if FAILED else 0)
