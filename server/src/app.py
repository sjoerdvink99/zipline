from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api import graph_router, layers_router


def _find_static_dir() -> Path:
    candidates = [
        Path(__file__).resolve().parents[3] / "frontend" / "dist",
        Path("/app/frontend/dist"),
    ]
    for candidate in candidates:
        if candidate.exists() and (candidate / "index.html").exists():
            return candidate
    return candidates[0]


STATIC_DIR = _find_static_dir()
INDEX_FILE = STATIC_DIR / "index.html"


def build_app(state: Optional[Dict[str, Any]] = None) -> FastAPI:
    app = FastAPI(title="GraphBridge", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(graph_router, prefix="/api/graph", tags=["graph"])
    app.include_router(layers_router)

    @app.get("/health")
    async def health():
        return {"ok": True}

    @app.get("/")
    async def index_html():
        if STATIC_DIR.exists() and INDEX_FILE.exists():
            return FileResponse(INDEX_FILE)
        return {"message": "GraphBridge API"}

    if STATIC_DIR.exists() and INDEX_FILE.exists():
        app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    return app


app = build_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="127.0.0.1", port=5178, reload=False)
