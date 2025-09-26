from collections import Counter, defaultdict
from typing import Any

import networkx as nx
import numpy as np

from utils.logging_config import get_logger, log_performance

from ..compiler.formal_types import (
    AttributeType,
)
from .attribute_predicates import (
    detect_attribute_type,
    make_hashable,
    normalize_array_value,
)

logger = get_logger("fol.descriptive_generator")


class DescriptivePredicateGenerator:
    def __init__(self):
        logger.info("🔧 DescriptivePredicateGenerator initialized")
        pass

    def _check_numeric_condition(
        self, value: float, operator: str, threshold: float
    ) -> bool:
        if operator == ">=":
            return value >= threshold
        elif operator == "<=":
            return value <= threshold
        elif operator == "=":
            return value == threshold
        elif operator == ">":
            return value > threshold
        elif operator == "<":
            return value < threshold
        else:
            return False

    def _get_topology_metric_value(
        self,
        graph: nx.Graph,
        node_id: str,
        metric: str,
        betweenness: dict,
        closeness: dict,
        clustering: dict,
        eigenvector: dict = None,
        pagerank: dict = None,
    ) -> float | None:
        if metric == "degree":
            return graph.degree(node_id)
        elif metric == "betweenness_centrality":
            return betweenness.get(node_id, 0.0)
        elif metric == "closeness_centrality":
            return closeness.get(node_id, 0.0)
        elif metric == "clustering_coefficient":
            return clustering.get(node_id, 0.0)
        elif metric == "eigenvector_centrality":
            return eigenvector.get(node_id, 0.0) if eigenvector else 0.0
        elif metric == "pagerank":
            return pagerank.get(node_id, 0.0) if pagerank else 0.0
        else:
            return None

    def _topology_metric_matches(
        self,
        graph: nx.Graph,
        node_id: str,
        metric: str,
        operator: str,
        threshold: float,
        betweenness: dict,
        closeness: dict,
        clustering: dict,
        eigenvector: dict = None,
        pagerank: dict = None,
    ) -> bool:
        value = self._get_topology_metric_value(
            graph,
            node_id,
            metric,
            betweenness,
            closeness,
            clustering,
            eigenvector,
            pagerank,
        )
        if value is None:
            return False
        return self._check_numeric_condition(value, operator, threshold)

    def _topology_metric_between(
        self,
        graph: nx.Graph,
        node_id: str,
        metric: str,
        lower: float,
        upper: float,
        betweenness: dict,
        closeness: dict,
        clustering: dict,
        eigenvector: dict = None,
        pagerank: dict = None,
    ) -> bool:
        value = self._get_topology_metric_value(
            graph,
            node_id,
            metric,
            betweenness,
            closeness,
            clustering,
            eigenvector,
            pagerank,
        )
        if value is None:
            return False
        return lower <= value <= upper

    @log_performance(logger)
    def generate_for_selection(
        self, graph: nx.Graph, selected_nodes: list[str], spaces: list[str] = None
    ) -> dict[str, Any]:
        logger.info(
            "🔍 Generating predicates for selection",
            extra={
                "selected_nodes_count": len(selected_nodes) if selected_nodes else 0,
                "graph_nodes": graph.number_of_nodes() if graph else 0,
                "graph_edges": graph.number_of_edges() if graph else 0,
                "spaces": spaces or ["topology", "attribute"],
            },
        )

        if not graph:
            logger.warning("❌ No graph provided for predicate generation")
            return self._empty_response_with_error("No graph provided")

        if not selected_nodes:
            logger.warning("❌ No nodes selected for predicate generation")
            return self._empty_response_with_error("No nodes selected")

        graph_node_set = {str(node) for node in graph.nodes()}
        selected_set = {str(node) for node in selected_nodes}
        invalid_nodes = selected_set - graph_node_set

        if invalid_nodes:
            selected_set = selected_set & graph_node_set
            if not selected_set:
                return self._empty_response_with_error("No valid nodes in selection")

        spaces = spaces or ["topology", "attribute"]

        result = {
            "selection_count": len(selected_set),
            "total_nodes": graph.number_of_nodes(),
            "node_type_distribution": {},
            "topology_predicates": [],
            "attribute_predicates": [],
            "diagnostics": {
                "message": "Generated predicates",
                "method": "descriptive_analysis",
                "warnings": [],
            },
        }

        if invalid_nodes:
            result["diagnostics"]["warnings"].append(
                f"Filtered out {len(invalid_nodes)} invalid nodes"
            )

        try:
            result["node_type_distribution"] = self._get_node_type_distribution(
                graph, selected_set
            )
        except Exception as e:
            result["diagnostics"]["warnings"].append(
                f"Node type distribution failed: {str(e)}"
            )

        if "topology" in spaces:
            try:
                result["topology_predicates"] = self._generate_topology_predicates(
                    graph, selected_set
                )
            except Exception as e:
                result["diagnostics"]["warnings"].append(
                    f"Topology predicates failed: {str(e)}"
                )

        if "attribute" in spaces:
            try:
                result["attribute_predicates"] = self._generate_attribute_predicates(
                    graph, selected_set
                )
            except Exception as e:
                result["diagnostics"]["warnings"].append(
                    f"Attribute predicates failed: {str(e)}"
                )

        total_predicates = len(result["topology_predicates"]) + len(
            result["attribute_predicates"]
        )
        if total_predicates == 0:
            result["diagnostics"]["message"] = (
                "No predicates generated - selection may not have distinctive characteristics"
            )
        else:
            result["diagnostics"]["message"] = (
                f"Generated {total_predicates} predicates successfully"
            )

        return result

    def _empty_response(self) -> dict[str, Any]:
        return {
            "selection_count": 0,
            "total_nodes": 0,
            "node_type_distribution": {},
            "topology_predicates": [],
            "attribute_predicates": [],
            "diagnostics": {"message": "No nodes selected", "warnings": []},
        }

    def _empty_response_with_error(self, error_message: str) -> dict[str, Any]:
        return {
            "selection_count": 0,
            "total_nodes": 0,
            "node_type_distribution": {},
            "topology_predicates": [],
            "attribute_predicates": [],
            "diagnostics": {"message": error_message, "warnings": [], "error": True},
        }

    def _get_node_type_distribution(
        self, graph: nx.Graph, selected_nodes: set[str]
    ) -> dict[str, int]:
        type_counts = Counter()

        for node_id in selected_nodes:
            if node_id in graph.nodes():
                node_type = graph.nodes[node_id].get(
                    "node_type", graph.nodes[node_id].get("type", "Unknown")
                )
                type_counts[node_type] += 1

        return dict(type_counts)

    def _generate_topology_predicates(
        self, graph: nx.Graph, selected_nodes: set[str]
    ) -> list[dict[str, Any]]:
        predicates = []

        try:
            betweenness = nx.betweenness_centrality(graph)
            closeness = nx.closeness_centrality(graph)
            clustering = nx.clustering(graph)

            eigenvector = {}
            pagerank = {}

            try:
                eigenvector = nx.eigenvector_centrality(graph, max_iter=1000)
            except (nx.NetworkXError, ValueError):
                eigenvector = defaultdict(float)

            try:
                pagerank = nx.pagerank(graph, max_iter=1000)
            except (nx.NetworkXError, ValueError):
                pagerank = defaultdict(float)

        except Exception:
            betweenness = defaultdict(float)
            closeness = defaultdict(float)
            clustering = defaultdict(float)
            eigenvector = defaultdict(float)
            pagerank = defaultdict(float)

        selected_metrics = defaultdict(list)
        all_metrics = defaultdict(list)

        for node_id in graph.nodes():
            node_str = str(node_id)
            degree = graph.degree(node_id)

            metrics_dict = {
                "degree": degree,
                "clustering_coefficient": clustering.get(node_id, 0.0),
                "betweenness_centrality": betweenness.get(node_id, 0.0),
                "closeness_centrality": closeness.get(node_id, 0.0),
                "eigenvector_centrality": eigenvector.get(node_id, 0.0),
                "pagerank": pagerank.get(node_id, 0.0),
            }

            for metric, value in metrics_dict.items():
                all_metrics[metric].append(value)
                if node_str in selected_nodes:
                    selected_metrics[metric].append(value)

        for metric in [
            "degree",
            "clustering_coefficient",
            "betweenness_centrality",
            "closeness_centrality",
            "eigenvector_centrality",
            "pagerank",
        ]:
            if not selected_metrics[metric]:
                continue

            selected_values = selected_metrics[metric]
            all_values = all_metrics[metric]

            if not all_values:
                continue

            selected_mean = np.mean(selected_values)
            all_mean = np.mean(all_values)
            all_std = np.std(all_values)

            predicate_dict = self._analyze_metric_distribution(
                graph,
                metric,
                selected_values,
                all_values,
                selected_mean,
                all_mean,
                all_std,
                betweenness,
                closeness,
                clustering,
                eigenvector,
                pagerank,
            )

            if predicate_dict:
                predicates.append(predicate_dict)

        return predicates

    def _analyze_metric_distribution(
        self,
        graph: nx.Graph,
        metric: str,
        selected_values: list[float],
        all_values: list[float],
        selected_mean: float,
        all_mean: float,
        all_std: float,
        betweenness: dict,
        closeness: dict,
        clustering: dict,
        eigenvector: dict = None,
        pagerank: dict = None,
    ) -> dict[str, Any] | None:
        if all_std == 0:
            return None

        z_score = abs(selected_mean - all_mean) / all_std if all_std > 0 else 0

        if z_score < 0.1:
            return None

        if selected_mean > all_mean + 0.1 * all_std:
            threshold = selected_mean * 0.9
            operator = ">="
            description = f"{metric} >= {round(float(threshold), 4)}"
        elif selected_mean < all_mean - 0.1 * all_std:
            threshold = selected_mean * 1.1
            operator = "<="
            description = f"{metric} <= {round(float(threshold), 4)}"
        else:
            threshold_range = max(all_std * 0.5, 0.01)
            lower_threshold = selected_mean - threshold_range
            upper_threshold = selected_mean + threshold_range

            applicable_nodes = [
                str(node_id)
                for node_id in graph.nodes()
                if self._topology_metric_between(
                    graph,
                    node_id,
                    metric,
                    lower_threshold,
                    upper_threshold,
                    betweenness,
                    closeness,
                    clustering,
                    eigenvector,
                    pagerank,
                )
            ]

            # Get node types for applicable nodes
            node_types = set()
            for node_id in applicable_nodes:
                if node_id in graph.nodes():
                    node_type = graph.nodes[node_id].get(
                        "node_type", graph.nodes[node_id].get("type", "unknown")
                    )
                    node_types.add(node_type)

            return {
                "id": f"{metric}_between_{round(float(lower_threshold), 4)}_{round(float(upper_threshold), 4)}",
                "attribute": metric,
                "operator": "between",
                "value": round(float(lower_threshold), 4),
                "value2": round(float(upper_threshold), 4),
                "description": f"{metric} between {round(float(lower_threshold), 4)} and {round(float(upper_threshold), 4)}",
                "applicable_node_types": list(node_types),
                "applicable_nodes": applicable_nodes,
            }

        applicable_nodes = [
            str(node_id)
            for node_id in graph.nodes()
            if self._topology_metric_matches(
                graph,
                node_id,
                metric,
                operator,
                threshold,
                betweenness,
                closeness,
                clustering,
                eigenvector,
                pagerank,
            )
        ]

        # Get node types for applicable nodes
        node_types = set()
        for node_id in applicable_nodes:
            if node_id in graph.nodes():
                node_type = graph.nodes[node_id].get(
                    "node_type", graph.nodes[node_id].get("type", "unknown")
                )
                node_types.add(node_type)

        return {
            "id": f"{metric}_{operator}_{round(float(threshold), 4)}",
            "attribute": metric,
            "operator": operator,
            "value": round(float(threshold), 4),
            "description": description,
            "applicable_node_types": list(node_types),
            "applicable_nodes": applicable_nodes,
        }

    def _generate_attribute_predicates(
        self, graph: nx.Graph, selected_nodes: set[str]
    ) -> list[dict[str, Any]]:
        predicates = []

        node_type_attributes = defaultdict(set)
        node_types_in_selection = set()

        for node_id, data in graph.nodes(data=True):
            node_type = data.get("node_type", data.get("type", "unknown"))
            attributes = set(data.keys())
            attributes.discard("type")
            attributes.discard("node_type")
            attributes.discard("id")
            node_type_attributes[node_type].update(attributes)

            if str(node_id) in selected_nodes:
                node_types_in_selection.add(node_type)

        for node_type in node_types_in_selection:
            for attribute in node_type_attributes[node_type]:
                predicate_dict = self._analyze_attribute_distribution_by_type(
                    graph, selected_nodes, attribute, node_type
                )
                if predicate_dict:
                    predicates.append(predicate_dict)

        return predicates

    def _analyze_attribute_distribution_by_type(
        self, graph: nx.Graph, selected_nodes: set[str], attribute: str, node_type: str
    ) -> dict[str, Any] | None:
        selected_values = []
        all_values = []

        for node_id, data in graph.nodes(data=True):
            current_node_type = data.get("node_type", data.get("type", "unknown"))
            if current_node_type == node_type and attribute in data:
                value = data[attribute]
                all_values.append(value)
                if str(node_id) in selected_nodes:
                    selected_values.append(value)

        if not selected_values or not all_values:
            return None

        sample_value = selected_values[0]
        attribute_type = detect_attribute_type(sample_value)

        if attribute_type == AttributeType.BOOLEAN:
            return self._analyze_boolean_attribute_by_type(
                graph, attribute, node_type, selected_values, all_values
            )
        elif attribute_type == AttributeType.NUMERIC:
            return self._analyze_numeric_attribute_by_type(
                graph, attribute, node_type, selected_values, all_values
            )
        elif attribute_type == AttributeType.ARRAY:
            return self._analyze_array_attribute_by_type(
                graph, attribute, node_type, selected_values, all_values
            )
        else:
            return self._analyze_categorical_attribute_by_type(
                graph, attribute, node_type, selected_values, all_values
            )

    def _analyze_attribute_distribution(
        self, graph: nx.Graph, selected_nodes: set[str], attribute: str
    ) -> dict[str, Any] | None:
        selected_values = []
        all_values = []

        for node_id, data in graph.nodes(data=True):
            if attribute in data:
                value = data[attribute]
                all_values.append(value)
                if str(node_id) in selected_nodes:
                    selected_values.append(value)

        if not selected_values or not all_values:
            return None

        sample_value = selected_values[0]
        if isinstance(sample_value, bool):
            return self._analyze_boolean_attribute(
                graph, attribute, selected_values, all_values
            )
        elif isinstance(sample_value, int | float):
            return self._analyze_numeric_attribute(
                graph, attribute, selected_values, all_values
            )
        else:
            return self._analyze_categorical_attribute(
                graph, attribute, selected_values, all_values
            )

    def _analyze_boolean_attribute(
        self,
        graph: nx.Graph,
        attribute: str,
        selected_values: list[bool],
        all_values: list[bool],
    ) -> dict[str, Any] | None:
        selected_true_ratio = sum(selected_values) / len(selected_values)
        all_true_ratio = sum(all_values) / len(all_values)

        if abs(selected_true_ratio - all_true_ratio) < 0.05:
            return None

        target_value = selected_true_ratio > 0.5
        description = f"{attribute} = {target_value}"

        return {
            "id": f"{attribute}_{target_value}",
            "attribute": attribute,
            "attribute_type": "boolean",
            "operator": "=",
            "value": target_value,
            "description": description,
            "applicable_nodes": [
                str(node_id)
                for node_id, data in graph.nodes(data=True)
                if data.get(attribute) == target_value
            ],
        }

    def _analyze_numeric_attribute(
        self,
        graph: nx.Graph,
        attribute: str,
        selected_values: list[float],
        all_values: list[float],
    ) -> dict[str, Any] | None:
        selected_mean = np.mean(selected_values)
        all_mean = np.mean(all_values)
        all_std = np.std(all_values)

        if all_std == 0:
            return None

        z_score = abs(selected_mean - all_mean) / all_std
        if z_score < 0.1:
            return None

        if selected_mean > all_mean + 0.1 * all_std:
            threshold = selected_mean * 0.9
            operator = ">="
            description = f"{attribute} >= {round(float(threshold), 4)}"
        elif selected_mean < all_mean - 0.1 * all_std:
            threshold = selected_mean * 1.1
            operator = "<="
            description = f"{attribute} <= {round(float(threshold), 4)}"
        else:
            threshold_range = max(all_std * 0.5, abs(selected_mean) * 0.1, 0.01)
            lower_threshold = selected_mean - threshold_range
            upper_threshold = selected_mean + threshold_range

            return {
                "id": f"{attribute}_between_{round(float(lower_threshold), 4)}_{round(float(upper_threshold), 4)}",
                "attribute": attribute,
                "attribute_type": "numeric",
                "operator": "between",
                "value": round(float(lower_threshold), 4),
                "value2": round(float(upper_threshold), 4),
                "description": f"{attribute} between {round(float(lower_threshold), 4)} and {round(float(upper_threshold), 4)}",
                "applicable_nodes": [
                    str(node_id)
                    for node_id, data in graph.nodes(data=True)
                    if attribute in data
                    and lower_threshold <= data[attribute] <= upper_threshold
                ],
            }

        return {
            "id": f"{attribute}_{operator}_{round(float(threshold), 4)}",
            "attribute": attribute,
            "attribute_type": "numeric",
            "operator": operator,
            "value": round(float(threshold), 4),
            "description": description,
            "applicable_nodes": [
                str(node_id)
                for node_id, data in graph.nodes(data=True)
                if attribute in data
                and self._check_numeric_condition(data[attribute], operator, threshold)
            ],
        }

    def _analyze_categorical_attribute(
        self,
        graph: nx.Graph,
        attribute: str,
        selected_values: list[str],
        all_values: list[str],
    ) -> dict[str, Any] | None:
        selected_counter = Counter(selected_values)
        all_counter = Counter(all_values)

        if not selected_counter:
            return None

        most_common_value, count = selected_counter.most_common(1)[0]
        selected_ratio = count / len(selected_values)
        all_ratio = all_counter.get(most_common_value, 0) / len(all_values)

        if selected_ratio < 0.2 or abs(selected_ratio - all_ratio) < 0.05:
            return None

        description = f"{attribute} = '{most_common_value}'"

        return {
            "id": f"{attribute}_{most_common_value}",
            "attribute": attribute,
            "attribute_type": "categorical",
            "operator": "=",
            "value": most_common_value,
            "description": description,
            "applicable_nodes": [
                str(node_id)
                for node_id, data in graph.nodes(data=True)
                if data.get(attribute) == most_common_value
            ],
        }

    def _analyze_boolean_attribute_by_type(
        self,
        graph: nx.Graph,
        attribute: str,
        node_type: str,
        selected_values: list[bool],
        all_values: list[bool],
    ) -> dict[str, Any] | None:
        selected_true_ratio = sum(selected_values) / len(selected_values)
        all_true_ratio = sum(all_values) / len(all_values)

        if abs(selected_true_ratio - all_true_ratio) < 0.05:
            return None

        target_value = selected_true_ratio > 0.5
        description = f"{attribute} = {target_value} ({node_type})"

        return {
            "id": f"{attribute}_{target_value}_{node_type}",
            "attribute": attribute,
            "attribute_type": "boolean",
            "operator": "=",
            "value": target_value,
            "node_type": node_type,
            "applicable_node_types": [node_type],
            "description": description,
            "applicable_nodes": [
                str(node_id)
                for node_id, data in graph.nodes(data=True)
                if data.get("node_type", data.get("type")) == node_type
                and data.get(attribute) == target_value
            ],
        }

    def _analyze_numeric_attribute_by_type(
        self,
        graph: nx.Graph,
        attribute: str,
        node_type: str,
        selected_values: list[float],
        all_values: list[float],
    ) -> dict[str, Any] | None:
        selected_mean = np.mean(selected_values)
        all_mean = np.mean(all_values)
        all_std = np.std(all_values)

        if all_std == 0:
            return None

        z_score = abs(selected_mean - all_mean) / all_std
        if z_score < 0.1:
            return None

        if selected_mean > all_mean + 0.1 * all_std:
            threshold = selected_mean * 0.9
            operator = ">="
            description = f"{attribute} >= {round(float(threshold), 4)} ({node_type})"
        elif selected_mean < all_mean - 0.1 * all_std:
            threshold = selected_mean * 1.1
            operator = "<="
            description = f"{attribute} <= {round(float(threshold), 4)} ({node_type})"
        else:
            threshold_range = max(all_std * 0.5, abs(selected_mean) * 0.1, 0.01)
            lower_threshold = selected_mean - threshold_range
            upper_threshold = selected_mean + threshold_range

            return {
                "id": f"{attribute}_between_{round(float(lower_threshold), 4)}_{round(float(upper_threshold), 4)}_{node_type}",
                "attribute": attribute,
                "attribute_type": "numeric",
                "operator": "between",
                "value": round(float(lower_threshold), 4),
                "value2": round(float(upper_threshold), 4),
                "node_type": node_type,
                "applicable_node_types": [node_type],
                "description": f"{attribute} between {round(float(lower_threshold), 4)} and {round(float(upper_threshold), 4)} ({node_type})",
                "applicable_nodes": [
                    str(node_id)
                    for node_id, data in graph.nodes(data=True)
                    if data.get("node_type", data.get("type")) == node_type
                    and attribute in data
                    and lower_threshold <= data[attribute] <= upper_threshold
                ],
            }

        return {
            "id": f"{attribute}_{operator}_{round(float(threshold), 4)}_{node_type}",
            "attribute": attribute,
            "attribute_type": "numeric",
            "operator": operator,
            "value": round(float(threshold), 4),
            "node_type": node_type,
            "applicable_node_types": [node_type],
            "description": description,
            "applicable_nodes": [
                str(node_id)
                for node_id, data in graph.nodes(data=True)
                if data.get("node_type", data.get("type")) == node_type
                and attribute in data
                and self._check_numeric_condition(data[attribute], operator, threshold)
            ],
        }

    def _analyze_categorical_attribute_by_type(
        self,
        graph: nx.Graph,
        attribute: str,
        node_type: str,
        selected_values: list[Any],
        all_values: list[Any],
    ) -> dict[str, Any] | None:
        selected_hashable = [make_hashable(v) for v in selected_values]
        all_hashable = [make_hashable(v) for v in all_values]

        selected_counter = Counter(selected_hashable)
        all_counter = Counter(all_hashable)

        if not selected_counter:
            return None

        most_common_value, count = selected_counter.most_common(1)[0]
        selected_ratio = count / len(selected_values)
        all_ratio = all_counter.get(most_common_value, 0) / len(all_values)

        if selected_ratio < 0.2 or abs(selected_ratio - all_ratio) < 0.05:
            return None

        description = f"{attribute} = '{most_common_value}' ({node_type})"

        return {
            "id": f"{attribute}_{most_common_value}_{node_type}",
            "attribute": attribute,
            "attribute_type": "categorical",
            "operator": "=",
            "value": most_common_value,
            "node_type": node_type,
            "applicable_node_types": [node_type],
            "description": description,
            "applicable_nodes": [
                str(node_id)
                for node_id, data in graph.nodes(data=True)
                if data.get("node_type", data.get("type")) == node_type
                and data.get(attribute) == most_common_value
            ],
        }

    def _analyze_array_attribute_by_type(
        self,
        graph: nx.Graph,
        attribute: str,
        node_type: str,
        selected_values: list[Any],
        all_values: list[Any],
    ) -> dict[str, Any] | None:
        selected_arrays = [normalize_array_value(v) for v in selected_values]
        all_arrays = [normalize_array_value(v) for v in all_values]

        selected_lengths = [len(arr) for arr in selected_arrays]
        all_lengths = [len(arr) for arr in all_arrays]

        if selected_lengths and all_lengths:
            selected_mean_length = np.mean(selected_lengths)
            all_mean_length = np.mean(all_lengths)
            length_std = np.std(all_lengths)

            if length_std > 0:
                z_score = abs(selected_mean_length - all_mean_length) / length_std
                if z_score >= 0.5:
                    if selected_mean_length > all_mean_length:
                        threshold = max(1, int(selected_mean_length * 0.8))
                        return {
                            "id": f"{attribute}_length_gte_{threshold}_{node_type}",
                            "attribute": attribute,
                            "attribute_type": "array",
                            "operator": "length_gt",
                            "value": threshold,
                            "node_type": node_type,
                            "applicable_node_types": [node_type],
                            "description": f"{attribute} length > {threshold} ({node_type})",
                            "applicable_nodes": [
                                str(node_id)
                                for node_id, data in graph.nodes(data=True)
                                if (
                                    data.get("node_type", data.get("type")) == node_type
                                    and attribute in data
                                    and len(normalize_array_value(data[attribute]))
                                    > threshold
                                )
                            ],
                        }

        all_elements = []
        selected_elements = []

        for arr in selected_arrays:
            selected_elements.extend(arr)
        for arr in all_arrays:
            all_elements.extend(arr)

        if selected_elements and all_elements:
            selected_hashable = [make_hashable(elem) for elem in selected_elements]
            all_hashable = [make_hashable(elem) for elem in all_elements]

            selected_counter = Counter(selected_hashable)
            all_counter = Counter(all_hashable)

            for element, selected_count in selected_counter.most_common(3):
                selected_freq = selected_count / len(selected_values)
                all_freq = all_counter.get(element, 0) / len(all_values)

                if selected_freq >= 0.3 and selected_freq > all_freq * 1.5:
                    return {
                        "id": f"{attribute}_contains_{str(element).replace(' ', '_')}_{node_type}",
                        "attribute": attribute,
                        "attribute_type": "array",
                        "operator": "contains",
                        "value": element,
                        "node_type": node_type,
                        "applicable_node_types": [node_type],
                        "description": f"{attribute} contains '{element}' ({node_type})",
                        "applicable_nodes": [
                            str(node_id)
                            for node_id, data in graph.nodes(data=True)
                            if (
                                data.get("node_type", data.get("type")) == node_type
                                and attribute in data
                                and element in normalize_array_value(data[attribute])
                            )
                        ],
                    }

        return None
