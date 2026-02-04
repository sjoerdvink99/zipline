from __future__ import annotations

import weakref
from dataclasses import dataclass
from typing import Any

import networkx as nx

_schema_cache: dict[int, dict[str, set[tuple[str, str]]]] = {}
_schema_graph_refs: dict[int, weakref.ref] = {}


def get_edge_schema(graph: nx.Graph) -> dict[str, set[tuple[str, str]]]:
    graph_id = id(graph)
    ref = _schema_graph_refs.get(graph_id)
    if ref is not None and ref() is None:
        del _schema_cache[graph_id]
        del _schema_graph_refs[graph_id]
    if graph_id not in _schema_cache:
        _schema_cache[graph_id] = extract_edge_schema(graph)
        _schema_graph_refs[graph_id] = weakref.ref(graph)
    return _schema_cache[graph_id]


@dataclass(frozen=True)
class EdgeStep:
    edge_type: str


def _get_node_type(graph: nx.Graph, node_id: Any) -> str:
    data = graph.nodes.get(node_id, {})
    return data.get("node_type") or data.get("type") or data.get("label") or "unknown"


def extract_edge_schema(graph: nx.Graph) -> dict[str, set[tuple[str, str]]]:
    schema: dict[str, set[tuple[str, str]]] = {}
    for u, v, data in graph.edges(data=True):
        edge_type = data.get("edge_type", "related")
        u_type = _get_node_type(graph, u)
        v_type = _get_node_type(graph, v)
        schema.setdefault(edge_type, set())
        schema[edge_type].add((u_type, v_type))
        if not graph.is_directed():
            schema[edge_type].add((v_type, u_type))
    return schema


def enumerate_2hop_paths(
    schema: dict[str, set[tuple[str, str]]],
    exclude_sibling_bridges: bool = True,
) -> list[tuple[EdgeStep, EdgeStep]]:
    all_schema_steps: list[tuple[str, str, str]] = [
        (et, src, tgt) for et, pairs in schema.items() for src, tgt in pairs
    ]

    sibling_bridge_keys: set[tuple[str, str]] = set()
    if exclude_sibling_bridges:
        for et1, src1, tgt1 in all_schema_steps:
            for et2, src2, tgt2 in all_schema_steps:
                if tgt1 != src2:
                    continue
                if src1 == tgt2:
                    sibling_bridge_keys.add((et1, et2))

    paths_dict: dict[tuple[str, str], tuple[EdgeStep, EdgeStep]] = {}
    for et1, _src1, tgt1 in all_schema_steps:
        for et2, src2, _tgt2 in all_schema_steps:
            if tgt1 != src2:
                continue
            key = (et1, et2)
            if key in sibling_bridge_keys:
                continue
            if key not in paths_dict:
                paths_dict[key] = (EdgeStep(et1), EdgeStep(et2))

    return list(paths_dict.values())
