from __future__ import annotations

import logging
import math
import weakref
from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING, Any

import networkx as nx

from fol.learning.feature_filter import FeatureFilter
from fol.learning.neighborhood_index import (
    NeighborhoodIndex,
    NeighborhoodLiteralSpec,
    QuantifierType,
)
from fol.learning.threshold_finder import LiteralOperator, ThresholdFinder
from fol.topology import TopologyMetrics

if TYPE_CHECKING:
    from fol.learning.scoring import EnrichmentScorer

logger = logging.getLogger(__name__)

_shared_neighborhood_index: dict[int, NeighborhoodIndex] = {}
_neighborhood_graph_refs: dict[int, weakref.ref] = {}


def _get_learning_neighborhood_index(graph: nx.Graph) -> NeighborhoodIndex:
    graph_id = id(graph)
    ref = _neighborhood_graph_refs.get(graph_id)
    if ref is not None and ref() is None:
        del _shared_neighborhood_index[graph_id]
        del _neighborhood_graph_refs[graph_id]
    if graph_id not in _shared_neighborhood_index:
        _shared_neighborhood_index[graph_id] = NeighborhoodIndex(graph)
        _neighborhood_graph_refs[graph_id] = weakref.ref(graph)
    return _shared_neighborhood_index[graph_id]


class LiteralType(Enum):
    ATTRIBUTE_EQ = "attribute_eq"
    ATTRIBUTE_NUMERIC = "attribute_numeric"
    TOPOLOGY = "topology"
    TYPE = "type"
    LIFTED = "lifted"
    NEIGHBORHOOD = "neighborhood"


@dataclass(slots=True)
class Literal:
    literal_type: LiteralType
    attribute: str
    operator: LiteralOperator
    value: Any
    score: float
    coverage: float
    matching_nodes: set[str]
    neighborhood_spec: NeighborhoodLiteralSpec | None = None

    @property
    def fol_string(self) -> str:
        if self.literal_type == LiteralType.TYPE:
            return f'{self.attribute}(x) = "{self.value}"'
        if self.literal_type == LiteralType.LIFTED:
            return f'{self.attribute}(x) = "{self.value}"'
        if self.literal_type == LiteralType.NEIGHBORHOOD:
            return (
                self.neighborhood_spec.to_fol_string() if self.neighborhood_spec else ""
            )
        if self.literal_type in (
            LiteralType.ATTRIBUTE_EQ,
            LiteralType.ATTRIBUTE_NUMERIC,
            LiteralType.TOPOLOGY,
        ):
            if isinstance(self.value, str):
                return f'{self.attribute}(x) {self.operator.value} "{self.value}"'
            return f"{self.attribute}(x) {self.operator.value} {self.value}"
        return ""


class LiteralGenerator:
    NUMERIC_TOPOLOGY_METRICS = [
        "degree",
        "k_core",
        "pagerank",
        "betweenness_centrality",
        "closeness_centrality",
        "clustering_coefficient",
    ]

    CATEGORICAL_TOPOLOGY_METRICS = [
        "louvain_community",
        "component",
    ]

    FAST_NUMERIC_METRICS = [
        "degree",
        "k_core",
        "pagerank",
        "clustering_coefficient",
    ]
    FAST_CATEGORICAL_METRICS = ["louvain_community", "component"]

    def __init__(
        self,
        use_slow_metrics: bool = False,
        min_score: float = 1.0,
        max_literals_per_attribute: int = 3,
        feature_filter: FeatureFilter | None = None,
        max_base_literals_for_neighborhood: int = 10,
        enable_neighborhood_literals: bool = True,
        edge_schema: dict | None = None,
        enable_typed_2hop: bool = True,
    ):
        self.use_slow_metrics = use_slow_metrics
        self.min_score = min_score
        self.max_literals_per_attribute = max_literals_per_attribute
        self.max_base_literals_for_neighborhood = max_base_literals_for_neighborhood
        self.enable_neighborhood_literals = enable_neighborhood_literals
        self._edge_schema = edge_schema
        self.enable_typed_2hop = enable_typed_2hop
        self._topology_cache: dict[int, TopologyMetrics] = {}
        self._threshold_finder = ThresholdFinder()
        self._feature_filter = feature_filter or FeatureFilter()

    def generate(
        self,
        graph: nx.Graph,
        selected_nodes: set[str],
        scorer: EnrichmentScorer | None = None,
        universe: frozenset | None = None,
    ) -> list[Literal]:
        from fol.learning.scoring import EnrichmentScorer

        total_nodes = len(universe) if universe is not None else len(graph.nodes())

        if self._edge_schema is None and self.enable_typed_2hop:
            from fol.schema import extract_edge_schema

            self._edge_schema = extract_edge_schema(graph)

        logger.info(
            f"Starting literal generation for {len(selected_nodes)} selected nodes out of {total_nodes} universe nodes"
        )

        if scorer:
            min_support_tau = scorer.min_support_tau
        else:
            min_support_tau = EnrichmentScorer.compute_min_support_tau(total_nodes)
            scorer = EnrichmentScorer(min_support_tau)

        logger.info(f"Minimum support threshold: {min_support_tau}")

        base_literals = []

        type_literals = self._generate_type_literals(
            graph, selected_nodes, total_nodes, min_support_tau, universe=universe
        )
        logger.info(f"Generated {len(type_literals)} type literals")
        base_literals.extend(type_literals)

        attr_literals = self._generate_attribute_literals(
            graph, selected_nodes, total_nodes, min_support_tau, universe=universe
        )
        logger.info(f"Generated {len(attr_literals)} attribute literals")
        base_literals.extend(attr_literals)

        topo_literals = self._generate_topology_literals(
            graph, selected_nodes, total_nodes, min_support_tau, universe=universe
        )
        logger.info(f"Generated {len(topo_literals)} topology literals")
        base_literals.extend(topo_literals)

        lifted_literals = self._generate_lifted_literals(
            graph, selected_nodes, total_nodes, min_support_tau, universe=universe
        )
        logger.info(f"Generated {len(lifted_literals)} lifted literals")
        base_literals.extend(lifted_literals)

        logger.info(f"Total base literals before filtering: {len(base_literals)}")
        base_literals = self._filter_and_deduplicate_literals(base_literals)
        logger.info(f"Base literals after filtering: {len(base_literals)}")

        if self.enable_neighborhood_literals and base_literals:
            logger.info("Generating neighborhood literals...")
            top_base_literals = base_literals[: self.max_base_literals_for_neighborhood]

            neighborhood_literals = self._generate_neighborhood_literals(
                graph,
                selected_nodes,
                top_base_literals,
                total_nodes,
                min_support_tau,
                scorer,
                universe=universe,
            )
            logger.info(f"Generated {len(neighborhood_literals)} neighborhood literals")
            base_literals.extend(neighborhood_literals)

        logger.info(f"Total literals before ranking: {len(base_literals)}")
        final_literals = self._rank_literals(base_literals)
        logger.info(f"Final ranked literals: {len(final_literals)}")

        if logger.isEnabledFor(logging.DEBUG):
            for i, lit in enumerate(final_literals[:10]):
                logger.debug(
                    f"Top literal {i + 1}: {lit.fol_string} (score={lit.score:.3f}, coverage={lit.coverage:.3f})"
                )

        return final_literals

    def _generate_type_literals(
        self,
        graph: nx.Graph,
        selected_nodes: set[str],
        total_nodes: int,
        min_support_tau: int,
        universe: frozenset | None = None,
    ) -> list[Literal]:
        type_to_nodes: dict[str, set[str]] = {}

        type_attr_key = "type"
        for node_id in graph.nodes():
            data = graph.nodes[node_id]
            if "node_type" in data:
                type_attr_key = "node_type"
                break
            elif "type" in data:
                type_attr_key = "type"
                break
            elif "label" in data:
                type_attr_key = "label"
                break

        nodes_to_consider = universe if universe is not None else graph.nodes()
        for node_id in nodes_to_consider:
            data = graph.nodes[node_id]
            node_type = data.get(type_attr_key)
            if node_type:
                if node_type not in type_to_nodes:
                    type_to_nodes[node_type] = set()
                type_to_nodes[node_type].add(node_id)

        literals: list[Literal] = []
        for type_name, matching in type_to_nodes.items():
            score, coverage = self._compute_enrichment_metrics(
                matching, selected_nodes, total_nodes, min_support_tau
            )
            if score >= self.min_score:
                literals.append(
                    Literal(
                        literal_type=LiteralType.TYPE,
                        attribute=type_attr_key,
                        operator=LiteralOperator.EQ,
                        value=type_name,
                        score=score,
                        coverage=coverage,
                        matching_nodes=matching,
                    )
                )
        return literals

    def _generate_attribute_literals(
        self,
        graph: nx.Graph,
        selected_nodes: set[str],
        total_nodes: int,
        min_support_tau: int,
        universe: frozenset | None = None,
    ) -> list[Literal]:
        attr_values: dict[str, dict[Any, set[str]]] = {}
        numeric_attrs: dict[str, dict[str, float]] = {}
        n_nodes = total_nodes

        nodes_to_consider = universe if universe is not None else graph.nodes()
        for node_id in nodes_to_consider:
            data = graph.nodes[node_id]
            for attr_name, attr_value in data.items():
                if attr_name in ("node_type", "type", "label"):
                    continue
                if isinstance(attr_value, list):
                    continue
                if self._feature_filter.is_excluded_by_name(attr_name):
                    continue

                if isinstance(attr_value, int | float) and not isinstance(
                    attr_value, bool
                ):
                    numeric_value = float(attr_value)
                    if math.isfinite(numeric_value):
                        if attr_name not in numeric_attrs:
                            numeric_attrs[attr_name] = {}
                        numeric_attrs[attr_name][node_id] = numeric_value
                else:
                    if attr_name not in attr_values:
                        attr_values[attr_name] = {}
                    if attr_value not in attr_values[attr_name]:
                        attr_values[attr_name][attr_value] = set()
                    attr_values[attr_name][attr_value].add(node_id)

        literals: list[Literal] = []

        for attr_name, values in attr_values.items():
            value_counts = {v: len(nodes) for v, nodes in values.items()}
            n_observed = sum(value_counts.values())
            if self._feature_filter.is_categorical_identifier(
                attr_name, value_counts, n_observed
            ):
                continue

            values = self._feature_filter.filter_categorical_values(values)

            attr_literals: list[Literal] = []
            for value, matching in values.items():
                score, coverage = self._compute_enrichment_metrics(
                    matching, selected_nodes, total_nodes, min_support_tau
                )
                if score >= self.min_score:
                    attr_literals.append(
                        Literal(
                            literal_type=LiteralType.ATTRIBUTE_EQ,
                            attribute=attr_name,
                            operator=LiteralOperator.EQ,
                            value=value,
                            score=score,
                            coverage=coverage,
                            matching_nodes=matching,
                        )
                    )

            attr_literals.sort(key=lambda lit: lit.score, reverse=True)
            literals.extend(attr_literals[: self.max_literals_per_attribute])

        for attr_name, metric_values in numeric_attrs.items():
            if self._feature_filter.is_numeric_identifier(
                attr_name, metric_values, n_nodes
            ):
                continue

            thresholds = self._threshold_finder.find_optimal_thresholds(
                metric_values,
                selected_nodes,
                total_nodes,
                min_support_tau,
                max_thresholds=self.max_literals_per_attribute,
            )
            for t in thresholds:
                if t.score >= self.min_score:
                    matching = self._get_matching_for_threshold(
                        metric_values, t.operator, t.value
                    )
                    literals.append(
                        Literal(
                            literal_type=LiteralType.ATTRIBUTE_NUMERIC,
                            attribute=attr_name,
                            operator=t.operator,
                            value=t.value,
                            score=t.score,
                            coverage=t.coverage,
                            matching_nodes=matching,
                        )
                    )

        return literals

    def _generate_topology_literals(
        self,
        graph: nx.Graph,
        selected_nodes: set[str],
        total_nodes: int,
        min_support_tau: int,
        universe: frozenset | None = None,
    ) -> list[Literal]:
        graph_id = id(graph)
        if graph_id not in self._topology_cache:
            self._topology_cache[graph_id] = TopologyMetrics(graph)
        topology = self._topology_cache[graph_id]

        numeric_metrics = (
            self.FAST_NUMERIC_METRICS
            if not self.use_slow_metrics
            else self.NUMERIC_TOPOLOGY_METRICS
        )
        categorical_metrics = (
            self.FAST_CATEGORICAL_METRICS
            if not self.use_slow_metrics
            else self.CATEGORICAL_TOPOLOGY_METRICS
        )

        nodes_to_consider = universe if universe is not None else graph.nodes()
        literals: list[Literal] = []

        for metric in numeric_metrics:
            values: dict[str, float] = {}
            for node_id in nodes_to_consider:
                node_str = str(node_id)
                values[node_str] = topology.get_metric(node_str, metric)

            thresholds = self._threshold_finder.find_optimal_thresholds(
                values,
                selected_nodes,
                total_nodes,
                min_support_tau,
                max_thresholds=self.max_literals_per_attribute,
            )
            for t in thresholds:
                if t.score >= self.min_score:
                    matching = self._get_matching_for_threshold(
                        values, t.operator, t.value
                    )
                    literals.append(
                        Literal(
                            literal_type=LiteralType.TOPOLOGY,
                            attribute=metric,
                            operator=t.operator,
                            value=t.value,
                            score=t.score,
                            coverage=t.coverage,
                            matching_nodes=matching,
                        )
                    )

        for metric in categorical_metrics:
            category_to_nodes: dict[str, set[str]] = {}

            for node_id in nodes_to_consider:
                node_str = str(node_id)
                category = topology.get_category(node_str, metric)
                if category is not None:
                    category_str = str(category)
                    if category_str not in category_to_nodes:
                        category_to_nodes[category_str] = set()
                    category_to_nodes[category_str].add(node_str)

            category_literals: list[Literal] = []
            for category_value, matching in category_to_nodes.items():
                score, coverage = self._compute_enrichment_metrics(
                    matching, selected_nodes, total_nodes, min_support_tau
                )
                if score >= self.min_score:
                    category_literals.append(
                        Literal(
                            literal_type=LiteralType.TOPOLOGY,
                            attribute=metric,
                            operator=LiteralOperator.EQ,
                            value=category_value,
                            score=score,
                            coverage=coverage,
                            matching_nodes=matching,
                        )
                    )

            category_literals.sort(key=lambda lit: lit.score, reverse=True)
            literals.extend(category_literals[: self.max_literals_per_attribute])

        return literals

    def _generate_lifted_literals(
        self,
        graph: nx.Graph,
        selected_nodes: set[str],
        total_nodes: int,
        min_support_tau: int,
        universe: frozenset | None = None,
    ) -> list[Literal]:
        lifted_values: dict[str, dict[str, set[str]]] = {}

        nodes_to_consider = universe if universe is not None else graph.nodes()
        for node_id in nodes_to_consider:
            data = graph.nodes[node_id]
            for attr_name, attr_value in data.items():
                if not isinstance(attr_value, list):
                    continue
                if self._feature_filter.is_excluded_by_name(attr_name):
                    continue
                if attr_name not in lifted_values:
                    lifted_values[attr_name] = {}
                for item in attr_value:
                    item_str = str(item)
                    if item_str not in lifted_values[attr_name]:
                        lifted_values[attr_name][item_str] = set()
                    lifted_values[attr_name][item_str].add(node_id)

        literals: list[Literal] = []
        for attr_name, values in lifted_values.items():
            attr_literals: list[Literal] = []
            for value, matching in values.items():
                score, coverage = self._compute_enrichment_metrics(
                    matching, selected_nodes, total_nodes, min_support_tau
                )
                if score >= self.min_score:
                    attr_literals.append(
                        Literal(
                            literal_type=LiteralType.LIFTED,
                            attribute=attr_name,
                            operator=LiteralOperator.EQ,
                            value=value,
                            score=score,
                            coverage=coverage,
                            matching_nodes=matching,
                        )
                    )

            attr_literals.sort(key=lambda lit: lit.score, reverse=True)
            literals.extend(attr_literals[: self.max_literals_per_attribute])

        return literals

    def _generate_neighborhood_literals(
        self,
        graph: nx.Graph,
        selected_nodes: set[str],
        base_literals: list[Literal],
        total_nodes: int,
        min_support_tau: int,
        scorer: EnrichmentScorer,
        universe: frozenset | None = None,
    ) -> list[Literal]:
        logger.info(
            f"Generating neighborhood literals from {len(base_literals)} base literals"
        )

        neighborhood_index = _get_learning_neighborhood_index(graph)

        top_base_literals = base_literals[: self.max_base_literals_for_neighborhood]

        neighborhood_literals = []
        neighborhood_min_score = max(0.1, self.min_score * 0.3)

        for i, base_literal in enumerate(top_base_literals):
            logger.debug(
                f"Processing base literal {i + 1}/{len(top_base_literals)}: {base_literal.fol_string}"
            )

            base_predicate_name = self._get_base_predicate_name(base_literal)
            base_matches = base_literal.matching_nodes

            exists_spec = NeighborhoodLiteralSpec(
                quantifier=QuantifierType.EXISTS,
                k_hop=1,
                base_predicates=(base_predicate_name,),
            )
            exists_matches = neighborhood_index.evaluate_neighborhood_literal(
                exists_spec, base_matches
            )
            if universe is not None:
                exists_matches = exists_matches & universe

            if exists_matches:
                exists_score, exists_coverage = self._compute_enrichment_metrics(
                    exists_matches, selected_nodes, total_nodes, min_support_tau
                )
                if exists_score >= neighborhood_min_score:
                    neighborhood_literals.append(
                        Literal(
                            literal_type=LiteralType.NEIGHBORHOOD,
                            attribute=f"exists_{base_literal.attribute}",
                            operator=LiteralOperator.EQ,
                            value="neighborhood",
                            score=exists_score,
                            coverage=exists_coverage,
                            matching_nodes=exists_matches,
                            neighborhood_spec=exists_spec,
                        )
                    )

            forall_spec = NeighborhoodLiteralSpec(
                quantifier=QuantifierType.FORALL,
                k_hop=1,
                base_predicates=(base_predicate_name,),
            )
            forall_matches = neighborhood_index.evaluate_neighborhood_literal(
                forall_spec, base_matches
            )
            if universe is not None:
                forall_matches = forall_matches & universe

            if forall_matches:
                forall_score, forall_coverage = self._compute_enrichment_metrics(
                    forall_matches, selected_nodes, total_nodes, min_support_tau
                )
                if forall_score >= neighborhood_min_score:
                    neighborhood_literals.append(
                        Literal(
                            literal_type=LiteralType.NEIGHBORHOOD,
                            attribute=f"forall_{base_literal.attribute}",
                            operator=LiteralOperator.EQ,
                            value="neighborhood",
                            score=forall_score,
                            coverage=forall_coverage,
                            matching_nodes=forall_matches,
                            neighborhood_spec=forall_spec,
                        )
                    )

            for count_threshold in [1, 2, 3]:
                count_spec = NeighborhoodLiteralSpec(
                    quantifier=QuantifierType.COUNT_GE,
                    k_hop=1,
                    base_predicates=(base_predicate_name,),
                    threshold=count_threshold,
                )
                count_matches = neighborhood_index.evaluate_neighborhood_literal(
                    count_spec, base_matches
                )
                if universe is not None:
                    count_matches = count_matches & universe

                if count_matches and len(count_matches) >= min_support_tau:
                    count_score, count_coverage = self._compute_enrichment_metrics(
                        count_matches, selected_nodes, total_nodes, min_support_tau
                    )
                    if count_score >= neighborhood_min_score:
                        neighborhood_literals.append(
                            Literal(
                                literal_type=LiteralType.NEIGHBORHOOD,
                                attribute=f"count_{count_threshold}_{base_literal.attribute}",
                                operator=LiteralOperator.EQ,
                                value="neighborhood",
                                score=count_score,
                                coverage=count_coverage,
                                matching_nodes=count_matches,
                                neighborhood_spec=count_spec,
                            )
                        )

        conj_base_literals = top_base_literals[:5]
        for i in range(len(conj_base_literals)):
            for j in range(i + 1, len(conj_base_literals)):
                base_i = conj_base_literals[i]
                base_j = conj_base_literals[j]
                name_i = self._get_base_predicate_name(base_i)
                name_j = self._get_base_predicate_name(base_j)

                conjunct_matches = base_i.matching_nodes & base_j.matching_nodes
                if len(conjunct_matches) < min_support_tau:
                    continue

                for quantifier in (QuantifierType.EXISTS, QuantifierType.FORALL):
                    conj_spec = NeighborhoodLiteralSpec(
                        quantifier=quantifier,
                        k_hop=1,
                        base_predicates=(name_i, name_j),
                    )
                    conj_matches = neighborhood_index.evaluate_neighborhood_literal(
                        conj_spec, conjunct_matches
                    )
                    if universe is not None:
                        conj_matches = conj_matches & universe

                    if not conj_matches or len(conj_matches) < min_support_tau:
                        continue

                    conj_score, conj_coverage = self._compute_enrichment_metrics(
                        conj_matches, selected_nodes, total_nodes, min_support_tau
                    )
                    if conj_score >= neighborhood_min_score:
                        q_prefix = (
                            "exists"
                            if quantifier == QuantifierType.EXISTS
                            else "forall"
                        )
                        neighborhood_literals.append(
                            Literal(
                                literal_type=LiteralType.NEIGHBORHOOD,
                                attribute=f"{q_prefix}_{name_i}_and_{name_j}",
                                operator=LiteralOperator.EQ,
                                value="neighborhood",
                                score=conj_score,
                                coverage=conj_coverage,
                                matching_nodes=conj_matches,
                                neighborhood_spec=conj_spec,
                            )
                        )

        if self.enable_typed_2hop and self._edge_schema:
            typed_2hop = self._generate_typed_2hop_literals(
                graph,
                selected_nodes,
                top_base_literals,
                total_nodes,
                min_support_tau,
                scorer,
                neighborhood_index,
                universe=universe,
            )
            neighborhood_literals.extend(typed_2hop)
            logger.info(
                f"Generated {len(typed_2hop)} typed 2-hop neighborhood literals"
            )
        else:
            logger.debug("Typed 2-hop generation skipped (no schema or disabled)")

        neighbor_topo = self._generate_neighbor_topology_literals(
            graph,
            selected_nodes,
            total_nodes,
            min_support_tau,
            scorer,
            neighborhood_index,
            universe=universe,
        )
        neighborhood_literals.extend(neighbor_topo)
        logger.info(f"Generated {len(neighbor_topo)} neighbor topology literals")

        logger.info(f"Generated {len(neighborhood_literals)} neighborhood literals")
        return neighborhood_literals

    def _generate_neighbor_topology_literals(
        self,
        graph: nx.Graph,
        selected_nodes: set[str],
        total_nodes: int,
        min_support_tau: int,
        scorer: EnrichmentScorer,
        neighborhood_index: NeighborhoodIndex,
        universe: frozenset | None = None,
    ) -> list[Literal]:
        """Generate ∃y ∈ neighbors(x) : topology(y) >= θ literals.

        For each node x in the universe, computes the max topology metric value
        over its 1-hop neighbors. This enables discovering cross-space patterns
        such as turbines connected to high-degree substations, where the selected
        nodes themselves (turbines) would not score well on the metric directly.
        """
        graph_id = id(graph)
        if graph_id not in self._topology_cache:
            self._topology_cache[graph_id] = TopologyMetrics(graph)
        topology = self._topology_cache[graph_id]

        numeric_metrics = (
            self.FAST_NUMERIC_METRICS
            if not self.use_slow_metrics
            else self.NUMERIC_TOPOLOGY_METRICS
        )
        neighborhood_min_score = max(0.1, self.min_score * 0.3)

        nodes_to_consider: frozenset | set = (
            universe
            if universe is not None
            else frozenset(str(n) for n in graph.nodes())
        )
        all_graph_node_strs = [str(n) for n in graph.nodes()]

        literals: list[Literal] = []

        for metric in numeric_metrics:
            # For each node in the universe, compute the max topology metric
            # value over its 1-hop neighbors (neighbors may be outside the universe).
            max_neighbor_values: dict[str, float] = {}
            for node_id in nodes_to_consider:
                node_str = str(node_id)
                neighbors = neighborhood_index.get_neighbors(node_str)
                if not neighbors:
                    max_neighbor_values[node_str] = 0.0
                    continue
                neighbor_vals = [topology.get_metric(nb, metric) for nb in neighbors]
                max_neighbor_values[node_str] = max(neighbor_vals)

            thresholds = self._threshold_finder.find_optimal_thresholds(
                max_neighbor_values,
                selected_nodes,
                total_nodes,
                min_support_tau,
                max_thresholds=self.max_literals_per_attribute,
            )

            # Pre-compute full-graph metric values for base_matches computation.
            full_metric_values: dict[str, float] = {
                n: topology.get_metric(n, metric) for n in all_graph_node_strs
            }

            for t in thresholds:
                if t.score < neighborhood_min_score:
                    continue
                # Only generate EXISTS for GTE/GT — corresponds to max-neighbor >= threshold.
                if t.operator not in (LiteralOperator.GTE, LiteralOperator.GT):
                    continue

                full_base_matches = self._get_matching_for_threshold(
                    full_metric_values, t.operator, t.value
                )

                val = t.value
                val_str = str(int(val)) if val == int(val) else str(val)
                base_predicate_name = f"{metric}(y) {t.operator.value} {val_str}"

                exists_spec = NeighborhoodLiteralSpec(
                    quantifier=QuantifierType.EXISTS,
                    k_hop=1,
                    base_predicates=(base_predicate_name,),
                )

                exists_matches = neighborhood_index.evaluate_neighborhood_literal(
                    exists_spec, full_base_matches
                )
                if universe is not None:
                    exists_matches = exists_matches & universe

                if not exists_matches or len(exists_matches) < min_support_tau:
                    continue

                score_result = scorer.score_clause(
                    exists_matches, selected_nodes, total_nodes
                )
                if (
                    not score_result.is_valid
                    or score_result.score < neighborhood_min_score
                ):
                    continue

                literals.append(
                    Literal(
                        literal_type=LiteralType.NEIGHBORHOOD,
                        attribute=f"exists_neighbor_{metric}",
                        operator=LiteralOperator.EQ,
                        value="neighborhood",
                        score=score_result.score,
                        coverage=score_result.coverage,
                        matching_nodes=exists_matches,
                        neighborhood_spec=exists_spec,
                    )
                )

        return literals

    def _generate_typed_2hop_literals(
        self,
        graph: nx.Graph,
        selected_nodes: set[str],
        base_literals: list[Literal],
        total_nodes: int,
        min_support_tau: int,
        scorer: EnrichmentScorer,
        neighborhood_index: NeighborhoodIndex,
        universe: frozenset | None = None,
    ) -> list[Literal]:
        from fol.schema import enumerate_2hop_paths

        schema = self._edge_schema
        if not schema:
            return []

        valid_paths = enumerate_2hop_paths(schema, exclude_sibling_bridges=True)
        if not valid_paths:
            return []

        top_base = base_literals[: min(5, len(base_literals))]
        neighborhood_min_score = max(0.1, self.min_score * 0.3)
        typed_literals: list[Literal] = []

        for path_pair in valid_paths:
            path = tuple(path_pair)
            path_str = ".".join(s.edge_type for s in path)

            for base_literal in top_base:
                base_predicate_name = self._get_base_predicate_name(base_literal)
                base_matches = base_literal.matching_nodes

                for quantifier in (QuantifierType.EXISTS, QuantifierType.FORALL):
                    spec = NeighborhoodLiteralSpec(
                        quantifier=quantifier,
                        k_hop=2,
                        base_predicates=(base_predicate_name,),
                        path=path,
                    )
                    matches = neighborhood_index.evaluate_neighborhood_literal(
                        spec, base_matches
                    )
                    if universe is not None:
                        matches = matches & universe
                    if not matches or len(matches) < min_support_tau:
                        continue

                    score_result = scorer.score_clause(
                        matches, selected_nodes, total_nodes
                    )
                    if (
                        not score_result.is_valid
                        or score_result.score < neighborhood_min_score
                    ):
                        continue

                    q_prefix = (
                        "exists" if quantifier == QuantifierType.EXISTS else "forall"
                    )
                    typed_literals.append(
                        Literal(
                            literal_type=LiteralType.NEIGHBORHOOD,
                            attribute=f"{q_prefix}_2hop_{path_str}_{base_literal.attribute}",
                            operator=LiteralOperator.EQ,
                            value="neighborhood",
                            score=score_result.score,
                            coverage=score_result.coverage,
                            matching_nodes=matches,
                            neighborhood_spec=spec,
                        )
                    )

                for count_threshold in [1, 2, 3]:
                    count_spec = NeighborhoodLiteralSpec(
                        quantifier=QuantifierType.COUNT_GE,
                        k_hop=2,
                        base_predicates=(base_predicate_name,),
                        threshold=count_threshold,
                        path=path,
                    )
                    count_matches = neighborhood_index.evaluate_neighborhood_literal(
                        count_spec, base_matches
                    )
                    if universe is not None:
                        count_matches = count_matches & universe
                    if not count_matches or len(count_matches) < min_support_tau:
                        continue

                    count_score_result = scorer.score_clause(
                        count_matches, selected_nodes, total_nodes
                    )
                    if (
                        not count_score_result.is_valid
                        or count_score_result.score < neighborhood_min_score
                    ):
                        continue

                    typed_literals.append(
                        Literal(
                            literal_type=LiteralType.NEIGHBORHOOD,
                            attribute=f"count_{count_threshold}_2hop_{path_str}_{base_literal.attribute}",
                            operator=LiteralOperator.EQ,
                            value="neighborhood",
                            score=count_score_result.score,
                            coverage=count_score_result.coverage,
                            matching_nodes=count_matches,
                            neighborhood_spec=count_spec,
                        )
                    )

        return typed_literals

    def _filter_and_deduplicate_literals(
        self, literals: list[Literal]
    ) -> list[Literal]:
        unique_literals = []
        seen_signatures = set()

        for literal in literals:
            signature = f"{literal.literal_type.value}_{literal.attribute}_{literal.operator.value}_{literal.value}"
            if signature not in seen_signatures:
                unique_literals.append(literal)
                seen_signatures.add(signature)

        return unique_literals

    def _rank_literals(self, literals: list[Literal]) -> list[Literal]:
        literals.sort(key=lambda lit: (-lit.score, -len(lit.matching_nodes)))
        return literals

    def _compute_enrichment_metrics(
        self,
        matching_nodes: set[str],
        selected_nodes: set[str],
        total_nodes: int,
        min_support_tau: int,
    ) -> tuple[float, float]:
        from fol.learning.scoring import EnrichmentScorer

        scorer = EnrichmentScorer(min_support_tau)
        result = scorer.score_clause(matching_nodes, selected_nodes, total_nodes)
        return result.score if result.is_valid else 0.0, result.coverage

    def _get_matching_for_threshold(
        self,
        values: dict[str, float],
        operator: LiteralOperator,
        threshold: float,
    ) -> set[str]:
        matching: set[str] = set()
        for node_id, value in values.items():
            passes = False
            if operator == LiteralOperator.GT:
                passes = value > threshold
            elif operator == LiteralOperator.GTE:
                passes = value >= threshold
            elif operator == LiteralOperator.LT:
                passes = value < threshold
            elif operator == LiteralOperator.LTE:
                passes = value <= threshold
            elif operator == LiteralOperator.EQ:
                passes = value == threshold
            elif operator == LiteralOperator.NEQ:
                passes = value != threshold
            if passes:
                matching.add(node_id)
        return matching

    def _get_base_predicate_name(self, literal: Literal) -> str:
        return literal.fol_string.replace("(x)", "(y)")
