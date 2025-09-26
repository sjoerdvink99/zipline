import time
from dataclasses import dataclass
from typing import Any

import networkx as nx

from utils.logging_config import get_logger

from .fol_ast import (
    AtomicPredicate,
    CompoundPredicate,
    CrossSpacePredicate,
    FOLPredicateAST,
    LogicalConnective,
    QuantifiedPredicate,
    Quantifier,
)

logger = get_logger("fol.optimization")


@dataclass
class OptimizationHint:
    priority: int
    description: str
    estimated_improvement: float


@dataclass
class QueryPlan:
    ast: FOLPredicateAST
    estimated_cost: float
    optimization_hints: list[OptimizationHint]
    execution_order: list[str]


class PredicateIndexManager:
    def __init__(self):
        self.attribute_indices: dict[str, dict[str, set[str]]] = {}
        self.structural_indices: dict[str, dict[float, set[str]]] = {}
        self.neighborhood_cache: dict[str, dict[str, set[str]]] = {}
        self._graph_signature = None

    def build_indices(self, graph: nx.Graph):
        signature = f"{graph.number_of_nodes()}_{graph.number_of_edges()}"
        if self._graph_signature == signature:
            return

        self._invalidate_indices()
        self._build_attribute_indices(graph)
        self._build_structural_indices(graph)
        self._build_neighborhood_cache(graph)
        self._graph_signature = signature

    def _invalidate_indices(self):
        self.attribute_indices.clear()
        self.structural_indices.clear()
        self.neighborhood_cache.clear()

    def _build_attribute_indices(self, graph: nx.Graph):
        for node_id, node_data in graph.nodes(data=True):
            for attr_key, attr_value in node_data.items():
                if attr_key not in self.attribute_indices:
                    self.attribute_indices[attr_key] = {}

                value_str = str(attr_value)
                if value_str not in self.attribute_indices[attr_key]:
                    self.attribute_indices[attr_key][value_str] = set()

                self.attribute_indices[attr_key][value_str].add(str(node_id))

    def _build_structural_indices(self, graph: nx.Graph):
        degree_index = {}
        for node_id in graph.nodes():
            degree = graph.degree[node_id]
            if degree not in degree_index:
                degree_index[degree] = set()
            degree_index[degree].add(str(node_id))

        self.structural_indices["degree"] = degree_index

        try:
            clustering = nx.clustering(graph)
            clustering_index = {}
            for node_id, clustering_value in clustering.items():
                rounded_value = round(clustering_value, 2)
                if rounded_value not in clustering_index:
                    clustering_index[rounded_value] = set()
                clustering_index[rounded_value].add(str(node_id))

            self.structural_indices["clustering"] = clustering_index
        except Exception:
            pass

    def _build_neighborhood_cache(self, graph: nx.Graph):
        for node_id in graph.nodes():
            neighbors = {str(n) for n in graph.neighbors(node_id)}
            if str(node_id) not in self.neighborhood_cache:
                self.neighborhood_cache[str(node_id)] = {}
            self.neighborhood_cache[str(node_id)]["neighbors"] = neighbors

            k_hop_2 = set()
            for neighbor in neighbors:
                k_hop_2.update(str(n) for n in graph.neighbors(neighbor))
            k_hop_2.discard(str(node_id))
            self.neighborhood_cache[str(node_id)]["k_hop_2"] = k_hop_2

    def get_candidates_for_attribute(
        self, attr_name: str, operator: str, value: Any
    ) -> set[str]:
        if attr_name not in self.attribute_indices:
            return set()

        value_str = str(value)

        if operator == "=":
            return self.attribute_indices[attr_name].get(value_str, set())
        elif operator == "!=":
            all_nodes = set()
            for v, nodes in self.attribute_indices[attr_name].items():
                if v != value_str:
                    all_nodes.update(nodes)
            return all_nodes
        elif operator == "in" and isinstance(value, list):
            result = set()
            for v in value:
                result.update(self.attribute_indices[attr_name].get(str(v), set()))
            return result

        return set()

    def get_candidates_for_structural(
        self, metric: str, operator: str, value: float
    ) -> set[str]:
        if metric not in self.structural_indices:
            return set()

        index = self.structural_indices[metric]
        result = set()

        if operator == "=":
            return index.get(value, set())
        elif operator == ">":
            for v, nodes in index.items():
                if v > value:
                    result.update(nodes)
        elif operator == ">=":
            for v, nodes in index.items():
                if v >= value:
                    result.update(nodes)
        elif operator == "<":
            for v, nodes in index.items():
                if v < value:
                    result.update(nodes)
        elif operator == "<=":
            for v, nodes in index.items():
                if v <= value:
                    result.update(nodes)

        return result

    def get_neighbors(
        self, node_id: str, relation: str, k: int | None = None
    ) -> set[str]:
        if node_id not in self.neighborhood_cache:
            return set()

        if relation == "neighbors":
            return self.neighborhood_cache[node_id].get("neighbors", set())
        elif relation == "k_hop" and k == 2:
            return self.neighborhood_cache[node_id].get("k_hop_2", set())

        return set()


class AdvancedQueryOptimizer:
    def __init__(self):
        self.index_manager = PredicateIndexManager()
        self.execution_stats = {}

    def optimize_predicate(
        self, predicate: CrossSpacePredicate, graph: nx.Graph
    ) -> QueryPlan:
        self.index_manager.build_indices(graph)

        optimized_ast = self._optimize_ast(predicate.ast, graph)
        estimated_cost = self._estimate_cost(optimized_ast, graph)
        hints = self._generate_optimization_hints(predicate.ast, optimized_ast, graph)
        execution_order = self._generate_execution_order(optimized_ast)

        return QueryPlan(
            ast=optimized_ast,
            estimated_cost=estimated_cost,
            optimization_hints=hints,
            execution_order=execution_order,
        )

    def _optimize_ast(self, ast: FOLPredicateAST, graph: nx.Graph) -> FOLPredicateAST:
        if isinstance(ast, CompoundPredicate):
            return self._optimize_compound(ast, graph)
        elif isinstance(ast, QuantifiedPredicate):
            return self._optimize_quantified(ast, graph)
        else:
            return ast

    def _optimize_compound(
        self, predicate: CompoundPredicate, graph: nx.Graph
    ) -> FOLPredicateAST:
        optimized_operands = [
            self._optimize_ast(op, graph) for op in predicate.operands
        ]

        if predicate.connective == LogicalConnective.AND:
            selectivity_scores = [
                (op, self._estimate_selectivity(op, graph)) for op in optimized_operands
            ]
            selectivity_scores.sort(key=lambda x: x[1])
            optimized_operands = [op for op, _ in selectivity_scores]

        return CompoundPredicate(predicate.connective, optimized_operands)

    def _optimize_quantified(
        self, predicate: QuantifiedPredicate, graph: nx.Graph
    ) -> FOLPredicateAST:
        optimized_constraint = self._optimize_ast(predicate.constraint, graph)

        if predicate.quantifier == Quantifier.EXISTS and isinstance(
            optimized_constraint, AtomicPredicate
        ):
            if self._can_use_index_for_exists(predicate, optimized_constraint):
                return self._create_index_optimized_exists(
                    predicate, optimized_constraint
                )

        return QuantifiedPredicate(
            predicate.quantifier,
            predicate.variable,
            predicate.relation,
            predicate.target,
            optimized_constraint,
            predicate.k_parameter,
            predicate.count_parameter,
        )

    def _can_use_index_for_exists(
        self, quantified: QuantifiedPredicate, constraint: AtomicPredicate
    ) -> bool:
        return constraint.predicate_type.startswith(
            "attr_"
        ) and constraint.operator.value in ["=", "!=", "in"]

    def _create_index_optimized_exists(
        self, quantified: QuantifiedPredicate, constraint: AtomicPredicate
    ):
        return quantified

    def _estimate_cost(self, ast: FOLPredicateAST, graph: nx.Graph) -> float:
        if isinstance(ast, AtomicPredicate):
            return self._estimate_atomic_cost(ast, graph)
        elif isinstance(ast, CompoundPredicate):
            return sum(self._estimate_cost(op, graph) for op in ast.operands)
        elif isinstance(ast, QuantifiedPredicate):
            base_cost = self._estimate_cost(ast.constraint, graph)
            avg_neighbors = (
                graph.number_of_edges() / graph.number_of_nodes()
                if graph.number_of_nodes() > 0
                else 1
            )
            return base_cost * avg_neighbors * graph.number_of_nodes()

        return 1.0

    def _estimate_atomic_cost(
        self, predicate: AtomicPredicate, graph: nx.Graph
    ) -> float:
        if predicate.predicate_type.startswith("attr_"):
            attr_name = predicate.predicate_type[5:]
            candidates = self.index_manager.get_candidates_for_attribute(
                attr_name, predicate.operator.value, predicate.value
            )
            return len(candidates) / max(graph.number_of_nodes(), 1)
        elif predicate.predicate_type == "degree":
            candidates = self.index_manager.get_candidates_for_structural(
                "degree", predicate.operator.value, predicate.value
            )
            return len(candidates) / max(graph.number_of_nodes(), 1)

        return 0.5

    def _estimate_selectivity(self, ast: FOLPredicateAST, graph: nx.Graph) -> float:
        if isinstance(ast, AtomicPredicate):
            return self._estimate_atomic_cost(ast, graph)
        elif isinstance(ast, CompoundPredicate):
            if ast.connective == LogicalConnective.AND:
                selectivities = [
                    self._estimate_selectivity(op, graph) for op in ast.operands
                ]
                return min(selectivities)
            elif ast.connective == LogicalConnective.OR:
                selectivities = [
                    self._estimate_selectivity(op, graph) for op in ast.operands
                ]
                return max(selectivities)
        elif isinstance(ast, QuantifiedPredicate):
            return 0.8

        return 0.5

    def _generate_optimization_hints(
        self, original: FOLPredicateAST, optimized: FOLPredicateAST, graph: nx.Graph
    ) -> list[OptimizationHint]:
        hints = []

        if self._has_expensive_centrality(original):
            hints.append(
                OptimizationHint(
                    priority=1,
                    description="Consider caching centrality calculations for repeated use",
                    estimated_improvement=0.3,
                )
            )

        if self._has_unindexed_attributes(original, graph):
            hints.append(
                OptimizationHint(
                    priority=2,
                    description="Some attributes could benefit from specialized indexing",
                    estimated_improvement=0.2,
                )
            )

        if graph.number_of_nodes() > 10000 and self._has_universal_quantifiers(
            original
        ):
            hints.append(
                OptimizationHint(
                    priority=1,
                    description="Universal quantifiers on large graphs - consider node type constraints",
                    estimated_improvement=0.4,
                )
            )

        return hints

    def _generate_execution_order(self, ast: FOLPredicateAST) -> list[str]:
        order = []
        self._collect_execution_steps(ast, order)
        return order

    def _collect_execution_steps(self, ast: FOLPredicateAST, order: list[str]):
        if isinstance(ast, AtomicPredicate):
            if ast.predicate_type.startswith("attr_"):
                order.append(
                    f"Filter by {ast.predicate_type[5:]} {ast.operator.value} {ast.value}"
                )
            else:
                order.append(f"Compute {ast.predicate_type}")
        elif isinstance(ast, CompoundPredicate):
            for operand in ast.operands:
                self._collect_execution_steps(operand, order)
            order.append(f"Combine with {ast.connective.value}")
        elif isinstance(ast, QuantifiedPredicate):
            order.append(
                f"For each node, check {ast.quantifier.value} {ast.relation.value}"
            )
            self._collect_execution_steps(ast.constraint, order)

    def _has_expensive_centrality(self, ast: FOLPredicateAST) -> bool:
        if isinstance(ast, AtomicPredicate):
            return ast.predicate_type.endswith("_centrality")
        elif isinstance(ast, CompoundPredicate):
            return any(self._has_expensive_centrality(op) for op in ast.operands)
        elif isinstance(ast, QuantifiedPredicate):
            return self._has_expensive_centrality(ast.constraint)
        return False

    def _has_unindexed_attributes(self, ast: FOLPredicateAST, graph: nx.Graph) -> bool:
        if isinstance(ast, AtomicPredicate) and ast.predicate_type.startswith("attr_"):
            attr_name = ast.predicate_type[5:]
            return attr_name not in self.index_manager.attribute_indices
        elif isinstance(ast, CompoundPredicate):
            return any(self._has_unindexed_attributes(op, graph) for op in ast.operands)
        elif isinstance(ast, QuantifiedPredicate):
            return self._has_unindexed_attributes(ast.constraint, graph)
        return False

    def _has_universal_quantifiers(self, ast: FOLPredicateAST) -> bool:
        if isinstance(ast, QuantifiedPredicate):
            return ast.quantifier == Quantifier.FORALL
        elif isinstance(ast, CompoundPredicate):
            return any(self._has_universal_quantifiers(op) for op in ast.operands)
        return False


class ExecutionProfiler:
    def __init__(self):
        self.profiles = {}

    def profile_execution(self, predicate_id: str, graph: nx.Graph, evaluation_func):
        start_time = time.time()
        start_memory = self._get_memory_usage()

        result = evaluation_func()

        end_time = time.time()
        end_memory = self._get_memory_usage()

        profile = {
            "execution_time": end_time - start_time,
            "memory_delta": end_memory - start_memory,
            "graph_nodes": graph.number_of_nodes(),
            "graph_edges": graph.number_of_edges(),
            "timestamp": start_time,
        }

        if predicate_id not in self.profiles:
            self.profiles[predicate_id] = []

        self.profiles[predicate_id].append(profile)

        return result

    def _get_memory_usage(self) -> float:
        try:
            import psutil

            return psutil.Process().memory_info().rss / 1024 / 1024
        except ImportError:
            return 0.0

    def get_performance_insights(self, predicate_id: str) -> dict[str, Any]:
        if predicate_id not in self.profiles:
            return {}

        profiles = self.profiles[predicate_id]
        if not profiles:
            return {}

        avg_time = sum(p["execution_time"] for p in profiles) / len(profiles)
        avg_memory = sum(p["memory_delta"] for p in profiles) / len(profiles)

        return {
            "average_execution_time": avg_time,
            "average_memory_usage": avg_memory,
            "execution_count": len(profiles),
            "performance_trend": self._calculate_trend(profiles),
        }

    def _calculate_trend(self, profiles: list[dict]) -> str:
        if len(profiles) < 3:
            return "insufficient_data"

        recent_avg = sum(p["execution_time"] for p in profiles[-3:]) / 3
        older_avg = sum(p["execution_time"] for p in profiles[:3]) / 3

        if recent_avg < older_avg * 0.9:
            return "improving"
        elif recent_avg > older_avg * 1.1:
            return "degrading"
        else:
            return "stable"
