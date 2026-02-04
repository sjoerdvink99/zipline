.PHONY: setup dev dev-backend dev-frontend data test lint format clean docker docker-run eval

setup:
	@echo "Setting up ZipLine..."
	cd backend && uv venv && uv sync
	cd frontend && bun install
	cd backend && .venv/bin/pre-commit install

data:
	@echo "Fetching datasets..."
	cd backend && .venv/bin/python ../scripts/fetch_bron.py
	cd backend && .venv/bin/python ../scripts/fetch_primekg.py
	cd backend && .venv/bin/python ../scripts/fetch_tennet_nh.py
	cd backend && .venv/bin/python ../scripts/fetch_cora.py

dev:
	@echo "Starting ZipLine..."
	@echo "Backend: http://localhost:8000  Frontend: http://localhost:5173"
	@trap 'kill %1 %2 2>/dev/null; exit' INT; \
	cd backend && .venv/bin/uvicorn src.app:app --reload --port 8000 & \
	cd frontend && bun run dev & \
	wait

dev-backend:
	cd backend && .venv/bin/uvicorn src.app:app --reload --port 8000

dev-frontend:
	cd frontend && bun run dev

test:
	cd backend && PYTHONPATH=src .venv/bin/python -m pytest tests/ -v

lint:
	cd backend && .venv/bin/ruff check --cache-dir=.ruff_cache src/

format:
	cd backend && .venv/bin/ruff format --cache-dir=.ruff_cache src/

docker:
	docker build -t ghcr.io/sjoerdvink99/zipline .
	@echo "Run with: docker run -p 8000:8000 -v ./data:/app/data ghcr.io/sjoerdvink99/zipline"

docker-run:
	docker run -p 8000:8000 -v ./data:/app/data ghcr.io/sjoerdvink99/zipline

eval:
	cd backend && PYTHONPATH=src .venv/bin/python ../eval/run_eval.py

clean:
	rm -rf backend/.venv/ frontend/node_modules/ frontend/dist/
