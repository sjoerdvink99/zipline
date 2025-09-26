from __future__ import annotations

import networkx as nx
from fastapi import Depends, HTTPException, Request

from core.dataset_manager import DatasetManager


def get_dataset_manager(request: Request) -> DatasetManager:
    return request.app.state.dataset_manager


def get_active_graph(
    dataset_manager: DatasetManager = Depends(get_dataset_manager),
) -> nx.Graph:
    """Get the single active graph directly from DatasetManager"""
    if not dataset_manager.has_dataset():
        raise HTTPException(status_code=404, detail="No active dataset loaded")
    return dataset_manager.get_graph()
