import time

import networkx as nx
import numpy as np

from models.predicate_models import (
    AttributePredicate,
    PredicateInferenceResult,
    TopologyPredicate,
)
from utils.logging_config import get_logger, log_performance

from .attribute_statistics import AttributeStatistics
from .precomputed_metrics import PrecomputedGraphMetrics
from .predicate_templates import PredicateOperator, PredicateTemplateLibrary
from .quality_metrics import calculate_predicate_quality

logger = get_logger("inference.fast_engine")


class IncrementalPredicateCache:
    def __init__(self):
        logger.debug("🗄️ Initializing predicate cache", extra={"max_size": 1000})
        self.selection_cache: dict[str, PredicateInferenceResult] = {}
        self.max_cache_size = 1000

    def get_cache_key(self, nodes: list[str]) -> str:
        return "|".join(sorted(nodes))

    def get_or_compute(
        self, nodes: list[str], compute_func
    ) -> PredicateInferenceResult:
        cache_key = self.get_cache_key(nodes)

        if cache_key in self.selection_cache:
            return self.selection_cache[cache_key]

        result = compute_func()

        if len(self.selection_cache) < self.max_cache_size:
            self.selection_cache[cache_key] = result

        return result


class FastPredicateInference:
    def __init__(self, graph: nx.Graph = None):
        logger.info(
            "⚡ Initializing FastPredicateInference",
            extra={
                "graph_nodes": graph.number_of_nodes() if graph else 0,
                "graph_edges": graph.number_of_edges() if graph else 0,
            },
        )
        self.graph = graph
        if graph:
            self.metrics = PrecomputedGraphMetrics(graph)
            self.stats = AttributeStatistics(graph)
            self.all_nodes = list(graph.nodes())
        else:
            self.metrics = None
            self.stats = None
            self.all_nodes = []
        self.templates = PredicateTemplateLibrary()
        self.cache = IncrementalPredicateCache()

    @log_performance(logger)
    def infer_predicates(
        self,
        selected_nodes: list[str],
        min_coverage: float = 0.6,
        min_selectivity: float = 0.1,
        max_predicates_per_type: int = 10,
    ) -> PredicateInferenceResult:
        logger.info(
            "🧠 Starting predicate inference",
            extra={
                "selected_nodes_count": len(selected_nodes),
                "min_coverage": min_coverage,
                "min_selectivity": min_selectivity,
                "max_predicates_per_type": max_predicates_per_type,
            },
        )
        return self.cache.get_or_compute(
            selected_nodes,
            lambda: self._compute_predicates(
                selected_nodes, min_coverage, min_selectivity, max_predicates_per_type
            ),
        )

    def _compute_predicates(
        self,
        selected_nodes: list[str],
        min_coverage: float,
        min_selectivity: float,
        max_predicates_per_type: int,
    ) -> PredicateInferenceResult:
        start_time = time.time()

        attr_start = time.time()
        attribute_predicates = self._infer_attribute_predicates(
            selected_nodes, min_coverage, min_selectivity, max_predicates_per_type
        )
        (time.time() - attr_start) * 1000

        topo_start = time.time()
        topology_predicates = self._infer_topology_predicates(
            selected_nodes, min_coverage, min_selectivity, max_predicates_per_type
        )
        (time.time() - topo_start) * 1000

        total_time = (time.time() - start_time) * 1000

        return PredicateInferenceResult(
            attribute_predicates=attribute_predicates,
            topology_predicates=topology_predicates,
            computation_time=total_time,
            selection_size=len(selected_nodes),
        )

    def _compute_matching_nodes(
        self, predicate: AttributePredicate | TopologyPredicate
    ) -> list[str]:
        """Compute the actual nodes that match the given predicate."""
        matching_nodes = []

        if isinstance(predicate, AttributePredicate):
            for node_id in self.all_nodes:
                if predicate.matches(node_id, self.graph):
                    matching_nodes.append(node_id)
        elif isinstance(predicate, TopologyPredicate):
            for node_id in self.all_nodes:
                if predicate.matches(node_id, self.metrics):
                    matching_nodes.append(node_id)

        return matching_nodes

    def _infer_attribute_predicates(
        self,
        nodes: list[str],
        min_coverage: float,
        min_selectivity: float,
        max_predicates: int,
    ) -> list[AttributePredicate]:
        predicates = []

        for attr in self.stats.categorical_distributions:
            common_values = self._find_common_categorical_values(
                nodes, attr, min_coverage
            )
            for value in common_values[:5]:
                predicate = AttributePredicate(
                    attribute=attr,
                    operator=PredicateOperator.EQUAL,
                    value=value,
                    coverage=0.0,
                    selectivity=0.0,
                    quality_score=0.0,
                )

                quality = calculate_predicate_quality(
                    predicate, nodes, self.all_nodes, self.graph
                )

                if (
                    quality.coverage >= min_coverage
                    and quality.selectivity >= min_selectivity
                ):
                    predicate.coverage = quality.coverage
                    predicate.selectivity = quality.selectivity
                    predicate.quality_score = quality.quality_score
                    predicate.matching_nodes = self._compute_matching_nodes(predicate)
                    predicates.append(predicate)

        for attr in self.stats.array_membership_index:
            common_members = self._find_common_array_members(nodes, attr, min_coverage)
            for member in common_members[:5]:
                predicate = AttributePredicate(
                    attribute=attr,
                    operator=PredicateOperator.MEMBERSHIP,
                    value=member,
                    coverage=0.0,
                    selectivity=0.0,
                    quality_score=0.0,
                )

                quality = calculate_predicate_quality(
                    predicate, nodes, self.all_nodes, self.graph
                )

                if (
                    quality.coverage >= min_coverage
                    and quality.selectivity >= min_selectivity
                ):
                    predicate.coverage = quality.coverage
                    predicate.selectivity = quality.selectivity
                    predicate.quality_score = quality.quality_score
                    predicate.matching_nodes = self._compute_matching_nodes(predicate)
                    predicates.append(predicate)

        for attr in self.stats.numerical_quartiles:
            numerical_predicates = self._find_numerical_predicates(
                nodes, attr, min_coverage
            )
            for pred in numerical_predicates:
                quality = calculate_predicate_quality(
                    pred, nodes, self.all_nodes, self.graph
                )

                if (
                    quality.coverage >= min_coverage
                    and quality.selectivity >= min_selectivity
                ):
                    pred.coverage = quality.coverage
                    pred.selectivity = quality.selectivity
                    pred.quality_score = quality.quality_score
                    predicates.append(pred)

        predicates.sort(key=lambda p: p.quality_score, reverse=True)
        return predicates[:max_predicates]

    def _infer_topology_predicates(
        self,
        nodes: list[str],
        min_coverage: float,
        min_selectivity: float,
        max_predicates: int,
    ) -> list[TopologyPredicate]:
        predicates = []

        for metric in ["degree", "betweenness", "closeness", "clustering", "pagerank"]:
            values = [self.metrics.get_metric(node, metric) for node in nodes]

            if not values:
                continue

            q75 = np.percentile(values, 75)
            median = np.percentile(values, 50)

            if q75 > 0:
                high_predicate = TopologyPredicate(
                    metric=metric,
                    operator=PredicateOperator.GREATER_THAN,
                    threshold=q75,
                    coverage=0.0,
                    selectivity=0.0,
                    quality_score=0.0,
                )

                quality = calculate_predicate_quality(
                    high_predicate, nodes, self.all_nodes, self.graph, self.metrics
                )

                if (
                    quality.coverage >= min_coverage
                    and quality.selectivity >= min_selectivity
                ):
                    high_predicate.coverage = quality.coverage
                    high_predicate.selectivity = quality.selectivity
                    high_predicate.quality_score = quality.quality_score
                    high_predicate.matching_nodes = self._compute_matching_nodes(
                        high_predicate
                    )
                    predicates.append(high_predicate)

            if median > 0:
                approx_predicate = TopologyPredicate(
                    metric=metric,
                    operator=PredicateOperator.EQUAL,
                    threshold=median,
                    coverage=0.0,
                    selectivity=0.0,
                    quality_score=0.0,
                )

                quality = calculate_predicate_quality(
                    approx_predicate, nodes, self.all_nodes, self.graph, self.metrics
                )

                if (
                    quality.coverage >= min_coverage
                    and quality.selectivity >= min_selectivity
                ):
                    approx_predicate.coverage = quality.coverage
                    approx_predicate.selectivity = quality.selectivity
                    approx_predicate.quality_score = quality.quality_score
                    approx_predicate.matching_nodes = self._compute_matching_nodes(
                        approx_predicate
                    )
                    predicates.append(approx_predicate)

        predicates.sort(key=lambda p: p.quality_score, reverse=True)
        return predicates[:max_predicates]

    def _find_common_categorical_values(
        self, nodes: list[str], attr: str, min_coverage: float
    ) -> list[str]:
        value_counts = {}

        for node_id in nodes:
            node_attrs = self.graph.nodes[node_id]
            if attr in node_attrs:
                value = str(node_attrs[attr])
                value_counts[value] = value_counts.get(value, 0) + 1

        threshold = len(nodes) * min_coverage
        common_values = [
            value for value, count in value_counts.items() if count >= threshold
        ]

        return sorted(common_values, key=lambda v: value_counts[v], reverse=True)

    def _find_common_array_members(
        self, nodes: list[str], attr: str, min_coverage: float
    ) -> list[str]:
        member_counts = {}

        for node_id in nodes:
            node_attrs = self.graph.nodes[node_id]
            if attr in node_attrs:
                node_value = node_attrs[attr]
                if isinstance(node_value, list | tuple):
                    for item in node_value:
                        member = str(item)
                        member_counts[member] = member_counts.get(member, 0) + 1
                else:
                    member = str(node_value)
                    member_counts[member] = member_counts.get(member, 0) + 1

        threshold = len(nodes) * min_coverage
        common_members = [
            member for member, count in member_counts.items() if count >= threshold
        ]

        return sorted(common_members, key=lambda m: member_counts[m], reverse=True)

    def _find_numerical_predicates(
        self, nodes: list[str], attr: str, min_coverage: float
    ) -> list[AttributePredicate]:
        values = []
        for node_id in nodes:
            node_attrs = self.graph.nodes[node_id]
            if attr in node_attrs:
                try:
                    values.append(float(node_attrs[attr]))
                except (ValueError, TypeError):
                    continue

        if not values:
            return []

        predicates = []

        q75 = np.percentile(values, 75)
        median = np.percentile(values, 50)

        if q75 > 0:
            predicates.append(
                AttributePredicate(
                    attribute=attr,
                    operator=PredicateOperator.GREATER_THAN,
                    value=q75,
                    coverage=0.0,
                    selectivity=0.0,
                    quality_score=0.0,
                )
            )

        if median > 0:
            predicates.append(
                AttributePredicate(
                    attribute=attr,
                    operator=PredicateOperator.EQUAL,
                    value=median,
                    coverage=0.0,
                    selectivity=0.0,
                    quality_score=0.0,
                )
            )

        return predicates

    @log_performance(logger)
    def infer_predicates_from_selection(
        self,
        selected_nodes: list[str],
        graph: nx.Graph,
        include_cross_space: bool = True,
        max_predicates_per_type: int = 10,
        min_coverage: float = 0.6,
        min_selectivity: float = 0.1,
    ) -> PredicateInferenceResult:
        """
        API-compatible method for predicate inference from node selection.
        This method bridges the API call to the internal inference logic.
        """
        logger.info(
            "🎯 API predicate inference request",
            extra={
                "selected_nodes_count": len(selected_nodes),
                "include_cross_space": include_cross_space,
                "graph_provided": graph is not None,
            },
        )

        # Update internal graph if a different one is provided
        if graph and graph != self.graph:
            logger.info(
                "📊 Updating inference engine with new graph",
                extra={
                    "new_graph_nodes": graph.number_of_nodes(),
                    "new_graph_edges": graph.number_of_edges(),
                },
            )
            self.graph = graph
            self.metrics = PrecomputedGraphMetrics(graph)
            self.stats = AttributeStatistics(graph)
            self.all_nodes = list(graph.nodes())

        return self.infer_predicates(
            selected_nodes=selected_nodes,
            min_coverage=min_coverage,
            min_selectivity=min_selectivity,
            max_predicates_per_type=max_predicates_per_type,
        )
