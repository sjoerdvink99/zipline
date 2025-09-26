from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from core.dataset_manager import DatasetManager
from core.dependencies import get_dataset_manager
from utils.logging_config import get_logger

logger = get_logger("api.datasets")

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


@router.get("/")
async def list_datasets(
    manager: DatasetManager = Depends(get_dataset_manager),
) -> dict[str, Any]:
    try:
        datasets = manager.get_available_datasets()
        logger.info(f"Listed {len(datasets)} available datasets")
        return {"datasets": datasets}
    except Exception as e:
        logger.error(f"Error listing datasets: {e}")
        return {"datasets": {}}


@router.post("/{dataset_name}/load")
async def load_dataset(
    dataset_name: str,
    manager: DatasetManager = Depends(get_dataset_manager),
) -> dict[str, Any]:
    try:
        logger.info(f"Loading dataset: {dataset_name}")
        result = manager.load_dataset(dataset_name)

        logger.info(f"Successfully loaded dataset: {dataset_name}")
        return {"success": True, "dataset": result}
    except ValueError as e:
        logger.warning(f"Failed to load dataset {dataset_name}: {e}")
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
        if current is None:
            logger.info("No dataset currently loaded")
            return {"dataset": None}

        logger.debug(f"Current dataset: {current.get('name', 'unknown')}")
        return {"dataset": current}
    except Exception as e:
        logger.error(f"Error retrieving current dataset: {e}")
        return {"dataset": None}


@router.post("/switch")
async def switch_dataset(
    request: dict[str, Any],
    manager: DatasetManager = Depends(get_dataset_manager),
) -> dict[str, Any]:
    """Switch to a different dataset."""
    dataset_name = request.get("dataset_name")
    if not dataset_name:
        raise HTTPException(status_code=400, detail="dataset_name is required")

    try:
        logger.info(f"Switching to dataset: {dataset_name}")
        result = manager.load_dataset(dataset_name)
        logger.info(f"Successfully switched to dataset: {dataset_name}")
        return {"success": True, "dataset": result}
    except ValueError as e:
        logger.warning(f"Failed to switch to dataset {dataset_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.error(f"Unexpected error switching to dataset {dataset_name}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error") from e
