from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import (
    Any,
    Protocol,
)


class PatternLevel(str, Enum):
    NODE = "node"
    SUBGRAPH = "subgraph"


class PatternCategory(str, Enum):
    BASIC = "basic"
    TOPOLOGICAL = "topological"
    STATISTICAL = "statistical"
    STRUCTURAL = "structural"


class PatternTypeName(str, Enum):
    NODE = "node"
    LEAF = "leaf"
    HUB = "hub"
    BRIDGE = "bridge"
    BOUNDARY = "boundary"

    CONNECTED_SUBGRAPH = "connected_subgraph"
    COMPONENT = "component"
    CLUSTER = "cluster"
    K_CORE = "k_core"
    CYCLE = "cycle"
    STAR = "star"


@dataclass(frozen=True)
class PatternTypeSpec:
    name: PatternTypeName
    display_name: str
    description: str
    level: PatternLevel
    category: PatternCategory
    min_nodes: int
    max_nodes: int | None
    weight: float
    crispness: bool
    complexity_cost: float
    specificity_depth: int
    parent_patterns: frozenset[PatternTypeName]


PATTERN_SPECS: dict[PatternTypeName, PatternTypeSpec] = {
    PatternTypeName.NODE: PatternTypeSpec(
        name=PatternTypeName.NODE,
        display_name="Node",
        description="",
        level=PatternLevel.NODE,
        category=PatternCategory.BASIC,
        min_nodes=1,
        max_nodes=1,
        weight=0.5,
        crispness=True,
        complexity_cost=0.0,
        specificity_depth=0,
        parent_patterns=frozenset(),
    ),
    PatternTypeName.LEAF: PatternTypeSpec(
        name=PatternTypeName.LEAF,
        display_name="Leaf Node",
        description="",
        level=PatternLevel.NODE,
        category=PatternCategory.TOPOLOGICAL,
        min_nodes=1,
        max_nodes=1,
        weight=1.2,
        crispness=True,
        complexity_cost=0.05,
        specificity_depth=1,
        parent_patterns=frozenset({PatternTypeName.NODE}),
    ),
    PatternTypeName.HUB: PatternTypeSpec(
        name=PatternTypeName.HUB,
        display_name="Hub Node",
        description="",
        level=PatternLevel.NODE,
        category=PatternCategory.STATISTICAL,
        min_nodes=1,
        max_nodes=1,
        weight=1.3,
        crispness=False,
        complexity_cost=0.1,
        specificity_depth=1,
        parent_patterns=frozenset({PatternTypeName.NODE}),
    ),
    PatternTypeName.BRIDGE: PatternTypeSpec(
        name=PatternTypeName.BRIDGE,
        display_name="Bridge Node (Articulation Point)",
        description="",
        level=PatternLevel.NODE,
        category=PatternCategory.TOPOLOGICAL,
        min_nodes=1,
        max_nodes=1,
        weight=1.5,
        crispness=True,
        complexity_cost=0.1,
        specificity_depth=1,
        parent_patterns=frozenset({PatternTypeName.NODE}),
    ),
    PatternTypeName.BOUNDARY: PatternTypeSpec(
        name=PatternTypeName.BOUNDARY,
        display_name="Boundary/Connector Node",
        description="",
        level=PatternLevel.NODE,
        category=PatternCategory.STRUCTURAL,
        min_nodes=1,
        max_nodes=1,
        weight=1.4,
        crispness=False,
        complexity_cost=0.15,
        specificity_depth=1,
        parent_patterns=frozenset({PatternTypeName.NODE}),
    ),
    PatternTypeName.CONNECTED_SUBGRAPH: PatternTypeSpec(
        name=PatternTypeName.CONNECTED_SUBGRAPH,
        display_name="Connected Subgraph",
        description="",
        level=PatternLevel.SUBGRAPH,
        category=PatternCategory.BASIC,
        min_nodes=2,
        max_nodes=None,
        weight=0.6,
        crispness=True,
        complexity_cost=0.0,
        specificity_depth=0,
        parent_patterns=frozenset(),
    ),
    PatternTypeName.COMPONENT: PatternTypeSpec(
        name=PatternTypeName.COMPONENT,
        display_name="Connected Component",
        description="",
        level=PatternLevel.SUBGRAPH,
        category=PatternCategory.STRUCTURAL,
        min_nodes=2,
        max_nodes=None,
        weight=1.8,
        crispness=True,
        complexity_cost=0.05,
        specificity_depth=2,
        parent_patterns=frozenset({PatternTypeName.CONNECTED_SUBGRAPH}),
    ),
    PatternTypeName.CLUSTER: PatternTypeSpec(
        name=PatternTypeName.CLUSTER,
        display_name="Cluster/Community Candidate",
        description="",
        level=PatternLevel.SUBGRAPH,
        category=PatternCategory.STATISTICAL,
        min_nodes=3,
        max_nodes=None,
        weight=1.4,
        crispness=False,
        complexity_cost=0.2,
        specificity_depth=1,
        parent_patterns=frozenset({PatternTypeName.CONNECTED_SUBGRAPH}),
    ),
    PatternTypeName.K_CORE: PatternTypeSpec(
        name=PatternTypeName.K_CORE,
        display_name="k-Core Region",
        description="",
        level=PatternLevel.SUBGRAPH,
        category=PatternCategory.STRUCTURAL,
        min_nodes=3,
        max_nodes=None,
        weight=1.3,
        crispness=False,
        complexity_cost=0.15,
        specificity_depth=1,
        parent_patterns=frozenset({PatternTypeName.CONNECTED_SUBGRAPH}),
    ),
    PatternTypeName.CYCLE: PatternTypeSpec(
        name=PatternTypeName.CYCLE,
        display_name="Cycle",
        description="",
        level=PatternLevel.SUBGRAPH,
        category=PatternCategory.TOPOLOGICAL,
        min_nodes=3,
        max_nodes=None,
        weight=1.5,
        crispness=True,
        complexity_cost=0.1,
        specificity_depth=3,
        parent_patterns=frozenset(
            {PatternTypeName.CONNECTED_SUBGRAPH, PatternTypeName.COMPONENT}
        ),
    ),
    PatternTypeName.STAR: PatternTypeSpec(
        name=PatternTypeName.STAR,
        display_name="Star",
        description="",
        level=PatternLevel.SUBGRAPH,
        category=PatternCategory.STRUCTURAL,
        min_nodes=3,
        max_nodes=None,
        weight=1.5,
        crispness=True,
        complexity_cost=0.1,
        specificity_depth=3,
        parent_patterns=frozenset(
            {PatternTypeName.CONNECTED_SUBGRAPH, PatternTypeName.COMPONENT}
        ),
    ),
}


@dataclass
class DominanceRelation:
    dominant: PatternTypeName
    dominated: PatternTypeName
    requires_coverage_overlap: float = 0.8
    crispness_bonus: float = 0.1


def build_dominance_dag() -> dict[PatternTypeName, set[PatternTypeName]]:
    dominates: dict[PatternTypeName, set[PatternTypeName]] = {
        p: set() for p in PatternTypeName
    }

    for name, spec in PATTERN_SPECS.items():
        for parent in spec.parent_patterns:
            dominates[name].add(parent)

    changed = True
    while changed:
        changed = False
        for name in PatternTypeName:
            current_dominated = set(dominates[name])
            for dominated in list(current_dominated):
                for grandparent in dominates[dominated]:
                    if grandparent not in dominates[name]:
                        dominates[name].add(grandparent)
                        changed = True

    return dominates


DOMINANCE_DAG = build_dominance_dag()


def get_spec(pattern_type: PatternTypeName) -> PatternTypeSpec:
    return PATTERN_SPECS[pattern_type]


def get_dominates(pattern_type: PatternTypeName) -> set[PatternTypeName]:
    return DOMINANCE_DAG.get(pattern_type, set())


def is_more_specific(a: PatternTypeName, b: PatternTypeName) -> bool:
    return b in DOMINANCE_DAG.get(a, set())


def get_all_node_patterns() -> list[PatternTypeName]:
    return [
        name for name, spec in PATTERN_SPECS.items() if spec.level == PatternLevel.NODE
    ]


def get_all_subgraph_patterns() -> list[PatternTypeName]:
    return [
        name
        for name, spec in PATTERN_SPECS.items()
        if spec.level == PatternLevel.SUBGRAPH
    ]


@dataclass
class PatternDetectionConfig:
    min_quality_threshold: float = 0.3
    min_coverage_threshold: float = 0.5
    min_snap_fit_threshold: float = 0.6

    dominance_coverage_overlap: float = 0.8
    crispness_bonus: float = 0.1

    hub_percentile_threshold: float = 95.0
    hub_zscore_threshold: float = 2.0

    boundary_clustering_threshold: float = 0.3
    boundary_betweenness_percentile: float = 75.0

    cluster_density_weight: float = 0.4
    cluster_boundary_weight: float = 0.3
    cluster_conductance_weight: float = 0.3
    cluster_conductance_decay: float = 5.0

    kcore_node_coverage_threshold: float = 0.8

    cycle_degree_tolerance: float = 0.1

    star_leaf_tolerance: float = 0.1

    snap_max_expansion: int = 10
    snap_neighborhood_hops: int = 1

    max_betweenness_sample: int = 1000
    max_cycle_length: int = 20
    max_cycles_per_component: int = 50

    max_supporting_patterns: int = 5


DEFAULT_CONFIG = PatternDetectionConfig()


@dataclass
class PatternCandidate:
    pattern_type: PatternTypeName
    theta: dict[str, Any]
    nodes: frozenset[str]
    original_nodes: frozenset[str]

    quality: float
    snap_fit: float
    coverage: float

    score: float = 0.0

    debug_info: dict[str, Any] = field(default_factory=dict)

    def compute_score(self, config: PatternDetectionConfig) -> float:
        spec = PATTERN_SPECS[self.pattern_type]

        raw_score = spec.weight * self.quality * self.snap_fit * self.coverage

        penalty = config.min_quality_threshold * spec.complexity_cost

        self.score = raw_score - penalty
        return self.score

    def to_dict(self) -> dict[str, Any]:
        return {
            "pattern_type": self.pattern_type.value,
            "theta": self.theta,
            "nodes": list(self.nodes),
            "original_nodes": list(self.original_nodes),
            "quality": round(self.quality, 4),
            "snap_fit": round(self.snap_fit, 4),
            "coverage": round(self.coverage, 4),
            "score": round(self.score, 4),
            "debug_info": self.debug_info,
        }


@dataclass
class DetectedPatternResult:
    primary: PatternCandidate | None

    supporting: list[PatternCandidate]

    features_primary: dict[str, float]

    all_candidates: list[PatternCandidate]

    original_selection: frozenset[str]
    snapped_selection: frozenset[str] | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "primary": self.primary.to_dict() if self.primary else None,
            "supporting": [c.to_dict() for c in self.supporting],
            "features_primary": {
                k: round(v, 4) if isinstance(v, float) else v
                for k, v in self.features_primary.items()
            },
            "all_candidates": [c.to_dict() for c in self.all_candidates],
            "original_selection": list(self.original_selection),
            "snapped_selection": list(self.snapped_selection)
            if self.snapped_selection
            else None,
        }


class PatternDetector(Protocol):
    @property
    def pattern_type(self) -> PatternTypeName: ...

    def check_applicable(self, selection_size: int) -> bool: ...

    def detect(
        self,
        graph: Any,
        selection: frozenset[str],
        precomputed: dict[str, Any],
        config: PatternDetectionConfig,
    ) -> PatternCandidate | None: ...
