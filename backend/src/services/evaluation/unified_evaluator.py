from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import networkx as nx

from ..compiler.fol_ast import CrossSpacePredicate, EvaluationResult
from ..compiler.fol_parser import FOLPredicateParser, ParseError


@dataclass
class EvaluationContext:
    graph: nx.Graph
    session_id: str = "default"
    enable_optimization: bool = True
    enable_caching: bool = True


@dataclass
class PredicateEvaluationRequest:
    expression: str
    project_variables: list[str] | None = None
    context: EvaluationContext | None = None


@dataclass
class PredicateEvaluationResponse:
    matching_nodes: list[str]
    count: int
    projections: list[dict] | None = None
    evaluation_time_ms: float = 0.0
    validation_errors: list[str] | None = None


class UnifiedPredicateEvaluator:
    def __init__(self):
        self.parser = FOLPredicateParser()
        self._cache: dict[str, tuple[EvaluationResult, float]] = {}

    def evaluate(
        self, request: PredicateEvaluationRequest
    ) -> PredicateEvaluationResponse:
        import time

        start_time = time.time()

        try:
            predicate = self._parse_expression(request.expression)
            project_vars = (
                set(request.project_variables) if request.project_variables else None
            )

            result = predicate.evaluate_nodes_with_projection(
                request.context.graph, project_vars
            )

            evaluation_time = (time.time() - start_time) * 1000

            projections = None
            if result.projections:
                projections = [
                    {
                        "primary_node": proj.primary_node,
                        "projected_variables": proj.projected_variables,
                    }
                    for proj in result.projections
                ]

            return PredicateEvaluationResponse(
                matching_nodes=list(result.matching_nodes),
                count=len(result.matching_nodes),
                projections=projections,
                evaluation_time_ms=evaluation_time,
                validation_errors=None,
            )

        except ParseError as e:
            return PredicateEvaluationResponse(
                matching_nodes=[], count=0, validation_errors=[f"Parse error: {e}"]
            )
        except Exception as e:
            return PredicateEvaluationResponse(
                matching_nodes=[], count=0, validation_errors=[f"Evaluation error: {e}"]
            )

    def validate_expression(self, expression: str, graph: nx.Graph) -> dict[str, Any]:
        try:
            self.parser.parse(expression)
            return {"valid": True, "errors": [], "warnings": []}
        except ParseError as e:
            return {"valid": False, "errors": [str(e)], "warnings": []}

    def _parse_expression(self, expression: str) -> CrossSpacePredicate:
        return self.parser.parse(expression)

    def clear_cache(self):
        self._cache.clear()
