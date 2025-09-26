from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class StructuralPatternType(str, Enum):
    COMMUNITY = "community"
    COMPONENT = "component"
    BRIDGE = "bridge"
    ISOLATE = "isolate"
    LEAF = "leaf"
    STAR = "star"


@dataclass(frozen=True)
class PatternTypeConfig:
    type_key: StructuralPatternType
    display_name: str
    plural_name: str
    priority: int
    description_template: str
    metadata: dict[str, str]

    def format_description(self, node_count: int) -> str:
        return self.description_template.format(count=node_count)

    def format_label(self, pattern_id: str) -> str:
        if self.type_key == StructuralPatternType.COMMUNITY:
            return f"Community {pattern_id.replace('community_', '')}"
        elif self.type_key == StructuralPatternType.COMPONENT:
            return f"Component {pattern_id.replace('component_', '')}"
        elif self.type_key == StructuralPatternType.STAR:
            return f"Star {pattern_id.replace('star_', '')}"
        return self.display_name


PATTERN_TYPE_CONFIGS: dict[StructuralPatternType, PatternTypeConfig] = {
    StructuralPatternType.ISOLATE: PatternTypeConfig(
        type_key=StructuralPatternType.ISOLATE,
        display_name="Isolated Nodes",
        plural_name="isolate groups",
        priority=4,
        description_template="Isolated nodes: {count} nodes with no connections",
        metadata={"degree": "0"},
    ),
    StructuralPatternType.LEAF: PatternTypeConfig(
        type_key=StructuralPatternType.LEAF,
        display_name="Leaf Nodes",
        plural_name="leaf node groups",
        priority=3,
        description_template="Leaf nodes: {count} nodes with only one connection",
        metadata={"degree": "1"},
    ),
    StructuralPatternType.BRIDGE: PatternTypeConfig(
        type_key=StructuralPatternType.BRIDGE,
        display_name="Bridge Nodes",
        plural_name="bridge node sets",
        priority=2,
        description_template="Articulation points: {count} nodes whose removal disconnects the graph",
        metadata={"role": "articulation_point"},
    ),
    StructuralPatternType.COMPONENT: PatternTypeConfig(
        type_key=StructuralPatternType.COMPONENT,
        display_name="Connected Component",
        plural_name="components",
        priority=1,
        description_template="Connected component with {count} nodes",
        metadata={},
    ),
    StructuralPatternType.COMMUNITY: PatternTypeConfig(
        type_key=StructuralPatternType.COMMUNITY,
        display_name="Community",
        plural_name="communities",
        priority=0,
        description_template="Louvain community with {count} nodes",
        metadata={"algorithm": "louvain"},
    ),
    StructuralPatternType.STAR: PatternTypeConfig(
        type_key=StructuralPatternType.STAR,
        display_name="Star Pattern",
        plural_name="star patterns",
        priority=5,
        description_template="Star pattern: {count} nodes with a central hub connected to periphery",
        metadata={"structure": "hub-spoke"},
    ),
}

PERFECT_CONTAINMENT_THRESHOLD = 0.999


def get_pattern_config(pattern_type: str) -> PatternTypeConfig | None:
    try:
        return PATTERN_TYPE_CONFIGS[StructuralPatternType(pattern_type)]
    except (ValueError, KeyError):
        return None


def get_pattern_priority(pattern_type: str) -> int:
    config = get_pattern_config(pattern_type)
    return config.priority if config else 0


def get_pattern_description(pattern_type: str, pattern_id: str, node_count: int) -> str:
    config = get_pattern_config(pattern_type)
    if config:
        return config.format_description(node_count)
    return f"{pattern_type} '{pattern_id}' with {node_count} nodes"


def get_pattern_label(pattern_type: str, pattern_id: str) -> str:
    config = get_pattern_config(pattern_type)
    if config:
        return config.format_label(pattern_id)
    return pattern_id


def get_pattern_plural(pattern_type: str) -> str:
    config = get_pattern_config(pattern_type)
    return config.plural_name if config else "patterns"


def get_all_pattern_types() -> frozenset[StructuralPatternType]:
    return frozenset(StructuralPatternType)
