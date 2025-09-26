from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, FrozenSet, List, Optional, Tuple

__all__ = [
    "PatternType",
    "PatternDefinition",
    "PatternInstance",
    "EvidenceResult",
]


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
    max_nodes: Optional[int] = None
    required_features: FrozenSet[str] = field(default_factory=frozenset)
    feature_thresholds: Dict[str, Tuple[float, float]] = field(default_factory=dict)

    def matches_size(self, n_nodes: int) -> bool:
        if n_nodes < self.min_nodes:
            return False
        if self.max_nodes is not None and n_nodes > self.max_nodes:
            return False
        return True


@dataclass
class PatternInstance:
    definition: PatternDefinition
    node_ids: FrozenSet[str]
    edge_keys: FrozenSet[Tuple[str, str]]

    confidence: float
    score: float

    features: Dict[str, float] = field(default_factory=dict)

    center_node: Optional[str] = None
    hub_nodes: List[str] = field(default_factory=list)
    boundary_nodes: List[str] = field(default_factory=list)

    @property
    def size(self) -> int:
        return len(self.node_ids)


# Minimal EvidenceResult for patterns.py compatibility (not actually used)
@dataclass
class EvidenceResult:
    selection_type: str = ""
    selected_ids: List[str] = field(default_factory=list)
