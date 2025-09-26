from typing import TYPE_CHECKING

import networkx as nx

if TYPE_CHECKING:
    pass

from .precomputed_metrics import PrecomputedGraphMetrics


def calculate_predicate_quality(
    predicate,
    selected_nodes: list[str],
    all_nodes: list[str],
    graph: nx.Graph,
    metrics: PrecomputedGraphMetrics = None,
):
    # Import at runtime to avoid circular imports
    from models.predicate_models import (
        AttributePredicate,
        PredicateQuality,
        TopologyPredicate,
    )

    if isinstance(predicate, AttributePredicate):
        matching_in_selection = sum(
            1 for node in selected_nodes if predicate.matches(node, graph)
        )
        matching_in_population = sum(
            1 for node in all_nodes if predicate.matches(node, graph)
        )
    elif isinstance(predicate, TopologyPredicate):
        if metrics is None:
            return PredicateQuality(coverage=0.0, selectivity=0.0, quality_score=0.0)

        matching_in_selection = sum(
            1 for node in selected_nodes if predicate.matches(node, metrics)
        )
        matching_in_population = sum(
            1 for node in all_nodes if predicate.matches(node, metrics)
        )
    else:
        return PredicateQuality(coverage=0.0, selectivity=0.0, quality_score=0.0)

    coverage = matching_in_selection / len(selected_nodes) if selected_nodes else 0.0
    selectivity = 1.0 - (matching_in_population / len(all_nodes)) if all_nodes else 0.0
    quality_score = (coverage * 0.7) + (selectivity * 0.3)

    return PredicateQuality(
        coverage=coverage, selectivity=selectivity, quality_score=quality_score
    )
