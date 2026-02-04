from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from api.data_sources import reload_user_source_if_needed
from core.dataset_manager import DatasetManager
from core.dependencies import get_dataset_manager, get_user_data_registry
from core.user_data_registry import UserDataRegistry
from utils.logging_config import get_logger

logger = get_logger("api.datasets")

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


@router.get("/")
async def list_datasets(
    manager: DatasetManager = Depends(get_dataset_manager),
    registry: UserDataRegistry = Depends(get_user_data_registry),
) -> dict[str, Any]:
    try:
        sample = {
            k: {**v, "source_type": "sample"}
            for k, v in manager.get_available_datasets().items()
        }
        user: dict[str, Any] = {}
        for source in registry.list_sources():
            user[source.id] = {
                "name": source.name,
                "description": source.description,
                "source_type": "user",
                "data_source_type": source.type,
                "node_types": source.node_types,
                "node_count": source.node_count,
                "edge_count": source.edge_count,
                "created_at": source.created_at,
                "connection_uri": source.connection_uri,
                "file_name": source.file_name,
            }
        return {"datasets": {**sample, **user}}
    except Exception as e:
        logger.error(f"Error listing datasets: {e}")
        return {"datasets": {}}


@router.post("/{dataset_name}/load")
async def load_dataset(
    dataset_name: str,
    manager: DatasetManager = Depends(get_dataset_manager),
) -> dict[str, Any]:
    try:
        result = manager.load_dataset(dataset_name)
        return {"success": True, "dataset": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.error(f"Unexpected error loading dataset {dataset_name}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error") from e


@router.get("/current")
async def get_current_dataset(
    manager: DatasetManager = Depends(get_dataset_manager),
) -> dict[str, Any]:
    try:
        current = manager.get_current_dataset()
        return {"dataset": current}
    except Exception as e:
        logger.error(f"Error retrieving current dataset: {e}")
        return {"dataset": None}


@router.post("/switch")
async def switch_dataset(
    request: dict[str, Any],
    manager: DatasetManager = Depends(get_dataset_manager),
    registry: UserDataRegistry = Depends(get_user_data_registry),
) -> dict[str, Any]:
    dataset_name = request.get("dataset_name")
    if not dataset_name:
        raise HTTPException(status_code=400, detail="dataset_name is required")

    try:
        result = manager.load_dataset(dataset_name)
        return {"success": True, "dataset": result}
    except ValueError:
        pass

    result = reload_user_source_if_needed(dataset_name, manager, registry)
    return {"success": True, "dataset": result}
