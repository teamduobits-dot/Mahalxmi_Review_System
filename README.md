# Mahalaxmi Cashback Upload System

A simplified cashback collection app for Mahalaxmi Multi Cuisine.

## What it does

### Customer side
Customers only need to:
- upload their review screenshot
- enter their name
- enter the last 4 digits of their Order ID
- provide a UPI ID **or** upload a UPI QR image

### Admin side
Admin can:
- log in with the allowed email only
- view all submissions in a dashboard
- open each submission in detail
- approve, reject, or mark paid
- save admin notes
- update customer-facing settings
- change the admin password

## Stack
- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** FastAPI (Python)
- **Database:** SQLite (local)
- **Uploads:** saved locally in `backend/uploads/`

## Default admin login
- **Email:** `team.duobits@gmail.com`
- **Password:** `aditya9922`

You can change the password from the admin settings screen.

## Optional Google login for admin
A Google sign-in button is added in the admin login page.
To make it work, set a Google OAuth Client ID in the frontend env:

```env
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

The backend accepts only the allowed admin email after Google verification.

## Local development

### 1) Start backend
```bash
cd backend
../.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2) Start frontend
```bash
cd my-react-app
npm install
npm run dev
```

### 3) Open app
- Customer form: `http://localhost:5173/`
- Admin: `http://localhost:5173/#/admin`

## Notes for later cloud deployment
The frontend uses relative `/api` and `/uploads` paths in local dev through Vite proxy.
For cloud deployment later, set `VITE_API_BASE_URL` to your backend URL.

## Backend files
- `backend/main.py` — API routes
- `backend/database.py` — SQLite schema + seeding
- `backend/security.py` — password hashing helpers
- `backend/requirements.txt` — Python dependencies
