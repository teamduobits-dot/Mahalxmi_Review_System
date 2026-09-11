# Cloud Run image for the Mahalaxmi FastAPI backend.
#
#   gcloud run deploy mahalxmi-api --source backend --region us-central1
#
# Cloud Run injects the listening port as $PORT (default 8080); uvicorn
# honors it. In production set APP_ENV=production plus ADMIN_EMAIL,
# ADMIN_PASSWORD and SESSION_SECRET (Secret Manager recommended) and
# BACKEND_MODE=firebase (auto-detected on Cloud Run anyway).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run as a non-root user (Cloud Run best practice).
RUN useradd --create-home appuser \
    && mkdir -p /app/uploads \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# $PORT is provided by Cloud Run; falls back to 8000 for local `docker run`.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
