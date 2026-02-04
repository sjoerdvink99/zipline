from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any

import networkx as nx

_DISPLAY_NAME_KEYS = ("name", "title", "label", "display_name")
_TYPE_KEYS = ("type", "category", "kind", "class")
_EDGE_TYPE_KEYS = ("type", "label", "relationship", "kind")
_FALLBACK_NODE_TYPE = "node"
_FALLBACK_EDGE_TYPE = "edge"


def import_json_graph(content: bytes) -> nx.Graph:
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON: {e}") from e

    if not isinstance(data, dict):
        raise ValueError("JSON must be an object with 'nodes' and 'links'/'edges' keys")

    nodes = data.get("nodes") or []
    links = data.get("links") or data.get("edges") or []

    if not isinstance(nodes, list):
        raise ValueError("'nodes' must be an array")
    if not isinstance(links, list):
        raise ValueError("'links'/'edges' must be an array")

    G = nx.Graph()

    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_id = node.get("id")
        if not node_id:
            continue
        node_id = str(node_id)
        attrs = {k: v for k, v in node.items() if k != "id"}
        _ensure_node_attrs(attrs, node_id)
        G.add_node(node_id, **attrs)

    for edge in links:
        if not isinstance(edge, dict):
            continue
        source = edge.get("source")
        target = edge.get("target")
        if not source or not target:
            continue
        source, target = str(source), str(target)
        if source not in G.nodes or target not in G.nodes:
            continue
        attrs = {k: v for k, v in edge.items() if k not in ("source", "target")}
        _ensure_edge_attrs(attrs)
        G.add_edge(source, target, **attrs)

    if G.number_of_nodes() == 0:
        raise ValueError("No valid nodes found — ensure each node has an 'id' field")

    return G


def import_graphml(content: bytes) -> nx.Graph:
    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".graphml", delete=False) as tmp:
            tmp.write(content)
            tmp_path = Path(tmp.name)
        try:
            G = nx.read_graphml(str(tmp_path))
        except Exception as e:
            raise ValueError(f"Failed to parse GraphML: {e}") from e
    finally:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)

    if isinstance(G, nx.DiGraph):
        G = G.to_undirected()

    for node_id, data in G.nodes(data=True):
        _ensure_node_attrs(data, str(node_id))

    for _u, _v, data in G.edges(data=True):
        _ensure_edge_attrs(data)

    if G.number_of_nodes() == 0:
        raise ValueError("GraphML contains no nodes")

    return G


def _ensure_node_attrs(attrs: dict[str, Any], fallback_id: str) -> None:
    if not attrs.get("node_type"):
        for key in _TYPE_KEYS:
            if attrs.get(key):
                attrs["node_type"] = str(attrs[key])
                break
        else:
            attrs["node_type"] = _FALLBACK_NODE_TYPE

    if not attrs.get("display_name"):
        for key in _DISPLAY_NAME_KEYS:
            if attrs.get(key):
                attrs["display_name"] = str(attrs[key])
                break
        else:
            attrs["display_name"] = fallback_id


def _ensure_edge_attrs(attrs: dict[str, Any]) -> None:
    if not attrs.get("edge_type"):
        for key in _EDGE_TYPE_KEYS:
            if attrs.get(key):
                attrs["edge_type"] = str(attrs[key])
                break
        else:
            attrs["edge_type"] = _FALLBACK_EDGE_TYPE
