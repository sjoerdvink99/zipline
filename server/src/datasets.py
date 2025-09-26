from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional

import networkx as nx

__all__ = [
    "GraphMeta",
    "DatasetRegistry",
    "datasets",
]


@dataclass
class GraphMeta:
    name: str
    desc: str


class DatasetRegistry:
    def __init__(self):
        self.graphs: Dict[str, nx.Graph] = {}
        self.meta: Dict[str, GraphMeta] = {}
        self.active_graph: Optional[str] = None

    def set(self, name: str, G: nx.Graph, desc: str = ""):
        self.graphs[name] = G
        self.meta[name] = GraphMeta(name=name, desc=desc)
        if self.active_graph is None:
            self.active_graph = name

    def set_active(self, name: str) -> bool:
        if name in self.graphs:
            self.active_graph = name
            return True
        return False

    @property
    def active(self) -> Optional[nx.Graph]:
        return self.graphs.get(self.active_graph) if self.active_graph else None


datasets = DatasetRegistry()
