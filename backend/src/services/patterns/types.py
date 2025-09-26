from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class PatternType(str, Enum):
    ISOLATED = "isolated"
    LEAF = "leaf"
    PENDANT = "pendant"

    STAR = "star"
    TRIANGLE = "triangle"
    SQUARE = "square"
    CLIQUE = "clique"

    PATH = "path"
    CHAIN = "chain"
    CYCLE = "cycle"

    BRIDGE = "bridge"
    ARTICULATION = "articulation"
    HUB = "hub"

    CLUSTER = "cluster"
    COMMUNITY = "community"
    BIPARTITE = "bipartite"
    CORE = "core"
    TREE = "tree"
    DAG = "dag"

    CUSTOM = "custom"


@dataclass(frozen=True)
class PatternDefinition:
    id: str
    name: str
    pattern_type: PatternType
    description: str
    level: str = "structural"

    min_nodes: int = 1
    max_nodes: int | None = None
    required_features: frozenset[str] = field(default_factory=frozenset)
    feature_thresholds: dict[str, tuple[float, float]] = field(default_factory=dict)

    def matches_size(self, n_nodes: int) -> bool:
        if n_nodes < self.min_nodes:
            return False
        if self.max_nodes is not None and n_nodes > self.max_nodes:
            return False
        return True


@dataclass
class PatternInstance:
    definition: PatternDefinition
    node_ids: frozenset[str]
    edge_keys: frozenset[tuple[str, str]]

    confidence: float
    score: float

    features: dict[str, float] = field(default_factory=dict)

    center_node: str | None = None
    hub_nodes: list[str] = field(default_factory=list)
    boundary_nodes: list[str] = field(default_factory=list)

    @property
    def size(self) -> int:
        return len(self.node_ids)
