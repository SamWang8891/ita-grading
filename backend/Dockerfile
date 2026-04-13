FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY pyproject.toml ./
RUN pip install .

COPY . .

# Persist DB outside the image; mount host dir to /app/.db.
VOLUME ["/app/.db"]

# PORT is read from the env at runtime (see app.py / .env).
# HOST is hard-coded to 0.0.0.0 so the container is reachable regardless of
# a HOST=127.0.0.1 value that you may keep in .env for local python runs.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
