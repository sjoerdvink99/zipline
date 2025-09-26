.PHONY: setup-backend setup-frontend setup-pre-commit dev dev-backend dev-frontend test lint lint-fix format demo clean

# Setup backend environment
setup-backend:
	@echo "Setting up backend environment..."
	cd backend && uv venv && uv sync

# Setup frontend environment
setup-frontend:
	@echo "Setting up frontend environment..."
	cd frontend && bun install

# Generate sample datasets
setup-data:
	@echo "Generating sample datasets..."
	cd backend && .venv/bin/python ../scripts/setup_sample_data.py

# Setup pre-commit hooks for code quality
setup-pre-commit: setup-backend
	@echo "Setting up pre-commit hooks..."
	./scripts/setup-pre-commit.sh

# Setup both environments
setup: setup-backend setup-frontend setup-data setup-pre-commit
	@echo "GraphBridge development environment ready!"

# Start both backend and frontend servers
dev:
	@echo "Starting GraphBridge development servers..."
	@echo "Backend: http://localhost:8000"
	@echo "Frontend: http://localhost:5173"
	@echo "Press Ctrl+C to stop both servers"
	@trap 'kill %1 %2 2>/dev/null; exit' INT; \
	cd backend && .venv/bin/uvicorn src.app:app --reload --port 8000 & \
	cd frontend && bun run dev & \
	wait

# Start backend server only
dev-backend:
	@echo "Starting backend server on http://localhost:8000..."
	cd backend && .venv/bin/uvicorn src.app:app --reload --port 8000

# Start frontend server only
dev-frontend:
	@echo "Starting frontend server on http://localhost:5173..."
	cd frontend && bun run dev

# Run all tests
test:
	@echo "Running all backend tests..."
	cd backend && PYTHONPATH=src .venv/bin/python -m pytest tests/ -v

# Code quality checks and formatting
lint:
	@echo "Running backend linting..."
	cd backend && .venv/bin/ruff check src/

lint-fix:
	@echo "Running backend linting with auto-fix..."
	cd backend && .venv/bin/ruff check --fix src/

format:
	@echo "Formatting backend code..."
	cd backend && .venv/bin/ruff format src/

# Quick demo with sample data
demo: setup-data
	@echo "Starting GraphBridge demo..."
	@echo "Loading sample datasets and starting servers..."
	@trap 'kill %1 %2 2>/dev/null; exit' INT; \
	cd backend && .venv/bin/uvicorn src.app:app --reload --port 8000 & \
	cd frontend && bun run dev & \
	echo "GraphBridge running at http://localhost:5173"; \
	echo "Backend API at http://localhost:8000"; \
	wait

# Clean up generated files
clean:
	@echo "Cleaning up..."
	rm -rf backend/.venv/
	rm -rf frontend/node_modules/
	rm -rf frontend/dist/
	rm -rf data/
