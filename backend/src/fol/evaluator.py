from __future__ import annotations

import time
from dataclasses import dataclass, field

import networkx as nx

from fol.ast import (
    Conjunction,
    Disjunction,
    FOLNode,
    NeighborhoodQuantifier,
    SetComprehension,
    Variable,
)


@dataclass
class EvaluationResult:
    bindings: list[dict[str, str]] = field(default_factory=list)
    evaluation_time_ms: float = 0.0

    @property
    def nodes(self) -> set[str]:
        if not self.bindings:
            return set()

        first_var = "x" if self.bindings and "x" in self.bindings[0] else None
        if first_var is None and self.bindings:
            first_var = list(self.bindings[0].keys())[0]

        if first_var:
            return {b[first_var] for b in self.bindings if first_var in b}
        return set()

    @property
    def tuples(self) -> list[tuple[str, ...]]:
        return [tuple(b.values()) for b in self.bindings]

    def __len__(self) -> int:
        return len(self.bindings)

    def __bool__(self) -> bool:
        return len(self.bindings) > 0


class Evaluator:
    def evaluate(
        self,
        graph: nx.Graph,
        predicate: FOLNode | SetComprehension,
        project_variables: list[Variable] | None = None,
    ) -> EvaluationResult:
        start_time = time.time()

        if isinstance(predicate, SetComprehension):
            return self._evaluate_comprehension(graph, predicate, start_time)

        free_vars = predicate.free_variables()

        if len(free_vars) == 0:
            result = predicate.evaluate(graph, {})
            elapsed = (time.time() - start_time) * 1000
            return EvaluationResult(
                bindings=[{}] if result else [],
                evaluation_time_ms=elapsed,
            )

        if len(free_vars) == 1:
            return self._evaluate_single_variable(
                graph, predicate, list(free_vars)[0], start_time
            )

        return self._evaluate_multi_variable(
            graph, predicate, free_vars, project_variables, start_time
        )

    def _evaluate_comprehension(
        self,
        graph: nx.Graph,
        comprehension: SetComprehension,
        start_time: float,
    ) -> EvaluationResult:
        inner_result = self.evaluate(
            graph,
            comprehension.predicate,
            comprehension.variables,
        )

        elapsed = (time.time() - start_time) * 1000
        return EvaluationResult(
            bindings=inner_result.bindings,
            evaluation_time_ms=elapsed,
        )

    def _evaluate_single_variable(
        self,
        graph: nx.Graph,
        predicate: FOLNode,
        var_name: str,
        start_time: float,
    ) -> EvaluationResult:
        bindings: list[dict[str, str]] = []

        for node_id in graph.nodes():
            if predicate.evaluate(graph, {var_name: node_id}):
                bindings.append({var_name: node_id})

        elapsed = (time.time() - start_time) * 1000
        return EvaluationResult(bindings=bindings, evaluation_time_ms=elapsed)

    def _evaluate_multi_variable(
        self,
        graph: nx.Graph,
        predicate: FOLNode,
        free_vars: set[str],
        project_variables: list[Variable] | None,
        start_time: float,
    ) -> EvaluationResult:
        primary_var = "x" if "x" in free_vars else sorted(free_vars)[0]
        other_vars = sorted(v for v in free_vars if v != primary_var)

        bindings: list[dict[str, str]] = []
        project_names = (
            {v.name for v in project_variables} if project_variables else None
        )

        for primary_node in graph.nodes():
            base_binding = {primary_var: primary_node}

            if not other_vars:
                if predicate.evaluate(graph, base_binding):
                    bindings.append(base_binding)
                continue

            if self._has_neighborhood_structure(predicate):
                self._enumerate_neighborhood_bindings(
                    graph, predicate, base_binding, other_vars, bindings, project_names
                )
            else:
                self._enumerate_all_bindings(
                    graph, predicate, base_binding, other_vars, bindings, project_names
                )

        elapsed = (time.time() - start_time) * 1000
        return EvaluationResult(bindings=bindings, evaluation_time_ms=elapsed)

    def _has_neighborhood_structure(self, predicate: FOLNode) -> bool:
        if isinstance(predicate, NeighborhoodQuantifier):
            return True
        if isinstance(predicate, Conjunction | Disjunction):
            return any(
                self._has_neighborhood_structure(op) for op in predicate.operands
            )
        return False

    def _enumerate_neighborhood_bindings(
        self,
        graph: nx.Graph,
        predicate: FOLNode,
        base_binding: dict[str, str],
        other_vars: list[str],
        bindings: list[dict[str, str]],
        project_names: set[str] | None,
    ) -> None:
        primary_node = list(base_binding.values())[0]

        candidates = set(graph.neighbors(primary_node))
        for n in list(candidates):
            candidates.update(graph.neighbors(n))
        candidates.discard(primary_node)

        for candidate in candidates:
            for var_name in other_vars:
                test_binding = {**base_binding, var_name: candidate}
                if predicate.evaluate(graph, test_binding):
                    if project_names is None or all(
                        v in project_names for v in test_binding
                    ):
                        bindings.append(test_binding)

    def _enumerate_all_bindings(
        self,
        graph: nx.Graph,
        predicate: FOLNode,
        base_binding: dict[str, str],
        other_vars: list[str],
        bindings: list[dict[str, str]],
        project_names: set[str] | None,
    ) -> None:
        primary_node = list(base_binding.values())[0]

        for other_node in graph.nodes():
            if other_node == primary_node:
                continue

            for var_name in other_vars:
                test_binding = {**base_binding, var_name: other_node}
                if predicate.evaluate(graph, test_binding):
                    if project_names is None or all(
                        v in project_names for v in test_binding
                    ):
                        bindings.append(test_binding)
