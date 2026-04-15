FROM python:3.11-slim

# poppler-utils is required by pdf2image to convert PDF pages to JPEG
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Run Alembic migrations then start the server.
# Migrations are idempotent so this is safe on every restart.
CMD alembic upgrade head && \
    uvicorn app.main:app --host 0.0.0.0 --port 8000
