from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from core.dataset_manager import DatasetManager
from core.dependencies import get_dataset_manager, get_user_data_registry
from core.user_data_registry import UserDataRegistry
from models.data_source_models import (
    ConnectionTestResult,
    DataSourceType,
    ExtractionResult,
    Neo4jConnectionConfig,
    Neo4jQueryConfig,
    Neo4jSchemaInfo,
    QueryPreviewResult,
    UserDataSourceMeta,
)
from services.data_sources import file_importer, neo4j_connector
from utils.logging_config import get_logger

logger = get_logger("api.data_sources")

router = APIRouter(prefix="/api/data-sources", tags=["data-sources"])

_MAX_UPLOAD_BYTES = 50 * 1024 * 1024
_ALLOWED_EXTENSIONS = {".json", ".graphml", ".xml"}


@router.post("/neo4j/test")
async def test_neo4j_connection(
    config: Neo4jConnectionConfig,
) -> ConnectionTestResult:
    return await asyncio.to_thread(neo4j_connector.test_connection, config)


@router.post("/neo4j/schema")
async def get_neo4j_schema(
    config: Neo4jConnectionConfig,
) -> Neo4jSchemaInfo:
    try:
        return await asyncio.to_thread(neo4j_connector.get_schema, config)
    except Exception as e:
        logger.error(f"Schema fetch failed: {e}")
        raise HTTPException(status_code=503, detail=str(e)) from e


@router.post("/neo4j/preview")
async def preview_neo4j_query(
    config: Neo4jQueryConfig,
) -> QueryPreviewResult:
    try:
        return await asyncio.to_thread(neo4j_connector.preview_query, config)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except Exception as e:
        logger.error(f"Preview failed: {e}")
        raise HTTPException(status_code=503, detail=str(e)) from e


@router.post("/neo4j/load")
async def load_neo4j_query(
    config: Neo4jQueryConfig,
    manager: DatasetManager = Depends(get_dataset_manager),
    registry: UserDataRegistry = Depends(get_user_data_registry),
) -> ExtractionResult:
    try:
        G, meta = await asyncio.to_thread(neo4j_connector.execute_query, config)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except Exception as e:
        logger.error(f"Neo4j extraction failed: {e}")
        raise HTTPException(status_code=503, detail=str(e)) from e

    source_id = f"neo4j_{uuid.uuid4().hex[:8]}"

    source_meta = UserDataSourceMeta(
        id=source_id,
        type=DataSourceType.neo4j,
        name=config.name,
        description=config.description,
        node_count=G.number_of_nodes(),
        edge_count=G.number_of_edges(),
        node_types=meta.node_types,
        created_at=datetime.now(timezone.utc).isoformat(),
        connection_uri=config.connection.uri,
    )
    registry.save_source(source_meta)

    result = manager.set_user_graph(
        source_id,
        G,
        {
            "name": config.name,
            "description": config.description,
            "source_type": "user",
            "node_types": meta.node_types,
        },
    )

    return ExtractionResult(
        success=True,
        dataset_id=source_id,
        nodes=result["nodes"],
        edges=result["edges"],
        node_types=meta.node_types,
        edge_limit_reached=meta.edge_limit_reached,
    )


@router.post("/files/upload")
async def upload_file(
    file: UploadFile = File(...),
    name: str = Form(default=""),
    description: str = Form(default=""),
    manager: DatasetManager = Depends(get_dataset_manager),
    registry: UserDataRegistry = Depends(get_user_data_registry),
) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(status_code=422, detail="No filename provided")

    dot_pos = file.filename.rfind(".")
    suffix = ("." + file.filename[dot_pos + 1 :].lower()) if dot_pos != -1 else ""
    if suffix not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type '{suffix}'. Use .json or .graphml",
        )

    content = await file.read()
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")

    try:
        if suffix == ".json":
            G = file_importer.import_json_graph(content)
        else:
            G = file_importer.import_graphml(content)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    source_id = f"file_{uuid.uuid4().hex[:8]}"
    display_name = name.strip() or file.filename
    node_types = sorted(
        {data.get("node_type", "node") for _, data in G.nodes(data=True)}
    )

    registry.save_upload(source_id, content, suffix.lstrip("."))

    meta = UserDataSourceMeta(
        id=source_id,
        type=DataSourceType.file,
        name=display_name,
        description=description.strip(),
        node_count=G.number_of_nodes(),
        edge_count=G.number_of_edges(),
        node_types=node_types,
        created_at=datetime.now(timezone.utc).isoformat(),
        file_name=file.filename,
    )
    registry.save_source(meta)

    result = manager.set_user_graph(
        source_id,
        G,
        {
            "name": display_name,
            "description": description.strip(),
            "source_type": "user",
            "node_types": node_types,
        },
    )

    return {
        "success": True,
        "dataset_id": source_id,
        "nodes": result["nodes"],
        "edges": result["edges"],
        "node_types": node_types,
    }


@router.post("/files/{source_id}/load")
async def load_uploaded_file(
    source_id: str,
    manager: DatasetManager = Depends(get_dataset_manager),
    registry: UserDataRegistry = Depends(get_user_data_registry),
) -> dict[str, Any]:
    meta = registry.get_source(source_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Data source not found")

    if manager.set_active(source_id):
        current = manager.get_current_dataset()
        return {
            "success": True,
            "dataset_id": source_id,
            "nodes": current["nodes"] if current else 0,
            "edges": current["edges"] if current else 0,
        }

    upload_path = registry.get_upload_path(source_id)
    if upload_path is None:
        raise HTTPException(status_code=404, detail="Uploaded file not found on disk")

    content = upload_path.read_bytes()
    try:
        if upload_path.suffix == ".json":
            G = file_importer.import_json_graph(content)
        else:
            G = file_importer.import_graphml(content)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    result = manager.set_user_graph(
        source_id,
        G,
        {
            "name": meta.name,
            "description": meta.description,
            "source_type": "user",
            "node_types": meta.node_types,
        },
    )

    return {
        "success": True,
        "dataset_id": source_id,
        "nodes": result["nodes"],
        "edges": result["edges"],
    }


@router.get("/")
async def list_user_data_sources(
    registry: UserDataRegistry = Depends(get_user_data_registry),
) -> dict[str, Any]:
    sources = registry.list_sources()
    return {"sources": [s.model_dump() for s in sources]}


@router.delete("/{source_id}")
async def delete_user_data_source(
    source_id: str,
    registry: UserDataRegistry = Depends(get_user_data_registry),
) -> dict[str, Any]:
    deleted = registry.delete_source(source_id)
    if deleted:
        registry.delete_upload(source_id)
    return {"success": deleted}


def _reload_file_source(
    source_id: str,
    meta: UserDataSourceMeta,
    registry: UserDataRegistry,
    manager: DatasetManager,
) -> dict[str, Any]:
    upload_path = registry.get_upload_path(source_id)
    if upload_path is None:
        raise HTTPException(
            status_code=400,
            detail=f"File for '{meta.name}' was not found on disk and must be re-uploaded",
        )
    content = upload_path.read_bytes()
    try:
        G = (
            file_importer.import_json_graph(content)
            if upload_path.suffix == ".json"
            else file_importer.import_graphml(content)
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    result = manager.set_user_graph(
        source_id,
        G,
        {
            "name": meta.name,
            "description": meta.description,
            "source_type": "user",
            "node_types": meta.node_types,
        },
    )
    return result


def reload_user_source_if_needed(
    source_id: str,
    manager: DatasetManager,
    registry: UserDataRegistry,
) -> dict[str, Any]:
    meta = registry.get_source(source_id)
    if meta is None:
        raise HTTPException(status_code=400, detail=f"Unknown dataset: {source_id}")

    if meta.type == DataSourceType.file:
        return _reload_file_source(source_id, meta, registry, manager)

    raise HTTPException(
        status_code=400,
        detail=f"'{meta.name}' is a Neo4j source — reconnect via the Data Sources panel to reload",
    )
