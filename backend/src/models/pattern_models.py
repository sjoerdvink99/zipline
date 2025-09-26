from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class PatternType(str, Enum):
    COMMUNITY = "community"
    HUB = "hub"
    BRIDGE = "bridge"
    STAR = "star"
    CLUSTER = "cluster"
    CUSTOM = "custom"


class Pattern(BaseModel):
    id: str
    name: str
    description: str
    node_ids: list[str]
    pattern_type: PatternType
    created_at: datetime = Field(default_factory=datetime.now)
    domain: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(ge=0.0, le=1.0, default=1.0)

    class Config:
        use_enum_values = True


class PatternCreate(BaseModel):
    name: str
    description: str
    node_ids: list[str]
    pattern_type: PatternType = PatternType.CUSTOM
    domain: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(ge=0.0, le=1.0, default=1.0)

    class Config:
        use_enum_values = True


class PatternMatch(BaseModel):
    pattern: Pattern
    overlap_score: float = Field(ge=0.0, le=1.0)
    matching_nodes: list[str]
    confidence: float = Field(ge=0.0, le=1.0)


class PatternSuggestion(BaseModel):
    pattern: Pattern
    reason: str
    confidence: float = Field(ge=0.0, le=1.0)


class NodeSelection(BaseModel):
    node_ids: list[str]
    context: dict[str, Any] | None = None
