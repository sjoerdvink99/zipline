"""
Evaluation Service Module

This module handles the evaluation of user-composed FOL predicates when the
"evaluate" button is clicked in the predicate builder.

Key Components:
- FOLEvaluator: Evaluates compiled FOL expressions
- UnifiedEvaluator: Unified evaluation interface
- ConstraintEvaluator: Evaluates constraint-based predicates
"""

from .fol_evaluator import FOLPredicateEvaluator
from .unified_evaluator import UnifiedPredicateEvaluator

__all__ = ["FOLPredicateEvaluator", "UnifiedPredicateEvaluator"]
