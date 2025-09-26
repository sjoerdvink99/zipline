# GraphBridge - Multi-stage build
# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json ./
# Install dependencies fresh (ignoring lockfile for cross-platform compatibility)
RUN npm install --ignore-scripts && npm rebuild
COPY frontend/ ./
RUN npm run build

# Stage 2: Python runtime
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copy Python project files and install dependencies
COPY server/pyproject.toml ./server/
COPY server/src ./server/src

# Install Python dependencies
RUN pip install --no-cache-dir ./server

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy example datasets
COPY examples ./examples

# Set working directory for the server
WORKDIR /app/server

# Expose port
EXPOSE 5178

# Run the application
ENV PYTHONPATH=/app/server/src
CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5178"]
