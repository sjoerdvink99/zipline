import logging

import networkx as nx

from models.pattern_models import (
    NodeSelection,
    Pattern,
    PatternMatch,
    PatternSuggestion,
)

from .pattern_library import PatternLibrary

logger = logging.getLogger(__name__)


class PatternMatcher:
    def __init__(self, pattern_library: PatternLibrary):
        self.pattern_library = pattern_library

    def find_similar_patterns(
        self, selected_nodes: list[str], threshold: float = 0.7
    ) -> list[PatternMatch]:
        matches = []
        all_patterns = self.pattern_library.get_all_patterns()

        for pattern in all_patterns:
            if not pattern.node_ids:
                continue

            overlap_score = self.calculate_overlap(pattern.node_ids, selected_nodes)

            if overlap_score >= threshold:
                matching_nodes = self._get_matching_nodes(
                    pattern.node_ids, selected_nodes
                )
                match = PatternMatch(
                    pattern=pattern,
                    overlap_score=overlap_score,
                    matching_nodes=matching_nodes,
                    confidence=min(overlap_score * pattern.confidence, 1.0),
                )
                matches.append(match)

        matches.sort(key=lambda x: x.confidence, reverse=True)
        return matches

    def calculate_overlap(
        self, pattern_nodes: list[str], selected_nodes: list[str]
    ) -> float:
        if not pattern_nodes or not selected_nodes:
            return 0.0

        pattern_set = set(pattern_nodes)
        selected_set = set(selected_nodes)

        intersection = pattern_set.intersection(selected_set)
        union = pattern_set.union(selected_set)

        if not union:
            return 0.0

        return len(intersection) / len(union)

    def _get_matching_nodes(
        self, pattern_nodes: list[str], selected_nodes: list[str]
    ) -> list[str]:
        pattern_set = set(pattern_nodes)
        selected_set = set(selected_nodes)
        return list(pattern_set.intersection(selected_set))

    def suggest_patterns(
        self, selection: NodeSelection, graph: nx.Graph | None = None
    ) -> list[PatternSuggestion]:
        suggestions = []

        if len(selection.node_ids) < 2:
            return suggestions

        similar_matches = self.find_similar_patterns(selection.node_ids, threshold=0.3)

        for match in similar_matches[:3]:
            suggestion = PatternSuggestion(
                pattern=match.pattern,
                reason=f"Similar to your selection (overlap: {match.overlap_score:.1%})",
                confidence=match.confidence,
            )
            suggestions.append(suggestion)

        if graph:
            structural_suggestions = self._analyze_structural_patterns(
                selection.node_ids, graph
            )
            suggestions.extend(structural_suggestions)

        suggestions.sort(key=lambda x: x.confidence, reverse=True)
        return suggestions[:5]

    def _analyze_structural_patterns(
        self, node_ids: list[str], graph: nx.Graph
    ) -> list[PatternSuggestion]:
        suggestions = []

        try:
            if self._is_star_pattern(node_ids, graph):
                star_patterns = self.pattern_library.get_patterns_by_type("star")
                if star_patterns:
                    suggestions.append(
                        PatternSuggestion(
                            pattern=star_patterns[0],
                            reason="Selected nodes form a star-like structure",
                            confidence=0.8,
                        )
                    )

            if self._is_dense_cluster(node_ids, graph):
                cluster_patterns = self.pattern_library.get_patterns_by_type("cluster")
                if cluster_patterns:
                    suggestions.append(
                        PatternSuggestion(
                            pattern=cluster_patterns[0],
                            reason="Selected nodes form a dense cluster",
                            confidence=0.7,
                        )
                    )

            hub_nodes = self._identify_hub_nodes(node_ids, graph)
            if hub_nodes:
                hub_patterns = self.pattern_library.get_patterns_by_type("hub")
                if hub_patterns:
                    suggestions.append(
                        PatternSuggestion(
                            pattern=hub_patterns[0],
                            reason=f"Contains {len(hub_nodes)} high-degree hub node(s)",
                            confidence=0.6,
                        )
                    )

            bridge_nodes = self._identify_bridge_nodes(node_ids, graph)
            if bridge_nodes:
                bridge_patterns = self.pattern_library.get_patterns_by_type("bridge")
                if bridge_patterns:
                    suggestions.append(
                        PatternSuggestion(
                            pattern=bridge_patterns[0],
                            reason=f"Contains {len(bridge_nodes)} bridge node(s)",
                            confidence=0.6,
                        )
                    )

        except Exception as e:
            logger.warning(f"Error analyzing structural patterns: {e}")

        return suggestions

    def _is_star_pattern(self, node_ids: list[str], graph: nx.Graph) -> bool:
        if len(node_ids) < 3:
            return False

        node_degrees = [
            (node, graph.degree(node)) for node in node_ids if node in graph
        ]
        if not node_degrees:
            return False

        node_degrees.sort(key=lambda x: x[1], reverse=True)
        potential_center = node_degrees[0][0]
        other_nodes = [node for node, _ in node_degrees[1:]]

        center_neighbors = set(graph.neighbors(potential_center))
        if not all(node in center_neighbors for node in other_nodes):
            return False

        internal_edges = 0
        for i, node1 in enumerate(other_nodes):
            for node2 in other_nodes[i + 1 :]:
                if graph.has_edge(node1, node2):
                    internal_edges += 1

        max_allowed_internal = len(other_nodes) * 0.2
        return internal_edges <= max_allowed_internal

    def _is_dense_cluster(self, node_ids: list[str], graph: nx.Graph) -> bool:
        if len(node_ids) < 3:
            return False

        try:
            subgraph = graph.subgraph(node_ids)
            density = nx.density(subgraph)
            return density >= 0.6
        except Exception:
            return False

    def _identify_hub_nodes(self, node_ids: list[str], graph: nx.Graph) -> list[str]:
        hub_nodes = []
        all_degrees = [graph.degree(node) for node in graph.nodes()]
        if not all_degrees:
            return hub_nodes

        degree_threshold = sorted(all_degrees, reverse=True)[
            min(len(all_degrees) // 10, 10)
        ]

        for node_id in node_ids:
            if node_id in graph and graph.degree(node_id) >= degree_threshold:
                hub_nodes.append(node_id)

        return hub_nodes

    def _identify_bridge_nodes(self, node_ids: list[str], graph: nx.Graph) -> list[str]:
        bridge_nodes = []

        try:
            betweenness = nx.betweenness_centrality(graph)
            threshold = sorted(betweenness.values(), reverse=True)[
                min(len(betweenness) // 10, 10)
            ]

            for node_id in node_ids:
                if node_id in betweenness and betweenness[node_id] >= threshold:
                    bridge_nodes.append(node_id)

        except Exception as e:
            logger.warning(f"Error calculating betweenness centrality: {e}")

        return bridge_nodes

    def validate_pattern_match(
        self, pattern: Pattern, node_ids: list[str], graph: nx.Graph | None = None
    ) -> dict[str, any]:
        validation = {"valid": False, "score": 0.0, "reasons": []}

        if not pattern.node_ids and not graph:
            validation["reasons"].append(
                "Cannot validate template pattern without graph structure"
            )
            return validation

        overlap_score = self.calculate_overlap(pattern.node_ids, node_ids)
        validation["score"] = overlap_score

        if overlap_score > 0.5:
            validation["valid"] = True
            validation["reasons"].append(
                f"Good overlap with pattern nodes ({overlap_score:.1%})"
            )

        if graph and pattern.pattern_type:
            structural_valid = self._validate_structural_pattern(
                pattern.pattern_type, node_ids, graph
            )
            if structural_valid:
                validation["valid"] = True
                validation["score"] = max(validation["score"], 0.7)
                validation["reasons"].append(
                    f"Matches {pattern.pattern_type} structure"
                )

        return validation

    def _validate_structural_pattern(
        self, pattern_type: str, node_ids: list[str], graph: nx.Graph
    ) -> bool:
        if pattern_type == "star":
            return self._is_star_pattern(node_ids, graph)
        elif pattern_type == "cluster":
            return self._is_dense_cluster(node_ids, graph)
        elif pattern_type == "hub":
            return len(self._identify_hub_nodes(node_ids, graph)) > 0
        elif pattern_type == "bridge":
            return len(self._identify_bridge_nodes(node_ids, graph)) > 0

        return False
