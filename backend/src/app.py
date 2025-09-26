import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import (
    attributes_router,
    datasets_router,
    patterns_router,
    predicates_router,
    topology_router,
)
from core.dataset_manager import DatasetManager
from utils.logging_config import get_logger, setup_logging

# Setup logging
log_level = os.environ.get("LOG_LEVEL", "INFO")
structured_logging = os.environ.get("STRUCTURED_LOGGING", "false").lower() == "true"
setup_logging(log_level, structured_logging)

logger = get_logger("app")


def create_app() -> FastAPI:
    app = FastAPI(
        title="GraphBridge Backend",
        version="0.1.0",
        description="Single-user GraphBridge backend for cross-space graph analysis",
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
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    dataset_manager = DatasetManager()
    app.state.dataset_manager = dataset_manager

    try:
        dataset_manager.load_dataset("bron_threat_intel")
        logger.info(
            "✅ Loaded default dataset: BRON Threat Intelligence",
            extra={
                "dataset": "bron_threat_intel",
                "nodes": dataset_manager.get_graph().number_of_nodes()
                if dataset_manager.has_dataset()
                else 0,
                "edges": dataset_manager.get_graph().number_of_edges()
                if dataset_manager.has_dataset()
                else 0,
            },
        )
    except Exception as e:
        logger.warning(
            f"⚠️ Failed to load BRON dataset: {e}, falling back to Karate Club",
            extra={"error": str(e), "fallback": "karate_club"},
        )
        try:
            dataset_manager.load_dataset("karate_club")
            logger.info(
                "✅ Loaded fallback dataset: Karate Club",
                extra={
                    "dataset": "karate_club",
                    "nodes": dataset_manager.get_graph().number_of_nodes()
                    if dataset_manager.has_dataset()
                    else 0,
                    "edges": dataset_manager.get_graph().number_of_edges()
                    if dataset_manager.has_dataset()
                    else 0,
                },
            )
        except Exception as fallback_error:
            logger.error(
                f"❌ Failed to load fallback dataset: {fallback_error}",
                extra={"fallback_error": str(fallback_error)},
            )

    app.include_router(datasets_router)
    app.include_router(topology_router, prefix="/api/graph", tags=["graph"])
    app.include_router(attributes_router)
    app.include_router(predicates_router)
    app.include_router(patterns_router, prefix="/api")

    @app.get("/health")
    async def health():
        return {
            "status": "ready",
            "dataset_loaded": dataset_manager.has_dataset(),
            "current_dataset": getattr(dataset_manager.active, "get", lambda *args: {})(
                "name", "none"
            ),
        }

    @app.get("/")
    async def root():
        return {
            "message": "GraphBridge Backend API",
            "docs": "/docs",
            "health": "/health",
            "api": {
                "datasets": "/api/datasets",
                "graph": "/api/graph",
                "predicates": "/api/predicates",
                "patterns": "/api/patterns",
                "attributes": "/api/layers",
            },
        }

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
