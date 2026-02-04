import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from api import (
    attributes_router,
    data_sources_router,
    datasets_router,
    learning_router,
    predicates_router,
    topology_router,
)
from core.dataset_manager import DatasetManager
from core.user_data_registry import UserDataRegistry
from utils.logging_config import get_logger, setup_logging

log_level = os.environ.get("LOG_LEVEL", "INFO")
structured_logging = os.environ.get("STRUCTURED_LOGGING", "false").lower() == "true"
setup_logging(log_level, structured_logging)

logger = get_logger("app")


def create_app() -> FastAPI:
    app = FastAPI(
        title="ZipLine Backend",
        version="0.1.0",
        description="Single-user ZipLine backend for cross-space graph analysis",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://localhost:5173",
            "http://localhost:4173",
            "http://localhost:5174",
            "http://localhost:5175",
        ],
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["*"],
    )

    dataset_manager = DatasetManager()
    app.state.dataset_manager = dataset_manager

    user_data_registry = UserDataRegistry()
    app.state.user_data_registry = user_data_registry

    try:
        dataset_manager.load_dataset("bron_threat_intel")
        g = dataset_manager.get_graph()
        logger.info(
            "Loaded default dataset: MITRE ATT&CK Enterprise",
            extra={
                "dataset": "bron_threat_intel",
                "nodes": g.number_of_nodes() if g is not None else 0,
                "edges": g.number_of_edges() if g is not None else 0,
            },
        )
    except Exception as e:
        logger.warning(
            f"Failed to load MITRE ATT&CK dataset: {e}, falling back to TenneT NH Energy",
            extra={"error": str(e), "fallback": "tennet_nh_energy"},
        )
        try:
            dataset_manager.load_dataset("tennet_nh_energy")
            g = dataset_manager.get_graph()
            logger.info(
                "Loaded fallback dataset: Noord-Holland Energy Infrastructure",
                extra={
                    "dataset": "tennet_nh_energy",
                    "nodes": g.number_of_nodes() if g is not None else 0,
                    "edges": g.number_of_edges() if g is not None else 0,
                },
            )
        except Exception as fallback_error:
            logger.error(
                f"Failed to load fallback dataset: {fallback_error}",
                extra={"fallback_error": str(fallback_error)},
            )

    app.include_router(datasets_router)
    app.include_router(data_sources_router)
    app.include_router(topology_router, prefix="/api/graph", tags=["graph"])
    app.include_router(attributes_router)
    app.include_router(predicates_router)
    app.include_router(learning_router)

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "status": "ready",
            "dataset_loaded": dataset_manager.has_dataset(),
            "current_dataset": dataset_manager.active_graph or "none",
        }

    static_dir = Path(__file__).parent.parent / "static"
    if static_dir.exists():

        @app.get("/{full_path:path}", include_in_schema=False)
        async def serve_spa(full_path: str) -> FileResponse:
            file_path = static_dir / full_path
            if file_path.is_file():
                return FileResponse(file_path)
            return FileResponse(static_dir / "index.html")

    else:

        @app.get("/")
        async def root() -> dict[str, Any]:
            return {
                "message": "ZipLine Backend API",
                "docs": "/docs",
                "health": "/health",
                "api": {
                    "datasets": "/api/datasets",
                    "data-sources": "/api/data-sources",
                    "graph": "/api/graph",
                    "predicates": "/api/predicates",
                    "attributes": "/api/attributes",
                },
            }

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
