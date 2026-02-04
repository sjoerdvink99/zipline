from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import networkx as nx

from fol import Evaluator as FOLEvaluator
from fol import parse
from fol.ast import Variable
from fol.inference import (
    get_lifted_predicates,
    infer_predicates_from_selection,
)

__all__ = [
    "PredicateResult",
    "PredicateService",
    "get_lifted_predicates",
    "infer_predicates_from_selection",
]


@dataclass
class PredicateResult:
    matching_nodes: list[str] = field(default_factory=list)
    projections: list[dict[str, Any]] | None = None
    fol_expression: str = ""
    evaluation_time_ms: float = 0.0
    errors: list[str] = field(default_factory=list)


class PredicateService:
    def __init__(self) -> None:
        self.evaluator = FOLEvaluator()

    def evaluate_expression(
        self,
        graph: nx.Graph,
        expression: str,
        project_variables: list[str] | None = None,
    ) -> PredicateResult:
        start_time = time.time()

        try:
            predicate = parse(expression)
        except Exception as e:
            return PredicateResult(
                fol_expression=expression,
                errors=[str(e)],
            )

        variables = (
            [Variable(v) for v in project_variables] if project_variables else None
        )
        result = self.evaluator.evaluate(graph, predicate, variables)
        evaluation_time_ms = (time.time() - start_time) * 1000

        matching_nodes = list(result.nodes)

        projections = None
        if project_variables and result.bindings:
            projections = self._format_projections(result.bindings, project_variables)

        return PredicateResult(
            matching_nodes=matching_nodes,
            projections=projections,
            fol_expression=predicate.to_fol(),
            evaluation_time_ms=evaluation_time_ms,
        )

    def _format_projections(
        self,
        bindings: list[dict[str, str]],
        project_variables: list[str],
    ) -> list[dict[str, Any]]:
        grouped: dict[str, dict[str, Any]] = {}

        for binding in bindings:
            primary_node = binding.get("x", list(binding.values())[0])

            if primary_node not in grouped:
                grouped[primary_node] = {"primary_node": primary_node}
                for var in project_variables:
                    grouped[primary_node][var] = []

            for var in project_variables:
                if var in binding and binding[var] not in grouped[primary_node][var]:
                    grouped[primary_node][var].append(binding[var])

        return list(grouped.values())
