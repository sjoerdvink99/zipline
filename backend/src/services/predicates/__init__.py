"""
Predicates Service Module

This module handles the generation of descriptive predicates from user selections
in topology and attribute spaces.

Key Components:
- DescriptiveGenerator: Generates predicates that describe node selections
- AttributePredicates: Handles attribute-based predicate logic
- TopologyPredicates: Handles topology-based predicate logic
"""

from .attribute_predicates import (
    AttributePredicate,
    detect_attribute_type,
    make_hashable,
    normalize_array_value,
)
from .descriptive import DescriptivePredicateGenerator
from .topology_predicates import TopologyPredicate

__all__ = [
    "DescriptivePredicateGenerator",
    "AttributePredicate",
    "TopologyPredicate",
    "detect_attribute_type",
    "make_hashable",
    "normalize_array_value",
]
