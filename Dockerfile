# Stage 1: Build frontend
FROM oven/bun:1-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install --frozen-lockfile
COPY frontend/ .
RUN bun run build

# Stage 2: Final image
FROM python:3.12-slim

LABEL org.opencontainers.image.source="https://github.com/sjoerdvink99/zipline"
LABEL org.opencontainers.image.description="ZipLine — visual analytics for interactive graph explanation"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

# Install Python dependencies
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-group dev --no-install-project

# Copy backend source and frontend build
COPY backend/src/ ./src/
COPY --from=frontend /app/dist ./static/

# Create non-root user and set ownership
RUN addgroup --system zipline && adduser --system --ingroup zipline zipline \
    && chown -R zipline:zipline /app

VOLUME /app/data
EXPOSE 8000

ENV PYTHONPATH=src \
    ZIPLINE_DATA_DIR=/app/data

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

USER zipline
CMD [".venv/bin/uvicorn", "src.app:app", "--host", "0.0.0.0", "--port", "8000"]
