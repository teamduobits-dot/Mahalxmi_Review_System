"""Local-mode (SQLite) smoke test for the cloud-migration refactor."""
import io
import json
import os
import struct
import sys
import zlib

import requests

BASE = "http://127.0.0.1:8000"
ADMIN_EMAIL = "team.duobits@gmail.com"
ADMIN_PASSWORD = "aditya9922"

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
    """Tiny valid 8x8 PNG."""
    def chunk(tag, data):
        raw = tag + data
        return struct.pack(">I", len(data)) + raw + struct.pack(">I", zlib.crc32(raw))

    ihdr = struct.pack(">IIBBBBB", 8, 8, 8, 2, 0, 0, 0)
    row = b"\x00" + bytes(color) * 8
    idat = zlib.compress(row * 8)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


s = requests.Session()

# 1 — health + settings
r = s.get(f"{BASE}/api/health")
check("health", r.status_code == 200 and r.json() == {"ok": True}, r.text)
r = s.get(f"{BASE}/api/settings")
settings = r.json()
check("settings 200", r.status_code == 200)
check("settings no adminEmail", "adminEmail" not in settings)
check("settings fields", settings.get("businessName") == "Mahalaxmi Multi Cuisine" and settings.get("cashbackAmount") == 15)

# 2 — login
r = s.post(f"{BASE}/api/auth/login", data={"email": ADMIN_EMAIL, "password": "wrongpass"})
check("login bad password -> generic 401", r.status_code == 401 and r.json()["detail"] == "Invalid email or password.")
r = s.post(f"{BASE}/api/auth/login", data={"email": "nobody@nowhere.com", "password": "x"})
check("login unknown email -> same generic 401", r.status_code == 401 and r.json()["detail"] == "Invalid email or password.")
r = s.post(f"{BASE}/api/auth/login", data={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
check("login ok", r.status_code == 200 and r.json().get("token"), r.text)
token = r.json()["token"]
headers = {"Authorization": f"Bearer {token}"}

# 3 — submissions (UPI)
png = make_png()
r = s.post(
    f"{BASE}/api/submissions",
    data={"customerName": "Aditya Test", "orderLast4": "4821", "customerComment": "Great food!", "payoutMethod": "upi", "upiId": "aditya@upi"},
    files={"reviewScreenshot": ("review.png", io.BytesIO(png), "image/png")},
)
check("submit upi 200", r.status_code == 200, r.text)
ref1 = r.json().get("reference", "")
check("reference format", ref1.startswith("MMC-") and len(ref1.split("-")) == 3, ref1)

r = s.post(
    f"{BASE}/api/submissions",
    data={"customerName": "Aditya Test", "orderLast4": "4821", "payoutMethod": "upi", "upiId": "aditya@upi"},
    files={"reviewScreenshot": ("review.png", io.BytesIO(png), "image/png")},
)
ref2 = r.json().get("reference", "")
check("second submit 200", r.status_code == 200, r.text)

# QR submission
r = s.post(
    f"{BASE}/api/submissions",
    data={"customerName": "Rahul QR", "orderLast4": "9284", "payoutMethod": "qr"},
    files={
        "reviewScreenshot": ("review.png", io.BytesIO(png), "image/png"),
        "upiQr": ("qr.png", io.BytesIO(make_png((30, 30, 200))), "image/png"),
    },
)
check("submit qr 200", r.status_code == 200, r.text)
ref3 = r.json().get("reference", "")

# validation: no orphan files on invalid submissions
before = set(os.listdir("backend/uploads"))
r = s.post(
    f"{BASE}/api/submissions",
    data={"customerName": "X", "orderLast4": "4821", "payoutMethod": "upi", "upiId": "nope"},
    files={"reviewScreenshot": ("review.png", io.BytesIO(png), "image/png")},
)
check("invalid upi rejected", r.status_code == 400)
r = s.post(
    f"{BASE}/api/submissions",
    data={"customerName": "Valid Name", "orderLast4": "1234", "payoutMethod": "upi", "upiId": "ok@upi"},
    files={"reviewScreenshot": ("evil.html", io.BytesIO(b"<html>hi</html>"), "text/html")},
)
check("non-image rejected", r.status_code == 400)
after = set(os.listdir("backend/uploads"))
check("no orphans from invalid submits", before == after, str(after - before))

# oversize rejected
big = make_png() + b"\x00" * (6 * 1024 * 1024)
r = s.post(
    f"{BASE}/api/submissions",
    data={"customerName": "Big File", "orderLast4": "7777", "payoutMethod": "upi", "upiId": "big@upi"},
    files={"reviewScreenshot": ("big.png", io.BytesIO(big), "image/png")},
)
check("6MB image rejected (5MB cap)", r.status_code == 400 and "5 MB" in r.json()["detail"], r.text[:200])

# 4 — public status (privacy-safe)
r = s.get(f"{BASE}/api/submissions/status/{ref1.lower()}")
check("status lookup case-insensitive", r.status_code == 200, r.text)
body = r.json()
check("status privacy fields", set(body) == {"reference", "status", "createdAt", "updatedAt", "approvedAt", "paidAt"}, str(set(body)))
check("status 404", s.get(f"{BASE}/api/submissions/status/MMC-1999-999999").status_code == 404)

# 5 — admin data endpoints
r = s.get(f"{BASE}/api/admin/dashboard", headers=headers)
check("dashboard auth ok", r.status_code == 200)
dash = r.json()
check("dashboard counts", dash["stats"]["total"] == 3 and dash["stats"]["pending"] == 3, str(dash["stats"]))
items = {item["reference"]: item for item in dash["submissions"]}

dup_item = items.get(ref2, {})
check("duplicate flag set on 2nd same-name+last4", dup_item.get("flaggedDuplicate") is True and dup_item.get("duplicateOf") == ref1, json.dumps(dup_item)[:300])
check("first submission not flagged", items.get(ref1, {}).get("flaggedDuplicate") is False)

r = requests.get(f"{BASE}/api/admin/dashboard")
check("dashboard requires auth", r.status_code == 401)

sub1 = items[ref1]
r = s.get(f"{BASE}/api/admin/submissions/{sub1['id']}", headers=headers)
check("get submission by id", r.status_code == 200 and r.json()["customerName"] == "Aditya Test")
check("serialized fields", r.json()["reviewScreenshotUrl"].startswith("/uploads/") and r.json()["payoutMethod"] == "upi")

# search + filter
r = s.get(f"{BASE}/api/admin/submissions?search=rahul", headers=headers)
check("search works", r.status_code == 200 and len(r.json()) == 1 and r.json()[0]["reference"] == ref3, r.text[:300])
r = s.get(f"{BASE}/api/admin/submissions?status=pending", headers=headers)
check("status filter works", r.status_code == 200 and len(r.json()) == 3)

# 6 — PATCH status + notes
r = s.patch(f"{BASE}/api/admin/submissions/{sub1['id']}", headers=headers, json={"status": "approved"})
check("patch approve", r.status_code == 200 and r.json()["status"] == "approved" and r.json()["approvedAt"], r.text[:300])
r = s.patch(f"{BASE}/api/admin/submissions/{sub1['id']}", headers=headers, json={"adminNotes": "verified screenshot"})
body = r.json()
check("patch notes keeps status", body["status"] == "approved" and body["adminNotes"] == "verified screenshot")
r = s.patch(f"{BASE}/api/admin/submissions/{sub1['id']}", headers=headers, json={"status": "bogus"})
check("patch invalid status rejected", r.status_code == 400)

# 7 — image streaming endpoint
img_url = sub1["reviewScreenshotUrl"]
r = s.get(f"{BASE}/api/admin/submissions/{sub1['id']}/files/review", headers=headers)
check("files/review streams image", r.status_code == 200 and r.headers["content-type"] == "image/png" and r.content == png, r.headers.get("content-type", ""))
check("files endpoint requires auth", requests.get(f"{BASE}/api/admin/submissions/{sub1['id']}/files/review").status_code == 401)
check("files unknown kind 404", s.get(f"{BASE}/api/admin/submissions/{sub1['id']}/files/nonsense", headers=headers).status_code == 404)
# cookie channel works too (img tags rely on it)
r = requests.get(f"{BASE}/api/admin/submissions/{sub1['id']}/files/review", cookies={"mm_admin_token": token})
check("files via cookie channel", r.status_code == 200)

# 8 — storage stats + cleanup
r = s.get(f"{BASE}/api/admin/storage", headers=headers)
st = r.json()
check("storage stats", r.status_code == 200 and st["totalFiles"] == 4 and st["reviewFiles"] == 3 and st["qrFiles"] == 1, json.dumps(st))
# create an orphan, then clean it
orphan = "backend/uploads/orphan-deadbeef.png"
with open(orphan, "wb") as f:
    f.write(png)
r = s.get(f"{BASE}/api/admin/storage", headers=headers)
check("orphan counted", r.json()["orphanFiles"] == 1)
r = s.post(f"{BASE}/api/admin/storage/cleanup", headers=headers)
check("cleanup removes orphan", r.status_code == 200 and r.json()["removedFiles"] == 1 and not os.path.exists(orphan), r.text[:300])

# 9 — settings update
r = s.put(f"{BASE}/api/admin/settings", headers=headers, json={"businessName": "Mahalaxmi Multi Cuisine", "cashbackAmount": 20, "campaignActive": True, "pauseMessage": "p", "successNote": "s", "storageQuotaMb": 2048})
check("settings update", r.status_code == 200 and r.json()["cashbackAmount"] == 20 and r.json()["storageQuotaMb"] == 2048, r.text[:300])
check("public settings reflect change", s.get(f"{BASE}/api/settings").json()["cashbackAmount"] == 20)

# 10 — delete submission (frees files)
qr_item = items[ref3]
qr_files = [qr_item["reviewScreenshotUrl"], qr_item["upiQrUrl"]]
check("qr files exist pre-delete", all(os.path.exists("backend" + p) for p in qr_files))
r = s.delete(f"{BASE}/api/admin/submissions/{qr_item['id']}", headers=headers)
check("delete ok", r.status_code == 200 and r.json()["ok"] is True, r.text[:200])
check("qr files removed", not any(os.path.exists("backend" + p) for p in qr_files))
check("deleted submission 404", s.get(f"{BASE}/api/admin/submissions/{qr_item['id']}", headers=headers).status_code == 404)

# 11 — password change revocation + restore
r = s.post(f"{BASE}/api/auth/change-password", headers=headers, data={"currentPassword": ADMIN_PASSWORD, "newPassword": "temppass-12345"})
check("change password ok", r.status_code == 200 and r.json().get("token"), r.text[:300])
new_token = r.json()["token"]
check("old token revoked", s.get(f"{BASE}/api/admin/dashboard", headers=headers).status_code == 401)
check("new token works", s.get(f"{BASE}/api/admin/dashboard", headers={"Authorization": f"Bearer {new_token}"}).status_code == 200)
r = s.post(f"{BASE}/api/auth/change-password", headers={"Authorization": f"Bearer {new_token}"}, data={"currentPassword": "temppass-12345", "newPassword": ADMIN_PASSWORD})
check("password restored", r.status_code == 200)

# 12 — me/logout
r = s.get(f"{BASE}/api/auth/me", headers=headers)
check("me reports auth state", r.status_code == 200 and "authenticated" in r.json())

print()
print(f"RESULT: {len(PASSED)} passed, {len(FAILED)} failed")
sys.exit(1 if FAILED else 0)
