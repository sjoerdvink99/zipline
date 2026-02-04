from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class EnrichmentScore:
    p: int
    n: int
    support: int
    pi: float
    pi_clause: float
    score: float
    coverage: float

    @property
    def is_valid(self) -> bool:
        return (
            self.support > 0
            and self.pi_clause > self.pi
            and self.score != float("-inf")
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "p": self.p,
            "n": self.n,
            "support": self.support,
            "pi": self.pi,
            "pi_clause": self.pi_clause,
            "score": self.score,
            "coverage": self.coverage,
        }


class EnrichmentScorer:
    def __init__(self, min_support_tau: int):
        self.min_support_tau = min_support_tau

    @staticmethod
    def _llr(p: int, n: int, pi: float, pi_clause: float) -> float:
        p_term = p * math.log(pi_clause / pi)
        n_term = n * math.log((1.0 - pi_clause) / (1.0 - pi)) if n > 0 else 0.0
        return p_term + n_term

    def score_clause(
        self,
        clause_matches: set[str],
        selected_nodes: set[str],
        total_nodes: int,
    ) -> EnrichmentScore:
        N = total_nodes
        P = len(selected_nodes)

        if P == 0 or N == 0:
            logger.warning("Invalid scoring input: P=0 or N=0")
            return EnrichmentScore(0, 0, 0, 0.0, 0.0, float("-inf"), 0.0)

        pi = P / N
        p = len(clause_matches & selected_nodes)
        n = len(clause_matches) - p
        support = p + n
        pi_clause = p / support if support > 0 else 0.0

        if support < self.min_support_tau:
            return EnrichmentScore(p, n, support, pi, pi_clause, float("-inf"), 0.0)

        if pi_clause <= pi:
            return EnrichmentScore(p, n, support, pi, pi_clause, float("-inf"), 0.0)

        score = self._llr(p, n, pi, pi_clause)
        coverage = p / P

        return EnrichmentScore(p, n, support, pi, pi_clause, score, coverage)

    def score_union(
        self,
        union_matches: set[str],
        selected_nodes: set[str],
        total_nodes: int,
    ) -> float:
        if not union_matches:
            return 0.0
        N = total_nodes
        P = len(selected_nodes)
        if P == 0 or N == 0:
            return 0.0
        pi = P / N
        p = len(union_matches & selected_nodes)
        n = len(union_matches) - p
        support = p + n
        if support == 0:
            return 0.0
        pi_union = p / support
        if pi_union <= pi:
            return 0.0
        return self._llr(p, n, pi, pi_union)

    def marginal_gain(
        self,
        candidate_matches: set[str],
        existing_matches: set[str],
        selected_nodes: set[str],
        total_nodes: int,
    ) -> float:
        new_union = existing_matches | candidate_matches
        return self.score_union(
            new_union, selected_nodes, total_nodes
        ) - self.score_union(existing_matches, selected_nodes, total_nodes)

    @staticmethod
    def compute_min_support_tau(total_nodes: int) -> int:
        return max(5, math.ceil(0.01 * total_nodes))
