.PHONY: dev-server dev-frontend

dev-server:
	@echo "Starting GraphBridge server at http://127.0.0.1:5178"
	cd server && PYTHONPATH=src .venv/bin/python -m app

dev-frontend:
	@echo "Starting frontend dev server..."
	cd frontend && bun run dev

jupyter:
	@echo "Starting Jupyter Notebook..."
	cd client && .venv/bin/jupyter notebook examples/