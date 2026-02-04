from __future__ import annotations

from difflib import SequenceMatcher
from typing import Any

import networkx as nx
from fastapi import APIRouter, Depends, HTTPException

from core.dataset_manager import DatasetManager
from core.dependencies import get_dataset_manager
from models import (
    NodeSearchRequest,
    PathFindingRequest,
    PathFindingResponse,
    PathQueryRequest,
    SearchResult,
)
from services.evaluation.constraint_evaluator import (
    check_path_constraints,
    validate_neighbor_constraint,
)
from services.path_finder import PathFinder
from utils.logging_config import get_logger
from utils.node_validation import validate_single_node_id

logger = get_logger("api.topology")

router = APIRouter()


@router.get("/elements")
def graph_elements(dm: DatasetManager = Depends(get_dataset_manager)) -> dict[str, Any]:
    G = dm.active

    logger.info(
        "Graph elements requested",
        extra={
            "graph_nodes": G.number_of_nodes() if G else 0,
            "graph_edges": G.number_of_edges() if G else 0,
            "dataset_name": dm.active_graph if dm.active_graph else "none",
        },
    )

    if G is None or G.number_of_nodes() == 0:
        logger.warning("No graph data available")
        return {"nodes": [], "edges": [], "graph": dm.active_graph}

    nodes = []

    for node in G.nodes:
        node_id = str(node)
        node_attrs = dict(G.nodes[node])
        label = str(
            node_attrs.pop(
                "display_name",
                node_attrs.pop(
                    "name",
                    node_attrs.pop(
                        "label", node_attrs.pop("kind", node_attrs.pop("type", node_id))
                    ),
                ),
            )
        )
        data = {"id": node_id, "label": label, **node_attrs}
        nodes.append({"data": data})

    edges = []
    for i, (u, v) in enumerate(G.edges):
        edge_attrs = dict(G.edges[u, v])
        edge_id = f"e{i}:{str(u)}->{str(v)}"
        label = str(
            edge_attrs.pop(
                "edge_type",
                edge_attrs.pop(
                    "label", edge_attrs.pop("kind", edge_attrs.pop("type", ""))
                ),
            )
        )
        data = {
            "id": edge_id,
            "source": str(u),
            "target": str(v),
            "label": label,
            **edge_attrs,
        }
        edges.append({"data": data})

    return {"nodes": nodes, "edges": edges, "graph": dm.active_graph}


@router.post("/find_paths")
def find_constrained_paths(
    request: PathQueryRequest, dm: DatasetManager = Depends(get_dataset_manager)
) -> dict[str, Any]:
    G = dm.active
    if G is None:
        raise HTTPException(400, "No active graph")

    source = request.source
    target = request.target

    if source not in G.nodes:
        raise HTTPException(404, f"Source node '{source}' not found")
    if target not in G.nodes:
        raise HTTPException(404, f"Target node '{target}' not found")

    min_hops = max(1, request.min_hops)
    max_hops = min(10, request.max_hops)

    all_paths = []
    try:
        for path in nx.all_simple_paths(G, source, target, cutoff=max_hops):
            path_len = len(path) - 1
            if path_len >= min_hops:
                path_str = [str(n) for n in path]
                if check_path_constraints(
                    G, path_str, request.constraints, request.combine_op
                ):
                    all_paths.append(path_str)
                    if len(all_paths) >= request.limit:
                        break
    except nx.NetworkXNoPath:
        pass
    except Exception as e:
        raise HTTPException(500, f"Error finding paths: {str(e)}") from e

    all_nodes = set()
    for path in all_paths:
        all_nodes.update(path)

    return {
        "paths": all_paths,
        "total_count": len(all_paths),
        "matching_nodes": list(all_nodes),
        "source": source,
        "target": target,
        "min_hops": min_hops,
        "max_hops": max_hops,
    }


def _calculate_similarity(text1: str, text2: str) -> float:
    return SequenceMatcher(None, text1.lower(), text2.lower()).ratio()


def _get_node_label(node_attrs: dict[str, Any], node_id: str) -> str:
    for label_key in ["display_name", "name", "label", "title", "kind", "type"]:
        if label_key in node_attrs:
            return str(node_attrs[label_key])
    return node_id


def _search_node_attributes(
    node_attrs: dict[str, Any], query: str
) -> tuple[float, list[str]]:
    best_score = 0.0
    highlights = []
    query_lower = query.lower()

    for key, value in node_attrs.items():
        if isinstance(value, str | int | float | bool):
            value_str = str(value).lower()

            if query_lower in value_str:
                score = 0.8 if query_lower == value_str else 0.6
                if score > best_score:
                    best_score = score
                    highlights = [f"{key}: {value}"]

            elif isinstance(value, str) and len(value) > 2:
                similarity = _calculate_similarity(query_lower, value_str)
                if similarity > 0.4:
                    score = similarity * 0.5
                    if score > best_score:
                        best_score = score
                        highlights = [f"{key}: {value}"]

    return best_score, highlights


@router.post("/search")
def search_nodes(
    request: NodeSearchRequest, dm: DatasetManager = Depends(get_dataset_manager)
) -> dict[str, Any]:
    if request.dataset and request.dataset != dm.active_graph:
        return {
            "results": [],
            "total_count": 0,
            "query": request.query,
            "limit": request.limit,
            "error": f"Requested dataset '{request.dataset}' is not active. Current active dataset: '{dm.active_graph}'. Please switch to the correct dataset first.",
            "active_dataset": dm.active_graph,
            "requested_dataset": request.dataset,
        }

    G = dm.active
    if G is None or G.number_of_nodes() == 0:
        return {
            "results": [],
            "total_count": 0,
            "query": request.query,
            "limit": request.limit,
            "error": "No graph is currently loaded. Please load a graph first to search for nodes.",
            "active_dataset": dm.active_graph,
            "requested_dataset": request.dataset,
        }

    current_dataset = dm.active_graph or "unknown"

    query = request.query.strip()
    if not query:
        return {"results": [], "total_count": 0}

    results = []
    query_lower = query.lower()

    for node_id in G.nodes():
        node_attrs = dict(G.nodes[node_id])
        node_id_str = str(node_id)
        node_label = _get_node_label(node_attrs, node_id_str)

        score = 0.0
        match_type = "none"
        highlights = []

        if query_lower == node_id_str.lower():
            score = 1.0
            match_type = "exact_id"
            highlights = [f"ID: {node_id_str}"]

        elif query_lower in node_id_str.lower():
            if node_id_str.lower().startswith(query_lower):
                score = 0.9
            else:
                score = 0.7
            match_type = "partial_id"
            highlights = [f"ID: {node_id_str}"]

        elif query_lower == node_label.lower():
            score = 0.85
            match_type = "exact_label"
            highlights = [f"Label: {node_label}"]

        elif query_lower in node_label.lower():
            if node_label.lower().startswith(query_lower):
                score = 0.8
            else:
                score = 0.6
            match_type = "partial_label"
            highlights = [f"Label: {node_label}"]

        else:
            attr_score, attr_highlights = _search_node_attributes(node_attrs, query)
            if attr_score > 0:
                score = attr_score
                match_type = "attribute"
                highlights = attr_highlights

        if score == 0.0 and not request.exact_match:
            id_similarity = _calculate_similarity(query_lower, node_id_str.lower())
            label_similarity = _calculate_similarity(query_lower, node_label.lower())

            best_similarity = max(id_similarity, label_similarity)
            if best_similarity > 0.3:
                score = best_similarity * 0.4
                match_type = "fuzzy"
                if label_similarity > id_similarity:
                    highlights = [f"Label: {node_label}"]
                else:
                    highlights = [f"ID: {node_id_str}"]

        if score > 0.0:
            preview_attrs = {
                k: v
                for k, v in node_attrs.items()
                if not k.startswith("_") and k not in ["label", "name", "title"]
            }

            if len(preview_attrs) > 3:
                preview_attrs = dict(list(preview_attrs.items())[:3])

            result = SearchResult(
                node_id=node_id_str,
                label=node_label,
                score=score,
                match_type=match_type,
                attributes=preview_attrs,
                highlights=highlights,
            )
            results.append(result)

    results.sort(key=lambda x: x.score, reverse=True)
    limited_results = results[: request.limit]

    return {
        "results": [result.model_dump() for result in limited_results],
        "total_count": len(results),
        "query": query,
        "limit": request.limit,
        "active_dataset": current_dataset,
        "requested_dataset": request.dataset,
    }


@router.get("/schema")
def get_graph_schema(
    dm: DatasetManager = Depends(get_dataset_manager),
) -> dict[str, Any]:
    G = dm.active
    if G is None:
        raise HTTPException(status_code=404, detail="No graph loaded")

    node_attributes: dict[str, dict[str, Any]] = {}
    edge_attributes: dict[str, dict[str, Any]] = {}

    for node_id in G.nodes():
        node_attrs = dict(G.nodes[node_id])
        for attr_name, value in node_attrs.items():
            if attr_name not in node_attributes:
                node_attributes[attr_name] = {
                    "type": "categorical",
                    "values": set(),
                    "examples": [],
                }

            attr_info = node_attributes[attr_name]

            if isinstance(value, int | float):
                if attr_info["type"] == "categorical":
                    attr_info["type"] = "numeric"
            elif isinstance(value, bool):
                if attr_info["type"] == "categorical":
                    attr_info["type"] = "boolean"
            elif isinstance(value, list):
                attr_info["type"] = "array"

            if len(attr_info["values"]) < 100:
                attr_info["values"].add(str(value))

            if (
                len(attr_info["examples"]) < 10
                and str(value) not in attr_info["examples"]
            ):
                attr_info["examples"].append(str(value))

    for u, v in G.edges():
        edge_attrs = dict(G.edges[u, v])
        for attr_name, value in edge_attrs.items():
            if attr_name not in edge_attributes:
                edge_attributes[attr_name] = {
                    "type": "categorical",
                    "values": set(),
                    "examples": [],
                }

            attr_info = edge_attributes[attr_name]

            if isinstance(value, int | float):
                if attr_info["type"] == "categorical":
                    attr_info["type"] = "numeric"
            elif isinstance(value, bool):
                if attr_info["type"] == "categorical":
                    attr_info["type"] = "boolean"
            elif isinstance(value, list):
                attr_info["type"] = "array"

            if len(attr_info["values"]) < 100:
                attr_info["values"].add(str(value))

            if (
                len(attr_info["examples"]) < 10
                and str(value) not in attr_info["examples"]
            ):
                attr_info["examples"].append(str(value))

    for attr_info in node_attributes.values():
        attr_info["values"] = sorted(attr_info["values"])

    for attr_info in edge_attributes.values():
        attr_info["values"] = sorted(attr_info["values"])

    return {
        "node_attributes": node_attributes,
        "edge_attributes": edge_attributes,
        "topology_attributes": {
            "degree": {"type": "numeric", "values": [], "examples": ["1", "2", "5"]},
            "clustering": {
                "type": "numeric",
                "values": [],
                "examples": ["0.0", "0.5", "1.0"],
            },
            "centrality": {
                "type": "numeric",
                "values": [],
                "examples": ["0.0", "0.1", "0.9"],
            },
            "betweenness": {
                "type": "numeric",
                "values": [],
                "examples": ["0.0", "0.2", "0.8"],
            },
        },
    }


@router.get("/neighbor_values")
def get_neighbor_values(
    node_ids: str, attribute: str, dm: DatasetManager = Depends(get_dataset_manager)
) -> dict[str, Any]:
    G = dm.active
    if G is None:
        raise HTTPException(status_code=404, detail="No graph loaded")

    target_nodes = [n.strip() for n in node_ids.split(",") if n.strip()]
    if not target_nodes:
        raise HTTPException(status_code=400, detail="No node IDs provided")

    neighbor_values = set()

    all_neighbors = set()
    for node_id in target_nodes:
        if node_id in G.nodes:
            all_neighbors.update(G.neighbors(node_id))

    for neighbor in all_neighbors:
        if neighbor in G.nodes:
            node_attrs = dict(G.nodes[neighbor])
            if attribute in node_attrs:
                value = node_attrs[attribute]
                neighbor_values.add(str(value))

    return {
        "values": sorted(neighbor_values),
        "count": len(neighbor_values),
        "neighbor_count": len(all_neighbors),
    }


@router.post("/paths/find")
async def find_paths_between_nodes(
    request: PathFindingRequest, dm: DatasetManager = Depends(get_dataset_manager)
) -> PathFindingResponse:
    G = dm.active
    if G is None:
        return PathFindingResponse(
            success=False,
            paths=[],
            path_nodes=[],
            path_edges=[],
            algorithm_used=request.algorithm,
            total_paths=0,
            computation_time_ms=0.0,
            errors=["No active graph loaded"],
        )

    valid_source = validate_single_node_id(G, request.source_node, "path finding")
    if valid_source is None:
        error_msg = f"Source node '{request.source_node}' not found in graph"
        logger.warning(f"Path finding validation error: {error_msg}")
        return PathFindingResponse(
            success=False,
            paths=[],
            path_nodes=[],
            path_edges=[],
            algorithm_used=request.algorithm,
            total_paths=0,
            computation_time_ms=0.0,
            errors=[error_msg],
        )

    valid_target = validate_single_node_id(G, request.target_node, "path finding")
    if valid_target is None:
        error_msg = f"Target node '{request.target_node}' not found in graph"
        logger.warning(f"Path finding validation error: {error_msg}")
        return PathFindingResponse(
            success=False,
            paths=[],
            path_nodes=[],
            path_edges=[],
            algorithm_used=request.algorithm,
            total_paths=0,
            computation_time_ms=0.0,
            errors=[error_msg],
        )

    if valid_source != request.source_node:
        logger.info(
            f"Path finding: mapped source '{request.source_node}' → '{valid_source}'"
        )
    if valid_target != request.target_node:
        logger.info(
            f"Path finding: mapped target '{request.target_node}' → '{valid_target}'"
        )

    try:
        path_finder = PathFinder(G)
        result = path_finder.find_paths_between_nodes(
            source=valid_source,
            target=valid_target,
            algorithm=request.algorithm,
            max_paths=request.max_paths,
            min_path_length=request.min_path_length,
            max_path_length=request.max_path_length,
        )

        path_edges_dict = [
            {"source": edge[0], "target": edge[1]} for edge in result.path_edges
        ]

        logger.info(
            "Path finding completed",
            extra={
                "source": request.source_node,
                "target": request.target_node,
                "algorithm": request.algorithm,
                "paths_found": len(result.paths),
                "unique_nodes": len(result.path_nodes),
                "computation_time_ms": result.total_computation_time_ms,
            },
        )

        return PathFindingResponse(
            success=True,
            paths=result.paths,
            path_nodes=list(result.path_nodes),
            path_edges=path_edges_dict,
            algorithm_used=result.algorithm_used,
            total_paths=result.max_paths_found,
            computation_time_ms=result.total_computation_time_ms,
        )

    except ValueError as e:
        logger.warning(f"Path finding validation error: {e}")
        return PathFindingResponse(
            success=False,
            paths=[],
            path_nodes=[],
            path_edges=[],
            algorithm_used=request.algorithm,
            total_paths=0,
            computation_time_ms=0.0,
            errors=[str(e)],
        )
    except Exception as e:
        logger.error(f"Path finding unexpected error: {e}")
        return PathFindingResponse(
            success=False,
            paths=[],
            path_nodes=[],
            path_edges=[],
            algorithm_used=request.algorithm,
            total_paths=0,
            computation_time_ms=0.0,
            errors=["Internal server error during path finding"],
        )


@router.get("/validate_neighbor_constraint")
def validate_neighbor_constraint_endpoint(
    node_ids: str,
    attribute: str,
    operator: str = "=",
    value: str = "",
    dm: DatasetManager = Depends(get_dataset_manager),
) -> dict[str, Any]:
    G = dm.active
    if G is None:
        raise HTTPException(status_code=404, detail="No graph loaded")

    target_nodes = [n.strip() for n in node_ids.split(",") if n.strip()]
    return validate_neighbor_constraint(G, target_nodes, attribute, operator, value)
