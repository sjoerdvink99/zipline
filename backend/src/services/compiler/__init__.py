"""
FOL (First-Order Logic) Compiler System

This module provides the FOL compilation system for converting frontend predicate
expressions into executable abstract syntax trees. This is strictly for compilation
and parsing - evaluation is handled by the evaluation module.

Core Components:
1. FOL Parser: Converts textual predicate expressions into Abstract Syntax Trees
2. AST Definitions: Type-safe representation of logical constructs
3. Base Predicates: Foundation predicate building blocks
4. Filter Chain: Chaining and optimization of compiled predicates
5. Optimization Engine: Query optimization and planning

The system supports:
- Cross-space predicates (topology + attribute constraints)
- Extended quantifiers (exactly, at_least, at_most)
- Array membership operations
- Complex logical compositions (AND, OR, NOT)
- Neighborhood constraints with variable binding

Implementation adheres to the formal semantics specified in formalism.md
"""

# Core FOL components
# Predicate building blocks
from .base_predicates import BasePredicate, NodeTypeConstraint, TypedPredicate
from .fol_ast import (
    AtomicPredicate,
    ComparisonOperator,
    CompoundPredicate,
    CrossSpacePredicate,
    FOLPredicateAST,
    LogicalConnective,
    QuantifiedPredicate,
    Quantifier,
    Relation,
)
from .fol_parser import FOLPredicateParser, ParseError, TemplatePredicateBuilder

# Type definitions
from .formal_types import (
    STRUCTURAL_FEATURES,
    AttributeType,
    BooleanOperator,
    CategoricalOperator,
    LogicalOperator,
    NumericOperator,
    PatternType,
    PredicateType,
    TemporalOperator,
)

# Compilation utilities (filter_chain excluded to avoid circular imports)
# Optimization
from .optimization import (
    AdvancedQueryOptimizer,
    ExecutionProfiler,
    OptimizationHint,
    QueryPlan,
)

__all__ = [
    # Core FOL
    "FOLPredicateAST",
    "AtomicPredicate",
    "CompoundPredicate",
    "QuantifiedPredicate",
    "CrossSpacePredicate",
    "Quantifier",
    "Relation",
    "LogicalConnective",
    "ComparisonOperator",
    "FOLPredicateParser",
    "ParseError",
    "TemplatePredicateBuilder",
    # Compilation
    "BasePredicate",
    "NodeTypeConstraint",
    "TypedPredicate",
    # Optimization
    "AdvancedQueryOptimizer",
    "ExecutionProfiler",
    "QueryPlan",
    "OptimizationHint",
    # Types
    "AttributeType",
    "LogicalOperator",
    "NumericOperator",
    "CategoricalOperator",
    "BooleanOperator",
    "TemporalOperator",
    "PatternType",
    "PredicateType",
    "STRUCTURAL_FEATURES",
]
