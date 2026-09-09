# Frontend

React frontend for the Mahalaxmi Cashback Upload System.

## Routes
- `/` customer cashback form
- `#/admin` admin dashboard

## Environment
Create `.env` only if you want to point the frontend to an external backend:

```env
VITE_API_BASE_URL=https://your-backend-domain.com
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

In local development, leave it empty because Vite proxies `/api` and `/uploads` to the Python backend.

## Commands
```bash
npm install
npm run dev
npm run build
npm run lint
```
