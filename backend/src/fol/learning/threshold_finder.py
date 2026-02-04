from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum

import numpy as np


class LiteralOperator(Enum):
    EQ = "="
    NEQ = "!="
    GT = ">"
    GTE = ">="
    LT = "<"
    LTE = "<="


@dataclass(frozen=True, slots=True)
class Threshold:
    operator: LiteralOperator
    value: float
    score: float
    coverage: float
    support: int
    pi_clause: float


class ThresholdFinder:
    def __init__(
        self,
        min_samples: int = 2,
        rounding_strategy: str = "smart",
    ):
        self.min_samples = min_samples
        self.rounding_strategy = rounding_strategy

    def find_optimal_thresholds(
        self,
        metric_values: dict[str, float],
        selected_nodes: set[str],
        total_nodes: int,
        min_support_tau: int,
        max_thresholds: int = 5,
    ) -> list[Threshold]:
        pos_values = [metric_values[n] for n in selected_nodes if n in metric_values]
        all_values_dict = dict(metric_values)

        if len(pos_values) < self.min_samples:
            return []

        all_values = sorted(set(metric_values.values()))
        if not all_values:
            return []

        candidate_points = self._generate_candidate_points(all_values, pos_values)
        thresholds: list[Threshold] = []

        P = len(selected_nodes)
        pi = P / total_nodes if total_nodes > 0 else 0.0

        for point in candidate_points:
            for op in [LiteralOperator.GTE, LiteralOperator.GT]:
                score, coverage, support, pi_clause = (
                    self._evaluate_threshold_enrichment(
                        point,
                        op,
                        all_values_dict,
                        selected_nodes,
                        total_nodes,
                        pi,
                        min_support_tau,
                    )
                )
                if score > 0:
                    thresholds.append(
                        Threshold(
                            operator=op,
                            value=self._round_value(point),
                            score=score,
                            coverage=coverage,
                            support=support,
                            pi_clause=pi_clause,
                        )
                    )

        thresholds.sort(key=lambda t: t.score, reverse=True)
        return self._deduplicate_thresholds(thresholds)[:max_thresholds]

    def _generate_candidate_points(
        self,
        all_values: list[float],
        pos_values: list[float],
    ) -> list[float]:
        candidates: set[float] = set()

        candidates.add(min(pos_values))
        candidates.add(max(pos_values))
        candidates.add(float(np.mean(pos_values)))
        candidates.add(float(np.median(pos_values)))

        if len(pos_values) >= 4:
            candidates.add(float(np.percentile(pos_values, 25)))
            candidates.add(float(np.percentile(pos_values, 75)))

        for i in range(len(all_values) - 1):
            midpoint = (all_values[i] + all_values[i + 1]) / 2
            candidates.add(midpoint)

        return sorted(candidates)

    def _evaluate_threshold_enrichment(
        self,
        threshold: float,
        operator: LiteralOperator,
        all_values: dict[str, float],
        selected_nodes: set[str],
        total_nodes: int,
        pi: float,
        min_support_tau: int,
    ) -> tuple[float, float, int, float]:
        matching_nodes = set()
        for node_id, value in all_values.items():
            if self._value_passes_threshold(value, threshold, operator):
                matching_nodes.add(node_id)

        p = len(matching_nodes & selected_nodes)
        support = len(matching_nodes)

        if support < min_support_tau:
            return 0.0, 0.0, support, 0.0

        pi_clause = p / support

        if pi_clause <= pi or pi <= 0:
            return 0.0, 0.0, support, pi_clause

        n = support - p
        p_term = p * math.log(pi_clause / pi)
        n_term = n * math.log((1.0 - pi_clause) / (1.0 - pi)) if n > 0 else 0.0
        score = p_term + n_term
        coverage = p / len(selected_nodes) if len(selected_nodes) > 0 else 0.0

        return score, coverage, support, pi_clause

    def _value_passes_threshold(
        self,
        value: float,
        threshold: float,
        operator: LiteralOperator,
    ) -> bool:
        if operator == LiteralOperator.GT:
            return value > threshold
        elif operator == LiteralOperator.GTE:
            return value >= threshold
        elif operator == LiteralOperator.LT:
            return value < threshold
        elif operator == LiteralOperator.LTE:
            return value <= threshold
        elif operator == LiteralOperator.EQ:
            return value == threshold
        elif operator == LiteralOperator.NEQ:
            return value != threshold
        raise ValueError(f"Unknown operator: {operator}")

    def _round_value(self, value: float) -> float:
        if value == int(value):
            return float(int(value))
        if abs(value) < 0.01:
            return round(value, 4)
        if abs(value) < 1:
            return round(value, 3)
        if abs(value) < 100:
            return round(value, 2)
        return round(value, 1)

    def _deduplicate_thresholds(self, thresholds: list[Threshold]) -> list[Threshold]:
        seen: set[tuple[LiteralOperator, float]] = set()
        result: list[Threshold] = []
        for t in thresholds:
            key = (t.operator, t.value)
            if key not in seen:
                seen.add(key)
                result.append(t)
        return result
