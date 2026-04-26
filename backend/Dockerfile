# syntax=docker/dockerfile:1.7

FROM python:3.12-slim AS base
WORKDIR /app

ENV UV_HTTP_TIMEOUT=300 \
    UV_HTTP_RETRIES=8 \
    PIP_DEFAULT_TIMEOUT=300 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

FROM base AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --no-cache-dir uv

# Install dependencies in a cache-friendly layer.
# (Only changes when pyproject.toml changes.)
COPY pyproject.toml ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system --no-cache .

# Runtime image: no compiler toolchain.
FROM base AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local /usr/local

# Copy application code last (fast rebuilds for code changes).
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini

RUN mkdir -p /app/uploads \
    && useradd -m -u 1000 appuser \
    && chown -R appuser:appuser /app

USER appuser
EXPOSE 8000

CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
