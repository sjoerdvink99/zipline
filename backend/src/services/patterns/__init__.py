from .config import (
    PATTERN_TYPE_CONFIGS,
    PERFECT_CONTAINMENT_THRESHOLD,
    PatternTypeConfig,
    StructuralPatternType,
    get_all_pattern_types,
    get_pattern_config,
    get_pattern_description,
    get_pattern_label,
    get_pattern_plural,
    get_pattern_priority,
)

# Moved from compiler
from .engine import PatternMatcher as PatternEngine
from .instance import PatternInstance as MovedPatternInstance
from .matcher import (
    PrecomputedStructures,
    SelectionMatch,
    SelectionMatcher,
    StarPatternInfo,
    compute_structures,
    generate_match_description,
    match_selection,
)
from .types import PatternDefinition, PatternInstance, PatternType

__all__ = [
    "StructuralPatternType",
    "PatternTypeConfig",
    "PATTERN_TYPE_CONFIGS",
    "PERFECT_CONTAINMENT_THRESHOLD",
    "get_pattern_config",
    "get_pattern_priority",
    "get_pattern_description",
    "get_pattern_label",
    "get_pattern_plural",
    "get_all_pattern_types",
    "PatternType",
    "PatternDefinition",
    "PatternInstance",
    "SelectionMatch",
    "StarPatternInfo",
    "PrecomputedStructures",
    "compute_structures",
    "match_selection",
    "generate_match_description",
    "SelectionMatcher",
    "PatternEngine",
    "MovedPatternInstance",
]
