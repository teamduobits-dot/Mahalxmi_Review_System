# 🍔 Mahalaxmi Multi Cuisine — Feedback & ₹15 Cashback System

A premium, mobile-first customer feedback + cashback website. Customers scan a QR
code on their food order, answer four quick questions, get an honest review
suggestion, post their rating in Swiggy/Toing, upload a screenshot as proof, and
claim ₹15 cashback. A protected admin portal verifies submissions, flags
duplicates, and tracks the cashback workflow.

**Stack:** React 19 · Vite · Tailwind CSS v4 · Framer Motion · Firebase (Auth, Firestore, Storage, Hosting)

---

## ✨ Two modes

### 🟢 Demo mode (zero setup — the default)
If no Firebase config is present, the app runs entirely in the browser using
`localStorage`. The complete customer flow **and** the admin portal work
end-to-end, pre-seeded with realistic sample submissions.

- **Customer flow:** `http://localhost:5173/`
- **Admin portal:** `http://localhost:5173/#/admin-portal-private`
- **Demo admin login:** `admin@demo.mahalaxmi.in` / `mahalaxmi123`

Demo mode is for trying the product — it is **not** for production.

### 🔥 Firebase mode (production)
1. `cp .env.example .env` and fill in the values from **Firebase Console → Project settings**.
2. Enable **Email/Password** in *Authentication → Sign-in method*.
3. Create the admin whitelist doc (see below).
4. Deploy rules: `npx firebase deploy --only firestore:rules,storage:rules` (or paste `firestore.rules` / `storage.rules` in the console).
5. Deploy hosting: `npm run build && npx firebase deploy`.

**Making yourself admin** (one-time, console only):

```text
Firestore → Start collection:
  Collection ID: admins
  Document ID:   <your Firebase Auth UID>
  Fields:        active = true
```

The admin route is configurable via `VITE_ADMIN_ROUTE` (default
`/admin-portal-private`). The URL is **not** the security — Firebase
Authentication + the `admins` whitelist + security rules are.

---

## 📱 Customer journey

1. **Welcome** — animated greeting, 3-step explainer, 🚀 Start.
2. **Feedback task** — one question at a time (overall ⭐, taste 😋, packaging 📦,
   quantity 🍔), auto-advance, back button, optional improvement comment.
3. **Review suggestion + proof** — an *honest* comment generated from the actual
   answers (editable, copyable), clear steps for rating in the food app, and the
   screenshot upload. Progress is persisted locally, so leaving the site to rate
   and coming back continues exactly where the customer left off.
4. **Verification + cashback** — Order ID *or* order name toggle, UPI ID *or* UPI
   QR upload, confirmation checkbox, food-themed submit animation.
5. **Success** — confetti, reference ID (e.g. `MMC-2026-001234`) with copy
   button, "Under Verification" status.

## 👑 Admin portal

- **Dashboard** — totals, pending/approved/rejected/paid, cashback amounts,
  rating averages, recent submissions table, search + status filters.
- **Submission detail** — full feedback, review proof (lightbox), order
  verification, cashback details, duplicate flags, private admin notes, and the
  status workflow: `Pending → Under Review → Approved/Rejected → Paid`.
- **Analytics** — average ratings, rating distribution, daily submissions,
  rating trend, and the latest improvement comments.
- **Settings** — cashback amount, campaign active/paused, welcome title,
  processing-time note. Campaign settings live in Firestore
  (`settings/campaign`) and are configurable at runtime.

## 🔐 Fraud prevention (v1)

- Review screenshot is mandatory.
- Order ID **or** order name required (never both).
- Duplicate detection flags: reused screenshot (8×8 grayscale image hash),
  duplicate order ID, duplicate UPI ID, same order name within 72 h.
- Duplicates are **flagged for admin review, never auto-rejected**.
- Customers can only create submissions — they can never read or list them
  (enforced by Firestore rules). Images are write-only for customers.

## 🗄️ Data model

```
feedbackSubmissions/{submissionId}
  submissionId, campaignId, reference, createdAtMillis, updatedAtMillis
  ratings: { overall, taste, packaging, quantity }
  improvementFeedback, generatedReview, editedReview, suggestedStars
  reviewScreenshotUrl, screenshotHash
  verification: { method: 'orderId'|'name', orderId, customerOrderName }
  cashback: { method: 'upi'|'qr', upiId, upiQrImageUrl }
  status: pending|underReview|approved|rejected|paid
  adminNotes, approvedAtMillis, paidAtMillis, duplicateFlags[], meta{}

counters/reference          → monotonic reference numbers
admins/{uid}                → admin whitelist (active: true)
settings/campaign           → runtime campaign configuration
```

The model is deliberately prepared for future features: item-specific ratings
(`items[]`), campaigns, phone/OTP verification, WhatsApp notifications, AI
review generation and auto-payments.

## 🚀 Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
npm run lint
```

## 📂 Structure

```
src/
  lib/            firebase (demo + Firebase), review generator, duplicate
                  detection, image hashing, journey persistence, ratings, status
  components/     food icons, floating backdrop, UI primitives (upload, loader,
                  copy button, lightbox, confetti…), admin widgets
  pages/          Welcome, Feedback, Review, Cashback, Success (customer)
  pages/admin/    Login, Dashboard, Detail, Analytics, Settings
firestore.rules   Firestore security rules
storage.rules     Storage security rules
firebase.json     Hosting config (SPA rewrites + cache headers)
```
