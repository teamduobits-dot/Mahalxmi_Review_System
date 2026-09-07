# 🍔 Mahalaxmi Multi Cuisine — Customer Feedback & Cashback System

Premium, mobile-first customer feedback + ₹15 cashback website for Mahalaxmi
Multi Cuisine, with a protected admin portal for verification, duplicate
detection and cashback tracking.

The application lives in [`my-react-app/`](./my-react-app) — see its
[README](./my-react-app/README.md) for the full guide (demo mode, Firebase
setup, security rules, data model).

## Quick start

```bash
cd my-react-app
npm install
npm run dev          # customer flow → http://localhost:5173/
                     # admin portal  → http://localhost:5173/#/admin-portal-private
```

**Demo admin login:** `admin@demo.mahalaxmi.in` / `mahalaxmi123`

> No Firebase setup needed — without a `.env` config the app runs in a fully
> functional local demo mode. Add your Firebase keys to `.env` for production.

## Highlights

- 🟢→🟡→🔵→🟣→🟢 Five-frame customer journey: welcome → quick feedback →
  review suggestion + screenshot proof → verification + cashback → success
- ✍️ Honest review generator — suggestions always mirror the customer's actual
  answers (positive, balanced, or constructive)
- 💾 Progress persistence — customers can leave to rate in Swiggy/Toing and
  continue exactly where they left off
- 🚨 Fraud prevention — mandatory screenshot, Order ID *or* name, duplicate
  flags (reused screenshot / order ID / UPI / name)
- 👑 Protected admin portal — hidden + configurable route, Firebase Auth +
  whitelist + security rules, dashboard, submission workflow
  (Pending → Under Review → Approved/Rejected → Paid), analytics and campaign
  settings
- 🔥 Firebase-first — Firestore, Storage, Auth, Hosting with complete
  `firestore.rules` / `storage.rules`; zero backend servers needed
