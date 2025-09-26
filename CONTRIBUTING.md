# Contributing

## Setup

```bash
# Clone the repo
git clone https://github.com/sjoerdvink/graphbridge.git
cd graphbridge

# Install client (Python 3.10+)
cd client
uv venv && source .venv/bin/activate
uv pip install -e ".[dev]"

# Install server (Python 3.12+)
cd ../server
uv pip install -e ".[dev]"

# Install frontend
cd ../frontend
bun install
```

## Development

```bash
# Start server
cd server && uvicorn src.main:app --reload --port 5178

# Start frontend (separate terminal)
cd frontend && bun dev

# Run tests (from project root)
pytest -v
```

## Pull Requests

1. Fork the repo
2. Create a branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run tests (`pytest -v`)
5. Push and open a PR

## Code Style

- Python: Follow existing patterns, no unnecessary comments
- TypeScript: Follow existing patterns
- Keep changes focused and minimal
