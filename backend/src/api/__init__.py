from __future__ import annotations

from api.attributes import router as attributes_router
from api.data_sources import router as data_sources_router
from api.datasets import router as datasets_router
from api.fol import router as predicates_router
from api.learning import router as learning_router
from api.topology import router as topology_router

__all__ = [
    "datasets_router",
    "topology_router",
    "attributes_router",
    "predicates_router",
    "learning_router",
    "data_sources_router",
]
