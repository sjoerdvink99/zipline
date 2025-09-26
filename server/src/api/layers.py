from __future__ import annotations

from typing import Any, Dict, List, Optional

import networkx as nx
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.session import get_session
from layers import detect_patterns

router = APIRouter(prefix="/api/layers", tags=["layers"])


class SelectionRequest(BaseModel):
    selection_type: str = Field(..., description="node, edge, path, or subgraph")
    selected_ids: List[str] = Field(..., description="List of selected node IDs")
    session_id: str = Field(default="default")


class PatternResponse(BaseModel):
    patterns: List[Dict[str, Any]]


@router.get("/distributions")
async def get_attribute_distributions(session_id: str = "default"):
    state = get_session(session_id)
    if state.graph is None:
        raise HTTPException(status_code=400, detail="No graph loaded")

    G = state.graph
    distributions: Dict[str, Any] = {}

    all_attrs: Dict[str, List[Any]] = {}

    for node_id in G.nodes():
        node_data = G.nodes[node_id]
        for key, value in node_data.items():
            if key.startswith("_"):
                continue
            if key not in all_attrs:
                all_attrs[key] = []
            all_attrs[key].append((node_id, value))

    for attr_name, values in all_attrs.items():
        node_ids = [v[0] for v in values]
        attr_values = [v[1] for v in values]

        non_none = [(nid, v) for nid, v in zip(node_ids, attr_values) if v is not None]
        if not non_none:
            continue

        sample_value = non_none[0][1]

        if isinstance(sample_value, bool):
            true_nodes = [nid for nid, v in non_none if v is True]
            false_nodes = [nid for nid, v in non_none if v is False]
            distributions[attr_name] = {
                "type": "boolean",
                "values": [
                    {"label": "True", "count": len(true_nodes), "node_ids": true_nodes},
                    {"label": "False", "count": len(false_nodes), "node_ids": false_nodes},
                ],
            }
        elif isinstance(sample_value, (int, float)):
            numeric_values = [(nid, float(v)) for nid, v in non_none if isinstance(v, (int, float))]
            if not numeric_values:
                continue

            vals = [v for _, v in numeric_values]
            min_val, max_val = min(vals), max(vals)

            n_bins = min(10, len(set(vals)))
            if n_bins < 2 or min_val == max_val:
                distributions[attr_name] = {
                    "type": "numeric",
                    "min": min_val,
                    "max": max_val,
                    "bins": [
                        {
                            "min": min_val,
                            "max": max_val,
                            "count": len(numeric_values),
                            "node_ids": [nid for nid, _ in numeric_values],
                        }
                    ],
                }
            else:
                bin_edges = np.linspace(min_val, max_val, n_bins + 1)
                bins = []
                for i in range(len(bin_edges) - 1):
                    bin_min = bin_edges[i]
                    bin_max = bin_edges[i + 1]
                    if i == len(bin_edges) - 2:
                        bin_nodes = [nid for nid, v in numeric_values if bin_min <= v <= bin_max]
                    else:
                        bin_nodes = [nid for nid, v in numeric_values if bin_min <= v < bin_max]
                    bins.append({
                        "min": float(bin_min),
                        "max": float(bin_max),
                        "count": len(bin_nodes),
                        "node_ids": bin_nodes,
                    })
                distributions[attr_name] = {
                    "type": "numeric",
                    "min": min_val,
                    "max": max_val,
                    "bins": bins,
                }
        elif isinstance(sample_value, str):
            value_counts: Dict[str, List[str]] = {}
            for nid, v in non_none:
                if isinstance(v, str):
                    if v not in value_counts:
                        value_counts[v] = []
                    value_counts[v].append(nid)

            sorted_values = sorted(value_counts.items(), key=lambda x: -len(x[1]))[:20]
            distributions[attr_name] = {
                "type": "categorical",
                "values": [
                    {"label": label, "count": len(nodes), "node_ids": nodes}
                    for label, nodes in sorted_values
                ],
                "total_unique": len(value_counts),
            }

    return {"distributions": distributions}


@router.get("/topological")
async def get_topological_distributions(session_id: str = "default"):
    state = get_session(session_id)
    if state.graph is None:
        raise HTTPException(status_code=400, detail="No graph loaded")

    G = state.graph
    distributions: Dict[str, Any] = {}

    degrees = dict(G.degree())
    node_ids = list(G.nodes())

    def add_discrete_distribution(metric_name: str, metric_dict: dict):
        metric_values = [(nid, metric_dict.get(nid, 0)) for nid in node_ids]
        vals = [v for _, v in metric_values]
        min_val, max_val = int(min(vals)), int(max(vals))

        unique_vals = sorted(set(vals))
        if len(unique_vals) <= 15:
            bins = []
            for val in unique_vals:
                val_int = int(val)
                bin_nodes = [nid for nid, v in metric_values if int(v) == val_int]
                bins.append({
                    "min": val_int,
                    "max": val_int,
                    "count": len(bin_nodes),
                    "node_ids": bin_nodes,
                })
        else:
            n_bins = min(12, max_val - min_val + 1)
            bin_size = max(1, (max_val - min_val + 1) // n_bins)
            bins = []
            for i in range(n_bins):
                bin_min = min_val + i * bin_size
                bin_max = min_val + (i + 1) * bin_size - 1 if i < n_bins - 1 else max_val
                bin_nodes = [nid for nid, v in metric_values if bin_min <= int(v) <= bin_max]
                if bin_nodes or i == 0 or i == n_bins - 1:
                    bins.append({
                        "min": bin_min,
                        "max": bin_max,
                        "count": len(bin_nodes),
                        "node_ids": bin_nodes,
                    })

        distributions[metric_name] = {
            "type": "numeric",
            "min": min_val,
            "max": max_val,
            "bins": bins,
        }

    if node_ids:
        add_discrete_distribution("degree", degrees)

        if G.is_directed():
            in_degrees = dict(G.in_degree())
            out_degrees = dict(G.out_degree())
            add_discrete_distribution("in_degree", in_degrees)
            add_discrete_distribution("out_degree", out_degrees)

        def add_metric_distribution(metric_name: str, metric_dict: dict):
            metric_values = [(nid, metric_dict.get(nid, 0.0)) for nid in node_ids]
            vals = [v for _, v in metric_values]
            min_val, max_val = min(vals), max(vals)

            if min_val == max_val:
                distributions[metric_name] = {
                    "type": "numeric",
                    "min": float(min_val),
                    "max": float(max_val),
                    "bins": [{
                        "min": float(min_val),
                        "max": float(max_val),
                        "count": len(metric_values),
                        "node_ids": [nid for nid, _ in metric_values],
                    }],
                }
            else:
                n_bins = min(10, len(set(vals)))
                bin_edges = np.linspace(min_val, max_val, n_bins + 1)
                bins = []
                for i in range(len(bin_edges) - 1):
                    bin_min = bin_edges[i]
                    bin_max = bin_edges[i + 1]
                    if i == len(bin_edges) - 2:
                        bin_nodes = [nid for nid, v in metric_values if bin_min <= v <= bin_max]
                    else:
                        bin_nodes = [nid for nid, v in metric_values if bin_min <= v < bin_max]
                    bins.append({
                        "min": float(bin_min),
                        "max": float(bin_max),
                        "count": len(bin_nodes),
                        "node_ids": bin_nodes,
                    })
                distributions[metric_name] = {
                    "type": "numeric",
                    "min": float(min_val),
                    "max": float(max_val),
                    "bins": bins,
                }

        try:
            betweenness = nx.betweenness_centrality(G)
            add_metric_distribution("centrality", betweenness)
        except Exception:
            pass

    return {"distributions": distributions}


@router.post("/patterns", response_model=PatternResponse)
async def detect_patterns_endpoint(req: SelectionRequest):
    state = get_session(req.session_id)
    if state.graph is None:
        raise HTTPException(status_code=400, detail="No graph loaded")

    patterns = detect_patterns(
        state.graph, req.selection_type, req.selected_ids, None, None
    )

    state.detected_patterns = patterns

    return PatternResponse(
        patterns=[
            {
                "index": i,
                "id": p.definition.id,
                "name": p.definition.name,
                "type": p.definition.pattern_type.value,
                "level": p.definition.level,
                "description": p.definition.description,
                "confidence": p.confidence,
                "score": p.score,
                "size": p.size,
                "nodes": list(p.node_ids),
                "edges": [list(e) for e in p.edge_keys],
                "features": p.features,
                "center_node": p.center_node,
                "hub_nodes": p.hub_nodes,
                "boundary_nodes": p.boundary_nodes,
            }
            for i, p in enumerate(patterns)
        ]
    )


class QueryNodesRequest(BaseModel):
    attribute: str
    attribute_type: str = Field(..., description="numeric, categorical, or boolean")
    operator: str = Field(..., description="=, !=, >, <, >=, <=, between")
    value: Any
    value2: Optional[Any] = None
    category: str = Field(default="attribute", description="attribute or topological")


class QueryNodesResponse(BaseModel):
    node_ids: List[str]
    count: int


@router.post("/query-nodes", response_model=QueryNodesResponse)
async def query_nodes_by_predicate(req: QueryNodesRequest, session_id: str = "default"):
    state = get_session(session_id)
    if state.graph is None:
        raise HTTPException(status_code=400, detail="No graph loaded")

    G = state.graph
    matching_nodes: List[str] = []

    if req.category == "topological":
        if req.attribute == "degree":
            values = {str(n): d for n, d in G.degree()}
        elif req.attribute == "in_degree" and G.is_directed():
            values = {str(n): d for n, d in G.in_degree()}
        elif req.attribute == "out_degree" and G.is_directed():
            values = {str(n): d for n, d in G.out_degree()}
        elif req.attribute == "centrality":
            try:
                centrality = nx.betweenness_centrality(G)
                values = {str(n): v for n, v in centrality.items()}
            except Exception:
                values = {}
        else:
            values = {}
    else:
        values = {}
        for node_id in G.nodes():
            node_data = G.nodes[node_id]
            if req.attribute in node_data:
                values[str(node_id)] = node_data[req.attribute]

    for node_id, node_value in values.items():
        if node_value is None:
            continue

        matches = False
        try:
            if req.attribute_type == "numeric":
                node_val = float(node_value)
                req_val = float(req.value)

                if req.operator == "=":
                    matches = node_val == req_val
                elif req.operator == "!=":
                    matches = node_val != req_val
                elif req.operator == ">":
                    matches = node_val > req_val
                elif req.operator == "<":
                    matches = node_val < req_val
                elif req.operator == ">=":
                    matches = node_val >= req_val
                elif req.operator == "<=":
                    matches = node_val <= req_val
                elif req.operator == "between" and req.value2 is not None:
                    req_val2 = float(req.value2)
                    matches = req_val <= node_val <= req_val2

            elif req.attribute_type == "categorical":
                if req.operator == "=":
                    matches = str(node_value) == str(req.value)
                elif req.operator == "!=":
                    matches = str(node_value) != str(req.value)
                elif req.operator == "in":
                    if isinstance(req.value, list):
                        matches = str(node_value) in [str(v) for v in req.value]
                    else:
                        matches = str(node_value) == str(req.value)

            elif req.attribute_type == "boolean":
                node_bool = bool(node_value)
                req_bool = req.value if isinstance(req.value, bool) else str(req.value).lower() in ("true", "yes", "1")
                if req.operator == "=":
                    matches = node_bool == req_bool
                elif req.operator == "!=":
                    matches = node_bool != req_bool

        except (ValueError, TypeError):
            continue

        if matches:
            matching_nodes.append(node_id)

    return QueryNodesResponse(node_ids=matching_nodes, count=len(matching_nodes))
