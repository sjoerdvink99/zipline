from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class EvaluateRequest(BaseModel):
    expression: str = Field(...)
    project_variables: list[str] | None = Field(default=None)


class EvaluateResponse(BaseModel):
    matching_nodes: list[str]
    projections: list[dict[str, Any]] | None = None
    fol_expression: str
    evaluation_time_ms: float
    errors: list[str] = Field(default_factory=list)


class DescribeRequest(BaseModel):
    selected_nodes: list[str]
    min_coverage: float = 0.6
    min_selectivity: float = 0.1


class InferredPredicate(BaseModel):
    fol_expression: str
    coverage: float
    selectivity: float
    quality_score: float
    matching_nodes: list[str]


class AttributePredicate(InferredPredicate):
    attribute: str
    value: str


class TopologyPredicate(InferredPredicate):
    metric: str
    operator: str
    threshold: float | str


class DescribeResponse(BaseModel):
    selection_size: int
    total_nodes: int
    attribute_predicates: list[AttributePredicate]
    topology_predicates: list[TopologyPredicate]


class LiftedPredicatesResponse(BaseModel):
    predicates: dict[str, list[str]]


class ApplyRequest(BaseModel):
    predicates: list[dict[str, Any]]
    combine_op: str = "and"
    node_type_filter: str | None = None


class ApplyResponse(BaseModel):
    matching_node_ids: list[str]
    count: int


class InferSelectionRequest(BaseModel):
    selected_nodes: list[str]
    include_cross_space: bool = False
    max_predicates_per_type: int = 10
    min_coverage: float = 0.6
    min_selectivity: float = 0.1


class InferredAttributePredicateModel(BaseModel):
    space: str = "attribute"
    attribute: str
    operator: str = "="
    value: str | int | float | bool
    fol_expression: str
    coverage: float
    selectivity: float
    quality_score: float
    matching_nodes: list[str]


class InferredTopologyPredicateModel(BaseModel):
    space: str = "topology"
    metric: str
    operator: str
    threshold: float | str
    fol_expression: str
    coverage: float
    selectivity: float
    quality_score: float
    matching_nodes: list[str]


class InferSelectionResponse(BaseModel):
    attribute_predicates: list[InferredAttributePredicateModel]
    topology_predicates: list[InferredTopologyPredicateModel]
    selection_size: int
    total_predicates: int
