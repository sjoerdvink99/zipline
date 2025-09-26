from __future__ import annotations

from typing import Any

import networkx as nx
import numpy as np


def compute_structural_features(
    graph: nx.Graph,
    cache: dict[str, dict[str, float]] | None = None,
) -> dict[str, dict[str, float]]:
    if cache is not None:
        return cache

    n = graph.number_of_nodes()
    if n == 0:
        return {}

    features: dict[str, dict[str, float]] = {str(node): {} for node in graph.nodes()}

    degrees = dict(graph.degree())
    for node, deg in degrees.items():
        features[str(node)]["degree"] = float(deg)

    if graph.is_directed():
        in_degrees = dict(graph.in_degree())
        out_degrees = dict(graph.out_degree())
        for node in graph.nodes():
            features[str(node)]["in_degree"] = float(in_degrees.get(node, 0))
            features[str(node)]["out_degree"] = float(out_degrees.get(node, 0))

    if n < 5000:
        try:
            betweenness = nx.betweenness_centrality(graph)
            for node, bc in betweenness.items():
                features[str(node)]["betweenness_centrality"] = float(bc)
        except Exception:
            pass
    else:
        try:
            k = min(100, n)
            betweenness = nx.betweenness_centrality(graph, k=k)
            for node, bc in betweenness.items():
                features[str(node)]["betweenness_centrality"] = float(bc)
        except Exception:
            pass

    try:
        if graph.is_directed():
            clustering = nx.clustering(graph.to_undirected())
        else:
            clustering = nx.clustering(graph)
        for node, cc in clustering.items():
            features[str(node)]["clustering_coefficient"] = float(cc)
    except Exception:
        pass

    try:
        pagerank = nx.pagerank(graph, max_iter=50)
        for node, pr in pagerank.items():
            features[str(node)]["pagerank"] = float(pr)
    except Exception:
        pass

    try:
        if graph.is_directed():
            kcore = nx.core_number(graph.to_undirected())
        else:
            kcore = nx.core_number(graph)
        for node, k in kcore.items():
            features[str(node)]["k_core"] = float(k)
    except Exception:
        pass

    try:
        if graph.is_directed():
            triangles = nx.triangles(graph.to_undirected())
        else:
            triangles = nx.triangles(graph)
        for node, t in triangles.items():
            features[str(node)]["triangle_count"] = float(t)
    except Exception:
        pass

    _compute_neighborhood_features(graph, features, degrees)

    return features


def _compute_neighborhood_features(
    graph: nx.Graph,
    features: dict[str, dict[str, float]],
    degrees: dict[Any, int],
) -> None:
    all_degrees = list(degrees.values())
    median_degree = float(np.median(all_degrees)) if all_degrees else 1.0

    node_labels = {}
    for node in graph.nodes():
        node_data = graph.nodes[node]
        label = node_data.get("label", node_data.get("kind", node_data.get("type")))
        if label is not None:
            node_labels[node] = str(label)

    for node in graph.nodes():
        node_str = str(node)
        neighbors = list(graph.neighbors(node))

        if not neighbors:
            features[node_str]["avg_neighbor_degree"] = 0.0
            features[node_str]["max_neighbor_degree"] = 0.0
            features[node_str]["min_neighbor_degree"] = 0.0
            features[node_str]["neighbor_degree_std"] = 0.0
            features[node_str]["neighbor_count_high_degree"] = 0.0
            features[node_str]["neighbor_homogeneity"] = 1.0
            continue

        neighbor_degrees = [degrees.get(n, 0) for n in neighbors]

        features[node_str]["avg_neighbor_degree"] = float(np.mean(neighbor_degrees))
        features[node_str]["max_neighbor_degree"] = float(max(neighbor_degrees))
        features[node_str]["min_neighbor_degree"] = float(min(neighbor_degrees))
        features[node_str]["neighbor_degree_std"] = float(np.std(neighbor_degrees))

        high_degree_count = sum(1 for d in neighbor_degrees if d > median_degree)
        features[node_str]["neighbor_count_high_degree"] = float(high_degree_count)

        if node in node_labels:
            node_label = node_labels[node]
            same_label_count = sum(
                1 for n in neighbors if node_labels.get(n) == node_label
            )
            features[node_str]["neighbor_homogeneity"] = same_label_count / len(
                neighbors
            )
        else:
            features[node_str]["neighbor_homogeneity"] = 0.0


EXCLUDED_NODE_ATTRIBUTES = {
    "cluster_id",
    "community",
    "community_id",
    "partition",
    "module",
}


def get_node_attributes(graph: nx.Graph) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}

    for node in graph.nodes():
        node_data = graph.nodes[node]
        result[str(node)] = {
            k: v
            for k, v in node_data.items()
            if not k.startswith("_")
            and v is not None
            and k not in EXCLUDED_NODE_ATTRIBUTES
        }

    return result


def infer_attribute_types(
    attributes: dict[str, dict[str, Any]],
) -> dict[str, str]:
    attr_values: dict[str, list] = {}

    for node_attrs in attributes.values():
        for attr, value in node_attrs.items():
            if attr not in attr_values:
                attr_values[attr] = []
            if value is not None:
                attr_values[attr].append(value)

    types: dict[str, str] = {}

    for attr, values in attr_values.items():
        if not values:
            continue

        sample = values[0]

        if isinstance(sample, bool):
            types[attr] = "boolean"
        elif isinstance(sample, int | float):
            types[attr] = "numeric"
        elif isinstance(sample, str):
            try:
                float(sample)
                types[attr] = "numeric"
            except (ValueError, TypeError):
                types[attr] = "categorical"
        else:
            types[attr] = "categorical"

    return types
