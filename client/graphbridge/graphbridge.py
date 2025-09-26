from __future__ import annotations

import webbrowser
from dataclasses import dataclass, field
from typing import Any

import networkx as nx
import requests

LABEL_ATTRS = ("label", "kind", "type", "category", "node_type", "node_label")
EDGE_TYPE_ATTRS = ("type", "kind", "label", "edge_type", "relationship")


def _get_node_label(attrs: dict[str, Any]) -> str:
    for attr in LABEL_ATTRS:
        if attr in attrs and attrs[attr] is not None:
            val = attrs[attr]
            if isinstance(val, (int, float)):
                continue
            return str(val)
    return "node"


def _get_edge_type(attrs: dict[str, Any]) -> str:
    for attr in EDGE_TYPE_ATTRS:
        if attr in attrs and attrs[attr] is not None:
            val = attrs[attr]
            if isinstance(val, (int, float)):
                continue
            return str(val)
    return ""


def _serialize_graph(
    G: nx.Graph,
    default_label: str | None = None,
    label_attr: str | None = None,
    edge_type_attr: str | None = None,
) -> dict[str, Any]:
    nodes = []
    for node_id in G.nodes():
        attrs = dict(G.nodes[node_id])

        if label_attr and label_attr in attrs:
            label = str(attrs[label_attr])
        else:
            label = _get_node_label(attrs)
            if label == "node" and default_label:
                label = default_label

        node_data = {"id": str(node_id), "label": label}
        for key, value in attrs.items():
            if key not in LABEL_ATTRS and key != label_attr:
                node_data[key] = value
        nodes.append(node_data)

    edges = []
    for u, v, attrs in G.edges(data=True):
        edge_data = {"source": str(u), "target": str(v)}

        if edge_type_attr and edge_type_attr in attrs:
            edge_data["label"] = str(attrs[edge_type_attr])
        else:
            edge_type = _get_edge_type(attrs)
            if edge_type:
                edge_data["label"] = edge_type

        for key, value in attrs.items():
            if key not in EDGE_TYPE_ATTRS and key != edge_type_attr:
                edge_data[key] = value
        edges.append(edge_data)

    return {"nodes": nodes, "links": edges}


@dataclass
class Pattern:
    id: str
    name: str
    pattern_type: str
    nodes: list[str]
    edges: list[tuple[str, str]]
    confidence: float
    score: float
    features: dict[str, Any] = field(default_factory=dict)
    center_node: str | None = None

    def to_subgraph(self, G: nx.Graph) -> nx.Graph:
        return G.subgraph(self.nodes).copy()

    def __repr__(self) -> str:
        return f"Pattern({self.name!r}, type={self.pattern_type!r}, nodes={len(self.nodes)})"


class GraphBridge:
    def __init__(
        self,
        host: str = "localhost",
        api_port: int = 5178,
        frontend_port: int | None = None,
    ):
        self.host = host
        self.api_port = api_port
        self.frontend_port = frontend_port or api_port
        self.base_url = f"http://{host}:{api_port}"
        self.frontend_url = f"http://{host}:{self.frontend_port}"
        self._graph: nx.Graph | None = None

    def health(self) -> bool:
        try:
            resp = requests.get(f"{self.base_url}/health", timeout=2)
            return resp.status_code == 200
        except requests.RequestException:
            return False

    def load(
        self,
        G: nx.Graph,
        default_node_label: str | None = None,
        node_label_attr: str | None = None,
        edge_type_attr: str | None = None,
    ) -> dict[str, Any]:
        self._graph = G
        payload = _serialize_graph(G, default_node_label, node_label_attr, edge_type_attr)
        resp = requests.post(f"{self.base_url}/api/graph/upload", json=payload)
        resp.raise_for_status()
        return resp.json()

    def open(self) -> None:
        webbrowser.open(self.frontend_url)

    def get_patterns(self) -> list[Pattern]:
        resp = requests.get(f"{self.base_url}/api/layers/patterns")
        resp.raise_for_status()
        data = resp.json()

        return [
            Pattern(
                id=p.get("id", ""),
                name=p.get("name", ""),
                pattern_type=p.get("pattern_type", ""),
                nodes=list(p.get("nodes", [])),
                edges=[(e[0], e[1]) for e in p.get("edges", [])],
                confidence=p.get("confidence", 0.0),
                score=p.get("score", 0.0),
                features=p.get("features", {}),
                center_node=p.get("center_node"),
            )
            for p in data.get("patterns", [])
        ]

    def get_graph(self) -> nx.Graph | None:
        return self._graph

    def get_summary(self) -> dict[str, Any]:
        resp = requests.get(f"{self.base_url}/api/graph/summary")
        resp.raise_for_status()
        return resp.json()
