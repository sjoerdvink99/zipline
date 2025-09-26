from __future__ import annotations

from api.attributes import router as attributes_router
from api.datasets import router as datasets_router
from api.patterns import router as patterns_router
from api.predicates import router as predicates_router
from api.topology import router as topology_router

__all__ = [
    "datasets_router",
    "topology_router",
    "attributes_router",
    "patterns_router",
    "predicates_router",
]
