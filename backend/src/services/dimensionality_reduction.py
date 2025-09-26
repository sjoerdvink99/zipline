from __future__ import annotations

import logging
import warnings
from typing import Any

import networkx as nx
import numpy as np
from sklearn.decomposition import PCA
from sklearn.manifold import TSNE
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")
logger = logging.getLogger(__name__)


def extract_node_features(
    graph: nx.Graph,
) -> tuple[np.ndarray, list[str], list[str], list[str]]:
    if not graph.nodes():
        return np.array([]), [], [], []

    node_ids = list(graph.nodes())
    node_labels = []
    feature_names: list[str] = []
    feature_matrix: list[list[float]] = []

    # Get all attributes from all nodes
    all_attributes = set()
    for _node_id, attrs in graph.nodes(data=True):
        all_attributes.update(attrs.keys())

    # Remove metadata attributes
    excluded_attrs = {"node_type", "type", "label", "display_name", "id", "name"}
    all_attributes = all_attributes - excluded_attrs

    # Process each attribute
    for attr in sorted(all_attributes):
        # Collect all values for this attribute
        attr_values = []
        for node_id in node_ids:
            attrs = graph.nodes[node_id]
            val = attrs.get(attr)
            attr_values.append(val)

        # Skip if all values are None/missing
        if all(v is None for v in attr_values):
            continue

        # Try numerical encoding first
        numerical_values = []
        is_numerical = True
        try:
            for val in attr_values:
                if val is None:
                    numerical_values.append(0.0)
                elif isinstance(val, int | float):
                    numerical_values.append(float(val))
                elif isinstance(val, bool):
                    numerical_values.append(1.0 if val else 0.0)
                else:
                    # Try to parse as number
                    try:
                        numerical_values.append(float(str(val)))
                    except ValueError:
                        is_numerical = False
                        break
        except (ValueError, TypeError):
            is_numerical = False

        if is_numerical:
            # Add as numerical feature
            feature_names.append(attr)
            if not feature_matrix:
                feature_matrix = [[] for _ in node_ids]
            for i, val in enumerate(numerical_values):
                feature_matrix[i].append(val)
        else:
            # Categorical encoding - one-hot or label encoding
            unique_values = list(
                {str(v) if v is not None else "null" for v in attr_values}
            )

            if len(unique_values) <= 20:  # One-hot encode if not too many categories
                for unique_val in sorted(unique_values):
                    feature_names.append(f"{attr}_{unique_val}")
                    if not feature_matrix:
                        feature_matrix = [[] for _ in node_ids]
                    for i, val in enumerate(attr_values):
                        val_str = str(val) if val is not None else "null"
                        feature_matrix[i].append(1.0 if val_str == unique_val else 0.0)
            else:
                # Label encode if too many categories
                value_to_idx = {
                    val: idx for idx, val in enumerate(sorted(unique_values))
                }
                feature_names.append(f"{attr}_encoded")
                if not feature_matrix:
                    feature_matrix = [[] for _ in node_ids]
                for i, val in enumerate(attr_values):
                    val_str = str(val) if val is not None else "null"
                    feature_matrix[i].append(float(value_to_idx[val_str]))

    # Skip topological features for attribute-only UMAP analysis

    for node_id in node_ids:
        attrs = graph.nodes[node_id]
        label = attrs.get("node_type", attrs.get("type", attrs.get("label", "default")))
        node_labels.append(label)

    if feature_matrix:
        feature_array = np.array(feature_matrix, dtype=float)
    else:
        feature_array = np.random.random((len(node_ids), 2))
        feature_names = ["random_x", "random_y"]

    return feature_array, node_ids, node_labels, feature_names


def compute_tsne_embedding(
    graph: nx.Graph,
    n_components: int = 2,
    perplexity: float = 30.0,
    learning_rate: float = 200.0,
    max_iter: int = 1000,
    random_state: int = 42,
) -> dict[str, Any]:
    if not graph.nodes():
        return {
            "embedding": [],
            "node_ids": [],
            "node_labels": [],
            "feature_names": [],
            "n_components": n_components,
            "parameters": {
                "perplexity": perplexity,
                "learning_rate": learning_rate,
                "max_iter": max_iter,
                "algorithm": "t-SNE",
            },
        }

    feature_matrix, node_ids, node_labels, feature_names = extract_node_features(graph)

    if feature_matrix.shape[0] == 0:
        return {
            "embedding": [],
            "node_ids": [],
            "node_labels": [],
            "feature_names": [],
            "n_components": n_components,
            "parameters": {
                "perplexity": perplexity,
                "learning_rate": learning_rate,
                "max_iter": max_iter,
                "algorithm": "t-SNE",
            },
        }

    scaler = StandardScaler()
    feature_matrix_scaled = scaler.fit_transform(feature_matrix)

    if feature_matrix_scaled.shape[1] > 50:
        pca = PCA(n_components=50, random_state=random_state)
        feature_matrix_scaled = pca.fit_transform(feature_matrix_scaled)

    n_samples = feature_matrix_scaled.shape[0]
    adjusted_perplexity = min(perplexity, max(5, n_samples - 1))

    tsne = TSNE(
        n_components=n_components,
        perplexity=adjusted_perplexity,
        learning_rate=learning_rate,
        max_iter=max_iter,
        random_state=random_state,
        init="random",
    )

    embedding = tsne.fit_transform(feature_matrix_scaled)

    return {
        "embedding": embedding.tolist(),
        "node_ids": node_ids,
        "node_labels": node_labels,
        "feature_names": feature_names,
        "n_components": n_components,
        "parameters": {
            "perplexity": adjusted_perplexity,
            "learning_rate": learning_rate,
            "max_iter": max_iter,
            "algorithm": "t-SNE",
        },
    }


def compute_umap_embedding(
    graph: nx.Graph,
    n_neighbors: int = 15,
    min_dist: float = 0.1,
    metric: str = "euclidean",
    n_components: int = 2,
    random_state: int = 42,
) -> dict[str, Any]:
    perplexity = min(50, max(5, n_neighbors * 2))
    learning_rate = max(50, 400 - min_dist * 300)

    result = compute_tsne_embedding(
        graph=graph,
        n_components=n_components,
        perplexity=perplexity,
        learning_rate=learning_rate,
        max_iter=1000,
        random_state=random_state,
    )

    result["parameters"] = {
        "n_neighbors": n_neighbors,
        "min_dist": min_dist,
        "metric": metric,
        "n_components": n_components,
        "algorithm": "t-SNE (UMAP fallback)",
    }

    return result
