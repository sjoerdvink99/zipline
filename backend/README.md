# GraphBridge Backend

A visual analytics backend server for multivariate graph analysis using descriptive predicates.

## Features

- FastAPI-based REST API
- WebSocket support for real-time updates
- Built-in dataset management
- Support for custom graph datasets
- Descriptive predicate generation

## Installation

```bash
# Using uv (recommended)
uv pip install -e .

# Or using pip
pip install -e .
```

## Usage

```bash
# Run the server
python main.py

# Or using uvicorn directly
uvicorn src.main:app --reload --port 8000
```

## API Documentation

Once running, visit:
- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

## Development

```bash
# Install with dev dependencies
uv pip install -e ".[dev]"

# Run tests
pytest

# Format code
black src/
ruff --fix src/
```
