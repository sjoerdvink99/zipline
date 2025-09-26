import time
from dataclasses import dataclass
from typing import Any

import networkx as nx

from utils.logging_config import LogContext, get_logger

from ..compiler.fol_ast import (
    AtomicPredicate,
    CompoundPredicate,
    CrossSpacePredicate,
    EvaluationResult,
    FOLPredicateAST,
    QuantifiedPredicate,
)
from ..compiler.fol_parser import FOLPredicateParser, ParseError
from ..compiler.optimization import AdvancedQueryOptimizer, ExecutionProfiler

logger = get_logger("fol.evaluator")


@dataclass
class EvaluationStats:
    total_nodes_evaluated: int = 0
    cache_hits: int = 0
    cache_misses: int = 0
    evaluation_time_ms: float = 0
    nodes_matched: int = 0


@dataclass
class GraphSchema:
    node_types: set[str]
    node_attributes: dict[str, set[str]]
    attribute_domains: dict[str, str]
    structural_features: set[str]

    @classmethod
    def infer_from_graph(cls, graph: nx.Graph) -> "GraphSchema":
        node_types = set()
        node_attributes = {}
        attribute_domains = {}

        for _node_id, node_data in graph.nodes(data=True):
            node_type = node_data.get("type", "unknown")
            node_types.add(node_type)

            if node_type not in node_attributes:
                node_attributes[node_type] = set()

            for attr_key, attr_value in node_data.items():
                node_attributes[node_type].add(attr_key)

                if attr_key not in attribute_domains:
                    if isinstance(attr_value, bool):
                        attribute_domains[attr_key] = "boolean"
                    elif isinstance(attr_value, int | float):
                        attribute_domains[attr_key] = "numeric"
                    elif isinstance(attr_value, list):
                        attribute_domains[attr_key] = "array"
                    else:
                        attribute_domains[attr_key] = "categorical"

        structural_features = {
            "degree",
            "clustering",
            "betweenness_centrality",
            "closeness_centrality",
            "eigenvector_centrality",
        }

        return cls(node_types, node_attributes, attribute_domains, structural_features)


class GraphMetricsCache:
    def __init__(self):
        self._cache = {}
        self._graph_signature = None

    def invalidate(self):
        self._cache.clear()
        self._graph_signature = None

    def _get_graph_signature(self, graph: nx.Graph) -> str:
        return f"{graph.number_of_nodes()}_{graph.number_of_edges()}"

    def get_metric(self, graph: nx.Graph, metric_type: str, node_id: str = None) -> Any:
        signature = self._get_graph_signature(graph)

        if self._graph_signature != signature:
            self.invalidate()
            self._graph_signature = signature

        cache_key = f"{metric_type}_{node_id}" if node_id else metric_type

        if cache_key not in self._cache:
            self._cache[cache_key] = self._compute_metric(graph, metric_type, node_id)

        return self._cache[cache_key]

    def _compute_metric(
        self, graph: nx.Graph, metric_type: str, node_id: str = None
    ) -> Any:
        if metric_type == "clustering" and node_id:
            return nx.clustering(graph, node_id)
        elif metric_type == "betweenness_centrality":
            return nx.betweenness_centrality(graph)
        elif metric_type == "closeness_centrality":
            return nx.closeness_centrality(graph)
        elif metric_type == "eigenvector_centrality":
            try:
                return nx.eigenvector_centrality(graph)
            except nx.PowerIterationFailedConvergence:
                return dict.fromkeys(graph.nodes(), 0.0)

        return None


class FOLPredicateEvaluator:
    def __init__(self, enable_optimization: bool = True):
        self.parser = FOLPredicateParser()
        self.metrics_cache = GraphMetricsCache()
        self._evaluation_cache = {}
        self.enable_optimization = enable_optimization
        if enable_optimization:
            self.optimizer = AdvancedQueryOptimizer()
            self.profiler = ExecutionProfiler()

    def evaluate_expression(
        self,
        expression: str,
        graph: nx.Graph,
        project_variables: set[str] | None = None,
    ) -> tuple[EvaluationResult, EvaluationStats]:
        start_time = time.time()
        stats = EvaluationStats()

        with LogContext(
            logger,
            expression=expression,
            graph_nodes=graph.number_of_nodes(),
            graph_edges=graph.number_of_edges(),
        ):
            logger.info(
                "🚀 Starting FOL expression evaluation",
                extra={
                    "expression_raw": expression,
                    "expression_length": len(expression),
                    "project_variables": list(project_variables)
                    if project_variables
                    else None,
                    "optimization_enabled": self.enable_optimization,
                },
            )

            try:
                # Parse the expression
                logger.info(
                    "📝 Parsing FOL expression", extra={"expression": expression}
                )
                predicate = self.parser.parse(expression)
                logger.info(
                    "✅ FOL parsing successful",
                    extra={
                        "ast_type": type(predicate.ast).__name__,
                        "ast_description": predicate.description,
                        "ast_string": predicate.ast.to_string(),
                    },
                )

                # Evaluate the predicate
                logger.info(
                    "⚡ Evaluating FOL predicate",
                    extra={
                        "predicate_type": type(predicate.ast).__name__,
                        "has_projection": project_variables is not None,
                        "projection_vars": list(project_variables)
                        if project_variables
                        else None,
                    },
                )
                result = predicate.evaluate_nodes_with_projection(
                    graph, project_variables
                )
                logger.info(
                    "✅ FOL evaluation completed",
                    extra={
                        "result_type": type(result).__name__,
                        "matched_nodes_count": len(result.matching_nodes),
                        "has_projections": bool(result.projections),
                        "projections_count": len(result.projections)
                        if result.projections
                        else 0,
                    },
                )

                stats.total_nodes_evaluated = graph.number_of_nodes()
                stats.nodes_matched = len(result.matching_nodes)
                stats.evaluation_time_ms = (time.time() - start_time) * 1000

                logger.info(
                    "✅ FOL expression evaluation successful",
                    extra={
                        "evaluation_time_ms": round(stats.evaluation_time_ms, 2),
                        "nodes_matched": stats.nodes_matched,
                        "match_ratio": round(
                            stats.nodes_matched / stats.total_nodes_evaluated, 3
                        )
                        if stats.total_nodes_evaluated > 0
                        else 0,
                        "has_projection": bool(result.projections),
                    },
                )

                return result, stats

            except ParseError as e:
                evaluation_time = (time.time() - start_time) * 1000
                logger.error(
                    "❌ FOL expression parsing failed",
                    extra={
                        "evaluation_time_ms": round(evaluation_time, 2),
                        "error": str(e),
                    },
                )
                raise ValueError(f"Invalid FOL expression: {e}") from e
            except Exception as e:
                evaluation_time = (time.time() - start_time) * 1000
                logger.error(
                    "❌ FOL expression evaluation failed",
                    extra={
                        "evaluation_time_ms": round(evaluation_time, 2),
                        "error": str(e),
                        "error_type": type(e).__name__,
                    },
                )
                raise

    def evaluate_predicate(
        self,
        predicate: CrossSpacePredicate,
        graph: nx.Graph,
        project_variables: set[str] | None = None,
    ) -> tuple[EvaluationResult, EvaluationStats]:
        start_time = time.time()
        stats = EvaluationStats()

        if self.enable_optimization:
            predicate_id = f"pred_{hash(predicate.ast.to_string())}"

            def evaluation_func():
                query_plan = self.optimizer.optimize_predicate(predicate, graph)
                optimized_predicate = CrossSpacePredicate(
                    query_plan.ast, predicate.description
                )
                return optimized_predicate.evaluate_nodes_with_projection(
                    graph, project_variables
                )

            result = self.profiler.profile_execution(
                predicate_id, graph, evaluation_func
            )

            performance_insights = self.profiler.get_performance_insights(predicate_id)
            stats.cache_hits = performance_insights.get("execution_count", 0) - 1

        else:
            result = predicate.evaluate_nodes_with_projection(graph, project_variables)

        stats.total_nodes_evaluated = graph.number_of_nodes()
        stats.nodes_matched = len(result.matching_nodes)
        stats.evaluation_time_ms = (time.time() - start_time) * 1000

        return result, stats

    def validate_expression(self, expression: str, graph: nx.Graph) -> dict[str, Any]:
        try:
            predicate = self.parser.parse(expression)
            schema = GraphSchema.infer_from_graph(graph)

            validation_result = {
                "valid": True,
                "errors": [],
                "warnings": [],
                "inferred_types": {},
            }

            free_variables = predicate.ast.get_free_variables()
            for var in free_variables:
                validation_result["inferred_types"][var] = "node"

            self._validate_ast_against_schema(predicate.ast, schema, validation_result)

            return validation_result

        except ParseError as e:
            return {
                "valid": False,
                "errors": [str(e)],
                "warnings": [],
                "inferred_types": {},
            }

    def _validate_ast_against_schema(
        self, ast: FOLPredicateAST, schema: GraphSchema, result: dict[str, Any]
    ):
        if isinstance(ast, AtomicPredicate):
            self._validate_atomic_predicate(ast, schema, result)
        elif isinstance(ast, CompoundPredicate):
            for operand in ast.operands:
                self._validate_ast_against_schema(operand, schema, result)
        elif isinstance(ast, QuantifiedPredicate):
            if ast.variable.type_constraint:
                if ast.variable.type_constraint not in schema.node_types:
                    result["warnings"].append(
                        f"Type constraint '{ast.variable.type_constraint}' not found in graph"
                    )

            self._validate_ast_against_schema(ast.constraint, schema, result)

    def _validate_atomic_predicate(
        self, predicate: AtomicPredicate, schema: GraphSchema, result: dict[str, Any]
    ):
        if predicate.predicate_type.startswith("attr_"):
            attr_name = predicate.predicate_type[5:]

            found_in_type = False
            for _node_type, attributes in schema.node_attributes.items():
                if attr_name in attributes:
                    found_in_type = True
                    break

            if not found_in_type:
                result["warnings"].append(
                    f"Attribute '{attr_name}' not found in any node type"
                )

        elif predicate.predicate_type in schema.structural_features:
            pass
        else:
            result["warnings"].append(
                f"Unknown predicate type: '{predicate.predicate_type}'"
            )

    def get_optimization_suggestions(
        self, expression: str, graph: nx.Graph
    ) -> list[str]:
        suggestions = []

        try:
            predicate = self.parser.parse(expression)

            if self._has_expensive_operations(predicate.ast):
                suggestions.append(
                    "Consider reordering predicates to place cheaper constraints first"
                )

            if self._has_repeated_patterns(predicate.ast):
                suggestions.append("Detected repeated patterns that could be cached")

            if graph.number_of_nodes() > 10000:
                suggestions.append(
                    "For large graphs, consider using node type constraints to reduce search space"
                )

        except ParseError:
            pass

        return suggestions

    def _has_expensive_operations(self, ast: FOLPredicateAST) -> bool:
        if isinstance(ast, AtomicPredicate):
            return ast.predicate_type.endswith("_centrality")
        elif isinstance(ast, CompoundPredicate):
            return any(self._has_expensive_operations(op) for op in ast.operands)
        elif isinstance(ast, QuantifiedPredicate):
            return True

        return False

    def _has_repeated_patterns(self, ast: FOLPredicateAST) -> bool:
        patterns = []
        self._collect_patterns(ast, patterns)
        return len(patterns) != len({str(p) for p in patterns})

    def _collect_patterns(self, ast: FOLPredicateAST, patterns: list):
        patterns.append(ast)

        if isinstance(ast, CompoundPredicate):
            for operand in ast.operands:
                self._collect_patterns(operand, patterns)
        elif isinstance(ast, QuantifiedPredicate):
            self._collect_patterns(ast.constraint, patterns)


class QueryOptimizer:
    def __init__(self):
        self.evaluator = FOLPredicateEvaluator()

    def optimize_predicate(
        self, predicate: CrossSpacePredicate, graph: nx.Graph
    ) -> CrossSpacePredicate:
        optimized_ast = self._optimize_ast(predicate.ast, graph)
        return CrossSpacePredicate(optimized_ast, predicate.description)

    def _optimize_ast(self, ast: FOLPredicateAST, graph: nx.Graph) -> FOLPredicateAST:
        if isinstance(ast, CompoundPredicate):
            return self._optimize_compound_predicate(ast, graph)
        elif isinstance(ast, QuantifiedPredicate):
            return self._optimize_quantified_predicate(ast, graph)

        return ast

    def _optimize_compound_predicate(
        self, predicate: CompoundPredicate, graph: nx.Graph
    ) -> FOLPredicateAST:
        optimized_operands = [
            self._optimize_ast(op, graph) for op in predicate.operands
        ]

        if predicate.connective.name == "AND":
            optimized_operands.sort(
                key=lambda op: self._estimate_selectivity(op, graph)
            )

        return CompoundPredicate(predicate.connective, optimized_operands)

    def _optimize_quantified_predicate(
        self, predicate: QuantifiedPredicate, graph: nx.Graph
    ) -> FOLPredicateAST:
        optimized_constraint = self._optimize_ast(predicate.constraint, graph)

        return QuantifiedPredicate(
            predicate.quantifier,
            predicate.variable,
            predicate.relation,
            predicate.target,
            optimized_constraint,
            predicate.k_parameter,
            predicate.count_parameter,
        )

    def _estimate_selectivity(self, ast: FOLPredicateAST, graph: nx.Graph) -> float:
        if isinstance(ast, AtomicPredicate):
            if ast.predicate_type == "degree":
                return 0.1
            elif ast.predicate_type.startswith("attr_"):
                return 0.3
            elif ast.predicate_type.endswith("_centrality"):
                return 0.8
        elif isinstance(ast, QuantifiedPredicate):
            return 0.9

        return 0.5
