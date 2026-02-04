from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class HopConstraint(BaseModel):
    hop_index: int | str
    target: str
    attribute: str
    operator: str
    value: str | int | float | bool
    value2: float | None = None


class PathQueryRequest(BaseModel):
    source: str
    target: str
    min_hops: int = 1
    max_hops: int = 4
    constraints: list[HopConstraint] = []
    combine_op: str = "intersection"
    limit: int = 100


class NodeSearchRequest(BaseModel):
    query: str
    limit: int = 10
    exact_match: bool = False
    dataset: str | None = None


class SearchResult(BaseModel):
    node_id: str
    label: str
    score: float
    match_type: str
    attributes: dict[str, Any]
    highlights: list[str] = []


class PathFindingRequest(BaseModel):
    source_node: str
    target_node: str
    algorithm: str = Field(
        default="k_shortest", pattern="^(shortest|k_shortest|all_simple|all_shortest)$"
    )
    max_paths: int = Field(default=10, ge=1, le=1000)
    min_path_length: int = Field(default=1, ge=1, le=10)
    max_path_length: int = Field(default=6, ge=2, le=10)


class PathFindingResponse(BaseModel):
    success: bool
    paths: list[list[str]]
    path_nodes: list[str]
    path_edges: list[dict[str, str]]
    algorithm_used: str
    total_paths: int
    computation_time_ms: float
    errors: list[str] = Field(default_factory=list)
