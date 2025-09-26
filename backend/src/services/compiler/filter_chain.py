from typing import Any

import networkx as nx

from ..predicates.attribute_predicates import AttributePredicate
from ..predicates.topology_predicates import TopologyPredicate
from .formal_types import LogicalOperator


class FilterItem:
    def __init__(
        self,
        predicate: AttributePredicate | TopologyPredicate,
        operator: LogicalOperator = LogicalOperator.AND,
    ):
        self.predicate = predicate
        self.operator = operator
        self.id = predicate.id


class FilterChain:
    def __init__(self):
        self.items: list[FilterItem] = []
        self.pattern_items: list = []
        self.global_operator = LogicalOperator.AND

    def add_predicate(
        self,
        predicate: AttributePredicate | TopologyPredicate,
        operator: LogicalOperator = LogicalOperator.AND,
    ) -> None:
        self.items.append(FilterItem(predicate, operator))

    def validate(self, graph: nx.Graph) -> list[str]:
        errors = []

        for item in self.items:
            try:
                if not item.predicate.validate(graph):
                    errors.append(f"Invalid predicate: {item.predicate.description}")
            except Exception as e:
                errors.append(
                    f"Error validating {item.predicate.description}: {str(e)}"
                )

        return errors


class FilterChainExecutor:
    def __init__(self, pattern_engine=None):
        self.pattern_engine = pattern_engine
        self.pattern_filter_engine = None

    def execute_predicate_chain(
        self, filter_chain: FilterChain, graph: nx.Graph
    ) -> set[str]:
        if not filter_chain.items:
            return {str(node) for node in graph.nodes()}

        result = filter_chain.items[0].predicate.get_applicable_nodes(graph)

        for item in filter_chain.items[1:]:
            predicate_result = item.predicate.get_applicable_nodes(graph)

            if item.operator == LogicalOperator.AND:
                result = result.intersection(predicate_result)
            elif item.operator == LogicalOperator.OR:
                result = result.union(predicate_result)
            elif item.operator == LogicalOperator.NOT:
                result = result.difference(predicate_result)

        return result

    def execute_pattern_chain(self, filter_chain: FilterChain) -> set[str]:
        if not filter_chain.pattern_items or not self.pattern_filter_engine:
            return set()

        return set()

    def execute_full_chain(
        self,
        filter_chain: FilterChain,
        graph: nx.Graph,
        combine_with_patterns: bool = False,
    ) -> dict[str, Any]:
        predicate_results = self.execute_predicate_chain(filter_chain, graph)
        pattern_results = self.execute_pattern_chain(filter_chain)

        if not combine_with_patterns or not pattern_results:
            return {
                "predicate_matches": list(predicate_results),
                "pattern_matches": list(pattern_results),
                "combined_matches": list(predicate_results),
                "count": len(predicate_results),
            }

        combined_results = predicate_results.intersection(pattern_results)

        return {
            "predicate_matches": list(predicate_results),
            "pattern_matches": list(pattern_results),
            "combined_matches": list(combined_results),
            "count": len(combined_results),
        }


class PredicateValidator:
    @staticmethod
    def validate_attribute_predicate(
        predicate: AttributePredicate, graph: nx.Graph
    ) -> list[str]:
        errors = []

        has_attribute = False
        for _node, data in graph.nodes(data=True):
            if predicate.attribute in data:
                has_attribute = True
                break

        if not has_attribute:
            errors.append(f"Attribute '{predicate.attribute}' not found in graph")

        if predicate.node_constraint.allowed_types:
            valid_types = set()
            for _node, data in graph.nodes(data=True):
                node_type = data.get("type", "unknown")
                valid_types.add(node_type)

            invalid_types = predicate.node_constraint.allowed_types - valid_types
            if invalid_types:
                errors.append(f"Invalid node types: {invalid_types}")

        return errors

    @staticmethod
    def validate_filter_chain(filter_chain: FilterChain, graph: nx.Graph) -> list[str]:
        errors = []

        for item in filter_chain.items:
            if isinstance(item.predicate, AttributePredicate):
                predicate_errors = PredicateValidator.validate_attribute_predicate(
                    item.predicate, graph
                )
                errors.extend(predicate_errors)

        if len(filter_chain.items) > 1:
            for i, item in enumerate(filter_chain.items[1:], 1):
                if (
                    item.operator == LogicalOperator.NOT
                    and i == len(filter_chain.items) - 1
                ):
                    errors.append("NOT operator cannot be the last operation")

        return errors
