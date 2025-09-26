from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SimplePredicateResponse(BaseModel):
    matching_nodes: list[str]
    count: int
    projections: list[dict] | None = None
    evaluation_time_ms: float
    errors: list[str] | None = None


class FilterChainResponse(BaseModel):
    predicate_matches: list[str]
    pattern_matches: list[str]
    combined_matches: list[str]
    count: int
    validation_errors: list[str] = Field(default_factory=list)


class ProjectionResultResponse(BaseModel):
    primary_node: str
    projected_variables: dict[str, list[str]]


class CrossSpacePredicateResponse(BaseModel):
    id: str
    expression: str
    description: str
    matching_nodes: list[str]
    projections: list[ProjectionResultResponse] | None = None
    evaluation_stats: dict[str, Any]
    validation_result: dict[str, Any]


class TemplateListResponse(BaseModel):
    templates: dict[str, dict[str, Any]]
    domains: list[str]


class ApplyPredicatesResponse(BaseModel):
    matching_node_ids: list[str] = Field(
        description="Node IDs that match the predicate combination"
    )
    count: int = Field(description="Total number of matching nodes")
