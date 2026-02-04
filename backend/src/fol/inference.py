from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import networkx as nx
import numpy as np

from fol.learning.feature_filter import FeatureFilter
from fol.topology import TopologyMetrics


@dataclass
class InferredPredicate:
    fol_expression: str
    coverage: float
    selectivity: float
    quality_score: float
    matching_nodes: list[str]


@dataclass
class AttributePredicate(InferredPredicate):
    attribute: str
    operator: str
    value: Any


@dataclass
class TopologyPredicate(InferredPredicate):
    metric: str
    operator: str
    threshold: float | str


@dataclass
class InferenceResult:
    attribute_predicates: list[AttributePredicate] = field(default_factory=list)
    topology_predicates: list[TopologyPredicate] = field(default_factory=list)
    selection_size: int = 0
    total_nodes: int = 0


class PredicateInferencer:
    FAST_TOPOLOGY_METRICS = [
        "degree",
        "k_core",
        "pagerank",
        "clustering_coefficient",
    ]

    SLOW_TOPOLOGY_METRICS = [
        "betweenness_centrality",
        "closeness_centrality",
    ]

    FAST_CATEGORICAL_METRICS = [
        "louvain_community",
        "component",
    ]

    SLOW_CATEGORICAL_METRICS: list[str] = []

    SLOW_METRICS_THRESHOLD = 500_000

    def __init__(
        self,
        min_coverage: float = 0.6,
        min_selectivity: float = 0.05,
        coverage_weight: float = 0.7,
        selectivity_weight: float = 0.3,
        feature_filter: FeatureFilter | None = None,
    ):
        self.min_coverage = min_coverage
        self.min_selectivity = min_selectivity
        self.coverage_weight = coverage_weight
        self.selectivity_weight = selectivity_weight
        self._topology_cache: dict[int, TopologyMetrics] = {}
        self._feature_filter = feature_filter or FeatureFilter()

    def infer(
        self,
        graph: nx.Graph,
        selected_nodes: list[str],
        max_predicates: int = 10,
    ) -> InferenceResult:
        valid_selected = [n for n in selected_nodes if n in graph.nodes()]
        if not valid_selected:
            return InferenceResult()

        selected_set = set(valid_selected)
        total_nodes = graph.number_of_nodes()
        selection_size = len(valid_selected)

        attr_predicates = self._infer_attribute_predicates(
            graph, selected_set, selection_size, total_nodes
        )

        topo_predicates = self._infer_topology_predicates(
            graph, selected_set, selection_size, total_nodes
        )

        return InferenceResult(
            attribute_predicates=attr_predicates[:max_predicates],
            topology_predicates=topo_predicates[:max_predicates],
            selection_size=selection_size,
            total_nodes=total_nodes,
        )

    def _infer_attribute_predicates(
        self,
        graph: nx.Graph,
        selected_set: set[str],
        selection_size: int,
        total_nodes: int,
    ) -> list[AttributePredicate]:
        attr_values: dict[str, dict[Any, set[str]]] = {}

        for node_id in graph.nodes():
            node_data = graph.nodes[node_id]

            for attr_name, attr_value in node_data.items():
                if self._feature_filter.is_excluded_by_name(attr_name):
                    continue

                if attr_name not in attr_values:
                    attr_values[attr_name] = {}

                if isinstance(attr_value, list):
                    for item in attr_value:
                        key = f"{attr_name}_{item}"
                        if key not in attr_values[attr_name]:
                            attr_values[attr_name][key] = set()
                        attr_values[attr_name][key].add(node_id)
                else:
                    if attr_value not in attr_values[attr_name]:
                        attr_values[attr_name][attr_value] = set()
                    attr_values[attr_name][attr_value].add(node_id)

        predicates: list[AttributePredicate] = []

        for attr_name, values in attr_values.items():
            value_counts = {v: len(nodes) for v, nodes in values.items()}
            n_observed = sum(value_counts.values())
            if self._feature_filter.is_categorical_identifier(
                attr_name, value_counts, n_observed
            ):
                continue

            values = self._feature_filter.filter_categorical_values(values)

            for value, matching_nodes in values.items():
                coverage, selectivity = self._compute_metrics(
                    matching_nodes, selected_set, selection_size, total_nodes
                )

                if coverage < self.min_coverage or selectivity < self.min_selectivity:
                    continue

                if (
                    isinstance(value, str)
                    and "_" in value
                    and attr_name not in ("node_type", "type")
                ):
                    fol_expr = f"{value}(x)"
                    operator = "="
                    display_value = value
                elif attr_name in ("node_type", "type"):
                    fol_expr = f'{attr_name}(x) = "{value}"'
                    operator = "="
                    display_value = value
                else:
                    fol_expr = f'{attr_name}(x) = "{value}"'
                    operator = "="
                    display_value = value

                quality = self._compute_quality(coverage, selectivity)

                predicates.append(
                    AttributePredicate(
                        fol_expression=fol_expr,
                        coverage=coverage,
                        selectivity=selectivity,
                        quality_score=quality,
                        matching_nodes=list(matching_nodes),
                        attribute=attr_name,
                        operator=operator,
                        value=display_value,
                    )
                )

        predicates.sort(key=lambda p: p.quality_score, reverse=True)
        return predicates

    def _infer_topology_predicates(
        self,
        graph: nx.Graph,
        selected_set: set[str],
        selection_size: int,
        total_nodes: int,
    ) -> list[TopologyPredicate]:
        graph_id = id(graph)
        if graph_id not in self._topology_cache:
            self._topology_cache[graph_id] = TopologyMetrics(graph)

        topology = self._topology_cache[graph_id]
        predicates: list[TopologyPredicate] = []

        graph_complexity = graph.number_of_nodes() * graph.number_of_edges()

        if graph_complexity < self.SLOW_METRICS_THRESHOLD:
            numeric_metrics = self.FAST_TOPOLOGY_METRICS + self.SLOW_TOPOLOGY_METRICS
            categorical_metrics = (
                self.FAST_CATEGORICAL_METRICS + self.SLOW_CATEGORICAL_METRICS
            )
        else:
            numeric_metrics = self.FAST_TOPOLOGY_METRICS
            categorical_metrics = self.FAST_CATEGORICAL_METRICS

        for metric in numeric_metrics:
            selected_values = [topology.get_metric(n, metric) for n in selected_set]

            if not selected_values:
                continue

            min_val = min(selected_values)
            max_val = max(selected_values)
            mean_val = np.mean(selected_values)

            thresholds = [
                (min_val, ">="),
                (max_val, "<="),
                (mean_val, ">="),
            ]

            for threshold, operator in thresholds:
                if threshold == 0:
                    continue

                matching = topology.get_nodes_by_threshold(metric, operator, threshold)

                coverage, selectivity = self._compute_metrics(
                    matching, selected_set, selection_size, total_nodes
                )

                if coverage < self.min_coverage or selectivity < self.min_selectivity:
                    continue

                if isinstance(threshold, float):
                    if threshold < 0.01:
                        threshold = round(threshold, 4)
                    elif threshold < 1:
                        threshold = round(threshold, 3)
                    else:
                        threshold = round(threshold, 2)

                fol_expr = f"{metric}(x) {operator} {threshold}"
                quality = self._compute_quality(coverage, selectivity)

                predicates.append(
                    TopologyPredicate(
                        fol_expression=fol_expr,
                        coverage=coverage,
                        selectivity=selectivity,
                        quality_score=quality,
                        matching_nodes=list(matching),
                        metric=metric,
                        operator=operator,
                        threshold=threshold,
                    )
                )

        for metric in categorical_metrics:
            category_counts: dict[str, int] = {}
            for node in selected_set:
                cat = topology.get_category(node, metric)
                if cat:
                    category_counts[cat] = category_counts.get(cat, 0) + 1

            if not category_counts:
                continue

            sorted_categories = sorted(
                category_counts.items(), key=lambda x: x[1], reverse=True
            )
            for category_value, _ in sorted_categories[:3]:
                matching = topology.get_nodes_by_category(metric, category_value, "=")

                coverage, selectivity = self._compute_metrics(
                    matching, selected_set, selection_size, total_nodes
                )

                if coverage < self.min_coverage or selectivity < self.min_selectivity:
                    continue

                fol_expr = f'{metric}(x) = "{category_value}"'
                quality = self._compute_quality(coverage, selectivity)

                predicates.append(
                    TopologyPredicate(
                        fol_expression=fol_expr,
                        coverage=coverage,
                        selectivity=selectivity,
                        quality_score=quality,
                        matching_nodes=list(matching),
                        metric=metric,
                        operator="=",
                        threshold=category_value,
                    )
                )

        predicates.sort(key=lambda p: p.quality_score, reverse=True)
        return self._deduplicate_topology_predicates(predicates)

    def _compute_metrics(
        self,
        matching_nodes: set[str],
        selected_set: set[str],
        selection_size: int,
        total_nodes: int,
    ) -> tuple[float, float]:
        intersection = matching_nodes & selected_set
        coverage = len(intersection) / selection_size if selection_size > 0 else 0
        selectivity = len(matching_nodes) / total_nodes if total_nodes > 0 else 0
        return coverage, selectivity

    def _compute_quality(self, coverage: float, selectivity: float) -> float:
        return self.coverage_weight * coverage + self.selectivity_weight * selectivity

    def _deduplicate_topology_predicates(
        self,
        predicates: list[TopologyPredicate],
    ) -> list[TopologyPredicate]:
        by_metric: dict[str, list[TopologyPredicate]] = {}
        for pred in predicates:
            if pred.metric not in by_metric:
                by_metric[pred.metric] = []
            by_metric[pred.metric].append(pred)

        unique: list[TopologyPredicate] = []

        for _metric, metric_preds in by_metric.items():
            metric_preds.sort(key=lambda p: p.quality_score, reverse=True)

            if metric_preds:
                unique.append(metric_preds[0])

        unique.sort(key=lambda p: p.quality_score, reverse=True)
        return unique


def infer_predicates_from_selection(
    graph: nx.Graph,
    selected_nodes: list[str],
    min_coverage: float = 0.6,
    min_selectivity: float = 0.1,
) -> dict[str, list[dict]]:
    inferencer = PredicateInferencer(
        min_coverage=min_coverage,
        min_selectivity=min_selectivity,
    )

    result = inferencer.infer(graph, selected_nodes)

    return {
        "attribute": [
            {
                "attribute": p.attribute,
                "value": p.value,
                "fol_expression": p.fol_expression,
                "coverage": p.coverage,
                "selectivity": p.selectivity,
                "quality_score": p.quality_score,
                "matching_nodes": p.matching_nodes,
            }
            for p in result.attribute_predicates
        ],
        "topology": [
            {
                "metric": p.metric,
                "operator": p.operator,
                "threshold": p.threshold,
                "fol_expression": p.fol_expression,
                "coverage": p.coverage,
                "selectivity": p.selectivity,
                "quality_score": p.quality_score,
                "matching_nodes": p.matching_nodes,
            }
            for p in result.topology_predicates
        ],
    }


def get_lifted_predicates(graph: nx.Graph) -> dict[str, list[str]]:
    lifted: dict[str, set[str]] = {}

    for node_id in graph.nodes():
        node_data = graph.nodes[node_id]

        for attr_name, attr_value in node_data.items():
            if isinstance(attr_value, list):
                for item in attr_value:
                    predicate_name = f"{attr_name}_{str(item).replace(' ', '_')}"
                    if predicate_name not in lifted:
                        lifted[predicate_name] = set()
                    lifted[predicate_name].add(node_id)

    return {k: list(v) for k, v in lifted.items()}
