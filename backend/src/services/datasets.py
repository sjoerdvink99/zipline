from __future__ import annotations

from dataclasses import dataclass

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
    def __init__(self) -> None:
        self.graphs: dict[str, nx.Graph] = {}
        self.meta: dict[str, GraphMeta] = {}
        self.active_graph: str | None = None

    def set(self, name: str, G: nx.Graph, desc: str = "") -> None:
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
    def active(self) -> nx.Graph | None:
        if self.active_graph and self.active_graph in self.graphs:
            return self.graphs[self.active_graph]
        return None

    def clear(self) -> None:
        self.graphs.clear()
        self.meta.clear()
        self.active_graph = None


datasets = DatasetRegistry()
