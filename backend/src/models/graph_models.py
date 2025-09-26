from __future__ import annotations

from typing import Any

from pydantic import BaseModel


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
