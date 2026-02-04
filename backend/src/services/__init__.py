from __future__ import annotations

from fol.inference import get_lifted_predicates, infer_predicates_from_selection

from .evaluator import PredicateResult, PredicateService

__all__ = [
    "PredicateResult",
    "PredicateService",
    "get_lifted_predicates",
    "infer_predicates_from_selection",
]
