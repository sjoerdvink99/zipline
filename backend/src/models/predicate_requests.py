from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SimplePredicateRequest(BaseModel):
    expression: str = Field(..., description="FOL predicate expression")
    project_variables: list[str] | None = Field(
        default=None, description="Variables to project in results"
    )


class LegacyPredicateRequest(BaseModel):
    predicates: list[dict] = Field(..., description="Legacy format predicates")
    combine_op: str = Field(default="and")
    node_type_filter: str | None = Field(default=None)


class CompositeFilterRequest(BaseModel):
    filters: list[dict[str, Any]]
    combine_op: str = "and"


class AttributePredicateRequest(BaseModel):
    attribute: str
    operator: str
    value: Any
    value2: Any | None = None
    attribute_type: str = "numeric"
    node_types: list[str] | None = None
    description: str | None = None


class TopologyPredicateRequest(BaseModel):
    metric: str
    operator: str
    value: float
    value2: float | None = None
    pattern_type: str = "topology"
    node_types: list[str] | None = None
    description: str | None = None


class FilterChainRequest(BaseModel):
    attribute_predicates: list[AttributePredicateRequest] = Field(default_factory=list)
    topology_predicates: list[TopologyPredicateRequest] = Field(default_factory=list)
    combine_patterns: bool = False


class NeighborhoodPredicateRequest(BaseModel):
    quantifier: str
    quantifier_count: int | None = None
    relation: str
    k_parameter: int | None = None
    target_variable: str
    constraint_type: str
    constraint_predicate: dict[str, Any]
    starting_filters: list[str]


class CrossSpacePredicateRequest(BaseModel):
    expression: str
    description: str | None = None
    project_variables: list[str] | None = None


class TemplatePredicateRequest(BaseModel):
    template_key: str
    domain: str | None = None


class FOLFilterRequest(BaseModel):
    type: str = "fol"
    expression: str | None = None
    template_key: str | None = None
    neighborhood_config: NeighborhoodPredicateRequest | None = None


class ApplyPredicatesRequest(BaseModel):
    predicates: list[dict] = Field(
        ..., description="List of predicate objects with attribute, operator, value"
    )
    combine_op: str = Field(
        default="and", description="Logical operator: 'and' or 'or'"
    )
    node_type_filter: str | None = Field(
        default=None, description="Optional filter by node type"
    )


class PatternFilterRequest(BaseModel):
    pattern_type: str = Field(
        description="Type of pattern: 'isolate', 'hub', 'bridge', etc."
    )
    pattern_id: str | None = Field(
        None, description="Specific pattern instance identifier"
    )
    node_ids: list[str] | None = Field(
        None, description="Candidate node IDs to evaluate"
    )
    mode: str = Field("exact", description="Matching mode: 'exact' or 'similar'")
    similarity_threshold: float | None = Field(
        0.7, description="Similarity threshold for fuzzy matching"
    )
