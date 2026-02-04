from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class LiteralModel(BaseModel):
    type: str
    attribute: str
    operator: str
    value: Any
    score: float
    coverage: float
    precision: float | None = None


class LearnedPredicateModel(BaseModel):
    fol_expression: str
    display_expression: str
    p: int
    n: int
    coverage: float
    precision: float
    quality_score: float
    complexity: int
    matching_nodes: list[str]
    literals: list[LiteralModel] = Field(default_factory=list)
    clauses: list[list[LiteralModel]] = Field(default_factory=list)
    is_disjunction: bool = False


class LearnPredicateRequest(BaseModel):
    selected_nodes: list[str]
    negative_nodes: list[str] | None = None
    beam_width: int = 5
    max_depth: int = 3
    max_predicates: int = 5
    min_coverage: float = 0.5
    min_precision: float = 0.5
    coverage_weight: float = 0.5
    precision_weight: float = 0.4
    complexity_weight: float = 0.1


class LearnPredicateResponse(BaseModel):
    predicates: list[LearnedPredicateModel]
    best_predicate: LearnedPredicateModel | None
    learning_time_ms: float
    selection_size: int
    total_nodes: int


class ExplanatoryClauseModel(BaseModel):
    fol_expression: str
    p: int
    n: int
    support: int
    pi: float
    pi_clause: float
    score: float
    coverage: float
    matching_nodes: list[str]
    literals: list[LiteralModel]


class ExplanationRequest(BaseModel):
    selected_nodes: list[str]
    contrast_nodes: list[str] | None = None
    beam_width: int = Field(default=5, ge=1, le=20)
    max_clause_len: int = Field(default=4, ge=1, le=10)
    top_k: int = Field(default=5, ge=1, le=20)
    min_improvement: float = Field(default=1e-6, ge=0)
    max_evaluations: int = Field(default=5000, ge=100, le=50000)
    use_slow_metrics: bool = Field(default=False)


class ExplanationResponse(BaseModel):
    clauses: list[ExplanatoryClauseModel]
    learning_time_ms: float
    selection_size: int
    total_nodes: int
    contrast_size: int | None = None


class ContrastiveExplanationRequest(BaseModel):
    positive_nodes: list[str]
    negative_nodes: list[str]
    beam_width: int = Field(default=5, ge=1, le=20)
    max_clause_len: int = Field(default=4, ge=1, le=10)
    top_k: int = Field(default=5, ge=1, le=20)
    min_improvement: float = Field(default=1e-6, ge=0)
    max_evaluations: int = Field(default=5000, ge=100, le=50000)
    use_slow_metrics: bool = Field(default=False)


class DisjunctiveExplanationRequest(BaseModel):
    selected_nodes: list[str]
    contrast_nodes: list[str] | None = None
    beam_width: int = Field(default=5, ge=1, le=20)
    max_clause_len: int = Field(default=4, ge=1, le=10)
    max_clauses: int = Field(default=3, ge=1, le=10)
    min_remaining_positive_fraction: float = Field(default=0.05, ge=0.01, le=0.5)
    min_improvement: float = Field(default=1e-6, ge=0)
    max_evaluations: int = Field(default=5000, ge=100, le=50000)
    use_slow_metrics: bool = Field(default=False)


class DisjunctiveExplanationResponse(BaseModel):
    predicate_type: str = "disjunction"
    clauses: list[ExplanatoryClauseModel]
    combined_expression: str
    total_coverage: float
    global_enrichment: float
    learning_time_ms: float
    selection_size: int
    total_nodes: int
    marginal_gains: list[float] = Field(default_factory=list)
    contrast_size: int | None = None
