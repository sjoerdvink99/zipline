import logging

from .instance import PatternInstance

logger = logging.getLogger(__name__)


class PatternMatcher:
    def find_pattern_overlap(
        self, pattern_nodes: list[str], selected_nodes: list[str]
    ) -> float:
        pattern_set = set(pattern_nodes)
        selected_set = set(selected_nodes)

        if not pattern_set:
            return 0.0

        intersection = pattern_set.intersection(selected_set)
        return len(intersection) / len(pattern_set)

    def compute_pattern_similarity(
        self,
        pattern1: PatternInstance,
        pattern2: PatternInstance,
        feature_weights: dict[str, float] | None = None,
    ) -> float:
        return pattern1.compute_similarity(pattern2, feature_weights)
