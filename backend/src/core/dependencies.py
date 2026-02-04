from __future__ import annotations

from typing import cast

import networkx as nx
from fastapi import Depends, HTTPException, Request

from core.dataset_manager import DatasetManager
from core.user_data_registry import UserDataRegistry


def get_dataset_manager(request: Request) -> DatasetManager:
    return cast(DatasetManager, request.app.state.dataset_manager)


def get_user_data_registry(request: Request) -> UserDataRegistry:
    return cast(UserDataRegistry, request.app.state.user_data_registry)


def get_active_graph(
    dataset_manager: DatasetManager = Depends(get_dataset_manager),
) -> nx.Graph:
    if not dataset_manager.has_dataset():
        raise HTTPException(status_code=404, detail="No active dataset loaded")
    return dataset_manager.get_graph()
