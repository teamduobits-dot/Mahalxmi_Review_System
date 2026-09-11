#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy_preflight.sh — run this on YOUR machine (logged into gcloud) BEFORE
# deploying to Cloud Run. It verifies every prerequisite from
# CLOUD_DEPLOYMENT.md so the deploy itself has no surprises.
#
#   bash scripts/deploy_preflight.sh
#
# Exit code 0 = ready to deploy. Non-zero = fix the FAILs first.
# ─────────────────────────────────────────────────────────────────────────────
set -u

PROJECT_ID="${PROJECT_ID:-mahalxmi-review-system}"
REGION="${REGION:-us-central1}"
SERVICE="mahalxmi-api"
BUCKET="gs://${STORAGE_BUCKET:-$PROJECT_ID.appspot.com}"
SECRETS=(mahalxmi-admin-password mahalxmi-session-secret)
APIS=(run.googleapis.com cloudbuild.googleapis.com firestore.googleapis.com secretmanager.googleapis.com storage.googleapis.com)

PASS=0; FAIL=0; WARN=0
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
warn() { echo "  ⚠️  $1"; WARN=$((WARN+1)); }

echo "═══ Mahalaxmi Cloud Run deploy preflight ═══"
echo "project=$PROJECT_ID  region=$REGION  service=$SERVICE"
echo

# 1. gcloud installed + authenticated ────────────────────────────────────────
echo "1. gcloud CLI"
if ! command -v gcloud >/dev/null 2>&1; then
  bad "gcloud not found. Install: https://cloud.google.com/sdk/docs/install"
  echo; echo "RESULT: $PASS passed, $FAIL failed — stopping (gcloud required)."
  exit 1
fi
ok "gcloud installed ($(gcloud --version 2>/dev/null | head -1))"
ACCOUNT="$(gcloud config get-value account 2>/dev/null)"
if [[ "$ACCOUNT" == "(unset)" || -z "$ACCOUNT" ]]; then
  bad "not logged in. Run: gcloud auth login"
else
  ok "logged in as $ACCOUNT"
fi

# 2. Project set + matches ───────────────────────────────────────────────────
echo; echo "2. Active project"
CURRENT_PROJECT="$(gcloud config get-value project 2>/dev/null)"
if [[ "$CURRENT_PROJECT" == "$PROJECT_ID" ]]; then
  ok "active project is $PROJECT_ID"
else
  bad "active project is '$CURRENT_PROJECT', expected '$PROJECT_ID'."
  echo "     Fix: gcloud config set project $PROJECT_ID"
fi

# 3. Billing enabled (Cloud Run needs it) ───────────────────────────────────
echo; echo "3. Billing"
BILLING="$(gcloud beta billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null)"
if [[ "$BILLING" == "True" ]]; then
  ok "billing enabled (Blaze) — set budget alerts: Console → Billing → Budgets"
elif [[ -z "$BILLING" ]]; then
  warn "could not check billing (needs 'gcloud beta'). Verify manually: Console → Billing."
else
  bad "billing NOT enabled. Cloud Run requires the Blaze plan."
fi

# 4. Required APIs ───────────────────────────────────────────────────────────
echo; echo "4. Enabled APIs"
ENABLED="$(gcloud services list --enabled --format='value(config.name)' 2>/dev/null)"
for api in "${APIS[@]}"; do
  if echo "$ENABLED" | grep -qx "$api"; then
    ok "$api"
  else
    bad "$api not enabled. Fix: gcloud services enable $api"
  fi
done

# 5. Firestore database exists ───────────────────────────────────────────────
echo; echo "5. Cloud Firestore"
FS="$(gcloud firestore databases describe --database='(default)' 2>/dev/null || gcloud beta firestore databases describe 2>/dev/null)"
if [[ -n "$FS" ]]; then
  ok "Firestore database exists"
  echo "$FS" | grep -q "locationId" && echo "     ($(echo "$FS" | grep locationId | head -1 | xargs))"
else
  bad "No Firestore database. Console → Firestore → Create database (native mode)."
fi

# 6. Storage bucket exists ───────────────────────────────────────────────────
echo; echo "6. Firebase Storage bucket"
if gcloud storage buckets describe "$BUCKET" >/dev/null 2>&1 || gsutil ls -b "$BUCKET" >/dev/null 2>&1; then
  ok "bucket $BUCKET exists"
  # lifecycle rule (60-day image retention) — warning only, not blocking
  LC="$(gcloud storage buckets describe "$BUCKET" --format='json(lifecycle)' 2>/dev/null)"
  if echo "$LC" | grep -q '"type": *"Delete"'; then
    ok "60-day Delete lifecycle rule present"
  else
    warn "no lifecycle Delete rule yet — images will be kept forever."
    echo "     Apply: see CLOUD_DEPLOYMENT.md 'Image retention' (one gsutil command)."
  fi
else
  bad "bucket $BUCKET not found. Console → Storage → Get started (production mode)."
fi

# 7. Secret Manager secrets ──────────────────────────────────────────────────
echo; echo "7. Secret Manager secrets"
for secret in "${SECRETS[@]}"; do
  if gcloud secrets describe "$secret" >/dev/null 2>&1; then
    ok "secret '$secret' exists"
  else
    bad "secret '$secret' missing. Create it:"
    echo "     echo -n '<value>' | gcloud secrets create $secret --data-file=-"
  fi
done

# 8. Admin email decision ────────────────────────────────────────────────────
echo; echo "8. Production admin email"
if [[ -n "${ADMIN_EMAIL:-}" ]]; then
  ok "ADMIN_EMAIL env provided: $ADMIN_EMAIL"
else
  warn "ADMIN_EMAIL env var not set for this script — you will pass it to"
  echo "     'gcloud run deploy --set-env-vars ADMIN_EMAIL=...' (or GitHub repo variable)."
fi

# 9. Repo side: firebase.json region matches deploy region ──────────────────
echo; echo "9. firebase.json rewrite region"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if grep -q "\"region\": \"$REGION\"" "$REPO_ROOT/firebase.json" 2>/dev/null; then
  ok "firebase.json rewrite region matches $REGION"
else
  warn "firebase.json rewrite region differs from REGION=$REGION."
  echo "     Keep them in sync (firebase.json → rewrites → run.region)."
fi

# ───────────────────────────────────────────────────────────────────────────
echo
echo "═══ RESULT: $PASS passed, $FAIL failed, $WARN warnings ═══"
if [[ $FAIL -eq 0 ]]; then
  echo "🚀 Ready to deploy:"
  echo
  echo "   gcloud run deploy $SERVICE \\"
  echo "     --source backend --region $REGION --platform managed \\"
  echo "     --allow-unauthenticated --memory 512Mi --cpu 1 --max-instances 2 \\"
  echo "     --set-env-vars APP_ENV=production,BACKEND_MODE=firebase,ADMIN_EMAIL=<your-admin-email>,CORS_ORIGINS=https://$PROJECT_ID.web.app \\"
  echo "     --set-secrets ADMIN_PASSWORD=mahalxmi-admin-password:latest,SESSION_SECRET=mahalxmi-session-secret:latest"
  echo
  echo "   firebase deploy --only firestore:rules,storage,hosting   # after npm run build"
  exit 0
else
  echo "🛑 Fix the ❌ items above, then re-run this script."
  exit 1
fi
