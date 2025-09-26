from __future__ import annotations

import math
from typing import Any

import networkx as nx
from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel

from core.session import get_session
from datasets import datasets

router = APIRouter()


@router.get("/list")
def list_graphs():
    return {
        "graphs": list(datasets.graphs.keys()),
        "active": datasets.active_graph,
        "meta": {k: {"name": v.name, "desc": v.desc} for k, v in datasets.meta.items()},
    }


@router.post("/switch")
def switch_graph(name: str = Body(..., embed=True)):
    ok = datasets.set_active(name)
    if ok:
        session = get_session()
        session.graph = datasets.active
        return {"ok": True, "active": datasets.active_graph}
    return {"ok": False, "error": f"Graph '{name}' not found."}


@router.post("/upload")
def upload_graph(data: dict[str, Any] = Body(...)):
    try:
        G = nx.Graph()

        if "nodes" in data:
            for node in data["nodes"]:
                if isinstance(node, dict):
                    node_id = str(node.get("id", node.get("data", {}).get("id", "")))
                    attrs = {k: v for k, v in node.items() if k != "id"}
                    G.add_node(node_id, **attrs)
                else:
                    G.add_node(str(node))

        links = data.get("links", data.get("edges", []))
        for edge in links:
            if isinstance(edge, dict):
                u = str(edge.get("source", edge.get("data", {}).get("source", "")))
                v = str(edge.get("target", edge.get("data", {}).get("target", "")))
                attrs = {k: v for k, v in edge.items() if k not in ("source", "target")}
                G.add_edge(u, v, **attrs)
            elif isinstance(edge, (list, tuple)) and len(edge) >= 2:
                G.add_edge(str(edge[0]), str(edge[1]))

        if G.number_of_nodes() == 0:
            raise HTTPException(400, "Graph has no nodes")

        datasets.set("uploaded", G, "User-uploaded graph")
        datasets.set_active("uploaded")
        session = get_session()
        session.graph = G
        return {
            "n_nodes": G.number_of_nodes(),
            "n_edges": G.number_of_edges(),
        }
    except Exception as e:
        raise HTTPException(400, f"Failed to parse graph: {str(e)}")


@router.get("/summary")
def graph_summary():
    G = datasets.active
    if G is None:
        return {
            "directed": False,
            "n_nodes": 0,
            "n_edges": 0,
            "active": datasets.active_graph,
            "node_types": {},
            "density": 0,
            "avg_degree": 0,
        }

    node_types: dict[str, int] = {}
    for node in G.nodes:
        label = G.nodes[node].get("label", G.nodes[node].get("kind", "unknown"))
        node_types[label] = node_types.get(label, 0) + 1

    n_nodes = G.number_of_nodes()
    n_edges = G.number_of_edges()

    density = 0.0
    avg_degree = 0.0
    if n_nodes > 1:
        density = (2 * n_edges) / (n_nodes * (n_nodes - 1)) if not G.is_directed() else n_edges / (n_nodes * (n_nodes - 1))
    if n_nodes > 0:
        avg_degree = (2 * n_edges) / n_nodes if not G.is_directed() else n_edges / n_nodes

    return {
        "directed": G.is_directed(),
        "n_nodes": n_nodes,
        "n_edges": n_edges,
        "active": datasets.active_graph,
        "node_types": node_types,
        "density": round(density, 4),
        "avg_degree": round(avg_degree, 2),
    }


@router.get("/elements")
def graph_elements():
    G = datasets.active
    if G is None or G.number_of_nodes() == 0:
        return {"nodes": [], "edges": [], "graph": datasets.active_graph}
    n = len(G.nodes)
    cols = max(1, math.ceil(math.sqrt(n)))
    spacing = 80
    nodes = []
    for idx, node in enumerate(G.nodes):
        row, col = divmod(idx, cols)
        node_id = str(node)
        node_attrs = dict(G.nodes[node])
        label = str(node_attrs.pop("label", node_attrs.pop("kind", node_attrs.pop("type", node_id))))
        data = {"id": node_id, "label": label, **node_attrs}
        nodes.append({"data": data, "position": {"x": col * spacing, "y": row * spacing}})
    edges = []
    for i, (u, v) in enumerate(G.edges):
        edge_attrs = dict(G.edges[u, v])
        edge_id = f"e{i}:{str(u)}->{str(v)}"
        label = str(edge_attrs.pop("label", edge_attrs.pop("kind", edge_attrs.pop("type", ""))))
        data = {"id": edge_id, "source": str(u), "target": str(v), "label": label, **edge_attrs}
        edges.append({"data": data})
    return {"nodes": nodes, "edges": edges, "graph": datasets.active_graph}


class HopConstraint(BaseModel):
    hop_index: int | str
    target: str
    attribute: str
    operator: str
    value: str | int | float | bool
    value2: float | None = None


class PathQueryRequest(BaseModel):
    source: str
    target: str
    min_hops: int = 1
    max_hops: int = 4
    constraints: list[HopConstraint] = []
    combine_op: str = "intersection"
    limit: int = 100


def evaluate_constraint(value: Any, constraint: HopConstraint) -> bool:
    if value is None:
        return False

    try:
        op = constraint.operator
        target_val = constraint.value

        if op in (">", "<", ">=", "<=", "between"):
            try:
                num_value = float(value)
                num_target = float(target_val)
            except (ValueError, TypeError):
                return False

            if op == ">":
                return num_value > num_target
            elif op == "<":
                return num_value < num_target
            elif op == ">=":
                return num_value >= num_target
            elif op == "<=":
                return num_value <= num_target
            elif op == "between":
                val2 = constraint.value2
                if val2 is None:
                    return False
                return num_target <= num_value <= val2

        if op == "=":
            return str(value) == str(target_val)
        elif op == "!=":
            return str(value) != str(target_val)

        if op == "in":
            if isinstance(target_val, str):
                target_list = [s.strip() for s in target_val.split(",")]
            else:
                target_list = [str(target_val)]
            return str(value) in target_list

        return False
    except Exception:
        return False


def check_path_constraints(
    G: nx.Graph,
    path: list[str],
    constraints: list[HopConstraint],
    combine_op: str
) -> bool:
    if not constraints:
        return True

    results = []

    for constraint in constraints:
        hop_idx = constraint.hop_index
        target_type = constraint.target

        if target_type == "node":
            if hop_idx == "any":
                nodes_to_check = path
            else:
                idx = int(hop_idx)
                if idx < 0 or idx >= len(path):
                    results.append(False)
                    continue
                nodes_to_check = [path[idx]]

            node_results = []
            for node_id in nodes_to_check:
                node_attrs = G.nodes.get(node_id, {})
                attr_value = node_attrs.get(constraint.attribute)
                node_results.append(evaluate_constraint(attr_value, constraint))

            if hop_idx == "any":
                results.append(any(node_results) if node_results else False)
            else:
                results.append(all(node_results) if node_results else False)

        elif target_type == "edge":
            path_edges = [(path[i], path[i+1]) for i in range(len(path)-1)]

            if hop_idx == "any":
                edges_to_check = path_edges
            else:
                idx = int(hop_idx) - 1
                if idx < 0 or idx >= len(path_edges):
                    results.append(False)
                    continue
                edges_to_check = [path_edges[idx]]

            edge_results = []
            for u, v in edges_to_check:
                edge_data = G.get_edge_data(u, v) or {}
                attr_value = edge_data.get(constraint.attribute)
                edge_results.append(evaluate_constraint(attr_value, constraint))

            if hop_idx == "any":
                results.append(any(edge_results) if edge_results else False)
            else:
                results.append(all(edge_results) if edge_results else False)

    if combine_op == "union":
        return any(results) if results else True
    elif combine_op == "difference":
        if len(results) < 2:
            return results[0] if results else True
        return results[0] and not any(results[1:])
    else:
        return all(results) if results else True


@router.post("/find_paths")
def find_constrained_paths(request: PathQueryRequest):
    G = datasets.active
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
                if check_path_constraints(G, path_str, request.constraints, request.combine_op):
                    all_paths.append(path_str)
                    if len(all_paths) >= request.limit:
                        break
    except nx.NetworkXNoPath:
        pass
    except Exception as e:
        raise HTTPException(500, f"Error finding paths: {str(e)}")

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
