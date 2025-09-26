from abc import ABC, abstractmethod

import networkx as nx

from .formal_types import LogicalOperator


class BasePredicate(ABC):
    def __init__(self, id: str, description: str):
        self.id = id
        self.description = description

    @abstractmethod
    def evaluate(self, graph: nx.Graph, node_id: str) -> bool:
        pass

    @abstractmethod
    def get_applicable_nodes(self, graph: nx.Graph) -> set[str]:
        pass

    @abstractmethod
    def validate(self, graph: nx.Graph) -> bool:
        pass

    def __and__(self, other: "BasePredicate") -> "CompoundPredicate":
        return CompoundPredicate(self, other, LogicalOperator.AND)

    def __or__(self, other: "BasePredicate") -> "CompoundPredicate":
        return CompoundPredicate(self, other, LogicalOperator.OR)

    def __invert__(self) -> "NegatedPredicate":
        return NegatedPredicate(self)


class CompoundPredicate(BasePredicate):
    def __init__(
        self, left: BasePredicate, right: BasePredicate, operator: LogicalOperator
    ):
        self.left = left
        self.right = right
        self.operator = operator
        super().__init__(
            f"{left.id}_{operator.value}_{right.id}",
            f"({left.description} {operator.value} {right.description})",
        )

    def evaluate(self, graph: nx.Graph, node_id: str) -> bool:
        left_result = self.left.evaluate(graph, node_id)
        right_result = self.right.evaluate(graph, node_id)

        if self.operator == LogicalOperator.AND:
            return left_result and right_result
        elif self.operator == LogicalOperator.OR:
            return left_result or right_result
        else:
            raise ValueError(f"Unsupported operator: {self.operator}")

    def get_applicable_nodes(self, graph: nx.Graph) -> set[str]:
        left_nodes = self.left.get_applicable_nodes(graph)
        right_nodes = self.right.get_applicable_nodes(graph)

        if self.operator == LogicalOperator.AND:
            return left_nodes.intersection(right_nodes)
        elif self.operator == LogicalOperator.OR:
            return left_nodes.union(right_nodes)
        else:
            raise ValueError(f"Unsupported operator: {self.operator}")

    def validate(self, graph: nx.Graph) -> bool:
        return self.left.validate(graph) and self.right.validate(graph)


class NegatedPredicate(BasePredicate):
    def __init__(self, predicate: BasePredicate):
        self.predicate = predicate
        super().__init__(f"not_{predicate.id}", f"NOT ({predicate.description})")

    def evaluate(self, graph: nx.Graph, node_id: str) -> bool:
        return not self.predicate.evaluate(graph, node_id)

    def get_applicable_nodes(self, graph: nx.Graph) -> set[str]:
        all_nodes = {str(node) for node in graph.nodes()}
        predicate_nodes = self.predicate.get_applicable_nodes(graph)
        return all_nodes.difference(predicate_nodes)

    def validate(self, graph: nx.Graph) -> bool:
        return self.predicate.validate(graph)


class NodeTypeConstraint:
    def __init__(self, allowed_types: list | None = None):
        self.allowed_types = set(allowed_types) if allowed_types else None

    def is_applicable(self, graph: nx.Graph, node_id: str) -> bool:
        if self.allowed_types is None:
            return True

        node_type = graph.nodes[node_id].get("type", "unknown")
        return node_type in self.allowed_types

    def filter_nodes(self, graph: nx.Graph, node_ids: set[str]) -> set[str]:
        if self.allowed_types is None:
            return node_ids

        return {node_id for node_id in node_ids if self.is_applicable(graph, node_id)}


class TypedPredicate(BasePredicate):
    def __init__(self, base_predicate: BasePredicate, node_types: list | None = None):
        self.base_predicate = base_predicate
        self.constraint = NodeTypeConstraint(node_types)
        super().__init__(
            f"typed_{base_predicate.id}",
            f"{base_predicate.description} (types: {node_types or 'any'})",
        )

    def evaluate(self, graph: nx.Graph, node_id: str) -> bool:
        if not self.constraint.is_applicable(graph, node_id):
            return False
        return self.base_predicate.evaluate(graph, node_id)

    def get_applicable_nodes(self, graph: nx.Graph) -> set[str]:
        base_nodes = self.base_predicate.get_applicable_nodes(graph)
        return self.constraint.filter_nodes(graph, base_nodes)

    def validate(self, graph: nx.Graph) -> bool:
        return self.base_predicate.validate(graph)
