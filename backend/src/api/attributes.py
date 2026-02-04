from __future__ import annotations

import logging
from typing import Any

import networkx as nx
from fastapi import APIRouter, Depends, Query

from core.dependencies import get_active_graph
from services.attribute_distributions import compute_attribute_distributions
from services.dimensionality_reduction import compute_umap_embedding

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/attributes", tags=["attributes"])


@router.get("/distributions")
async def get_distributions(
    graph: nx.Graph = Depends(get_active_graph),
) -> dict[str, Any]:
    try:
        return compute_attribute_distributions(graph)
    except Exception as e:
        logger.exception("Error computing distributions: %s", e)
        return {
            "distributions_by_label": {},
            "shared_attributes": {},
            "label_distribution": {
                "type": "categorical",
                "values": [],
                "total_unique": 0,
            },
        }


@router.get("/umap")
async def compute_umap(
    n_neighbors: int = Query(15, ge=2, le=50),
    min_dist: float = Query(0.1, ge=0.0, le=1.0),
    metric: str = Query("euclidean"),
    n_components: int = Query(2, ge=2, le=3),
    graph: nx.Graph = Depends(get_active_graph),
) -> dict[str, Any]:
    try:
        result = compute_umap_embedding(
            graph=graph,
            n_neighbors=n_neighbors,
            min_dist=min_dist,
            metric=metric,
            n_components=n_components,
        )
        logger.info(
            f"Computed UMAP embedding for {len(result.get('node_ids', []))} nodes"
        )
        return result
    except Exception as e:
        logger.exception("Error computing UMAP: %s", e)
        return {"error": str(e)}
