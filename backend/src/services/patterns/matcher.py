from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import networkx as nx


@dataclass
class SelectionMatch:
    pattern_type: str
    pattern_id: str
    pattern_nodes: frozenset[str]
    jaccard: float
    precision: float
    recall: float
    f1_score: float
    intersection_size: int
    selection_size: int
    pattern_size: int
    description: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "pattern_type": self.pattern_type,
            "pattern_id": self.pattern_id,
            "jaccard": round(self.jaccard, 4),
            "precision": round(self.precision, 4),
            "recall": round(self.recall, 4),
            "f1_score": round(self.f1_score, 4),
            "intersection_size": self.intersection_size,
            "selection_size": self.selection_size,
            "pattern_size": self.pattern_size,
            "description": self.description,
            "metadata": self.metadata,
        }


@dataclass
class StarPatternInfo:
    center_node: str
    periphery_nodes: frozenset[str]
    all_nodes: frozenset[str]
    center_degree: int
    periphery_size: int
    star_purity: float


@dataclass
class PrecomputedStructures:
    communities: dict[str, frozenset[str]] = field(default_factory=dict)
    components: dict[str, frozenset[str]] = field(default_factory=dict)
    bridge_nodes: dict[str, frozenset[str]] = field(default_factory=dict)
    isolates: dict[str, frozenset[str]] = field(default_factory=dict)

    def is_empty(self) -> bool:
        return (
            not self.communities
            and not self.components
            and not self.bridge_nodes
            and not self.isolates
        )


class StructureComputationError(Exception):
    pass


def _safe_compute(func, *args, **kwargs):
    try:
        return func(*args, **kwargs)
    except nx.NetworkXError:
        return None
    except Exception:
        return None


def compute_structures(graph: nx.Graph) -> PrecomputedStructures:
    try:
        import networkx.algorithms.community as nx_comm
        from networkx.algorithms import articulation_points, connected_components

        structures = PrecomputedStructures()

        communities = _safe_compute(nx_comm.greedy_modularity_communities, graph)
        if communities:
            structures.communities = {
                f"community_{i}": frozenset(str(node) for node in comm)
                for i, comm in enumerate(communities)
            }

        components = _safe_compute(connected_components, graph)
        if components:
            structures.components = {
                f"component_{i}": frozenset(str(node) for node in comp)
                for i, comp in enumerate(components)
            }

        articulation_nodes = _safe_compute(articulation_points, graph)
        if articulation_nodes:
            structures.bridge_nodes = {
                "bridge_nodes": frozenset(str(node) for node in articulation_nodes)
            }

        isolates = [str(node) for node in graph.nodes() if graph.degree(node) == 0]
        leaves = [str(node) for node in graph.nodes() if graph.degree(node) == 1]

        if isolates:
            structures.isolates["isolates_degree_0"] = frozenset(isolates)
        if leaves:
            structures.isolates["leaf_nodes"] = frozenset(leaves)

        return structures

    except Exception as e:
        raise StructureComputationError(f"Failed to compute structures: {e}") from e


def match_selection(
    graph: nx.Graph,
    selected_ids: list[str],
    structures: PrecomputedStructures,
    min_jaccard: float = 0.1,
    min_f1: float = 0.1,
    top_k: int = 10,
) -> list[SelectionMatch]:
    selected_set = set(selected_ids)
    matches = []

    all_patterns = {
        **{f"community_{k}": v for k, v in structures.communities.items()},
        **{f"component_{k}": v for k, v in structures.components.items()},
        **{f"bridge_{k}": v for k, v in structures.bridge_nodes.items()},
        **{f"isolate_{k}": v for k, v in structures.isolates.items()},
    }

    for pattern_id, pattern_nodes in all_patterns.items():
        pattern_set = set(pattern_nodes)

        intersection = selected_set & pattern_set
        intersection_size = len(intersection)
        selection_size = len(selected_set)
        pattern_size = len(pattern_set)

        if intersection_size == 0:
            continue

        jaccard = intersection_size / len(selected_set | pattern_set)
        precision = intersection_size / selection_size if selection_size > 0 else 0
        recall = intersection_size / pattern_size if pattern_size > 0 else 0
        f1_score = (
            2 * precision * recall / (precision + recall)
            if (precision + recall) > 0
            else 0
        )

        if jaccard >= min_jaccard and f1_score >= min_f1:
            match = SelectionMatch(
                pattern_type=pattern_id.split("_")[0],
                pattern_id=pattern_id,
                pattern_nodes=frozenset(pattern_nodes),
                jaccard=jaccard,
                precision=precision,
                recall=recall,
                f1_score=f1_score,
                intersection_size=intersection_size,
                selection_size=selection_size,
                pattern_size=pattern_size,
            )
            matches.append(match)

    matches.sort(key=lambda x: (x.f1_score, x.jaccard), reverse=True)
    return matches[:top_k]


def generate_match_description(match: SelectionMatch) -> str:
    pattern_type = match.pattern_type
    precision_pct = int(match.precision * 100)
    recall_pct = int(match.recall * 100)

    if pattern_type == "community":
        return f"{precision_pct}% of selection overlaps with community (covers {recall_pct}% of community)"
    elif pattern_type == "component":
        return f"{precision_pct}% of selection is in connected component (covers {recall_pct}% of component)"
    elif pattern_type == "bridge":
        return f"{precision_pct}% of selection consists of bridge nodes"
    elif pattern_type == "isolate":
        return f"{precision_pct}% of selection consists of isolated/leaf nodes"
    else:
        return f"{precision_pct}% overlap with {pattern_type} pattern"


def _detect_star_in_selection(
    graph: nx.Graph,
    selection: set[str],
    min_periphery: int = 2,
) -> StarPatternInfo | None:
    selection_subgraph = graph.subgraph(selection)

    for node in selection:
        if node not in selection_subgraph:
            continue

        neighbors = set(selection_subgraph.neighbors(node))
        periphery_nodes = neighbors & selection

        if len(periphery_nodes) >= min_periphery:
            star_edges = 0
            total_edges = selection_subgraph.number_of_edges()

            for neighbor in periphery_nodes:
                if selection_subgraph.has_edge(node, neighbor):
                    star_edges += 1

            star_purity = star_edges / total_edges if total_edges > 0 else 0

            if star_purity >= 0.7:
                return StarPatternInfo(
                    center_node=node,
                    periphery_nodes=frozenset(periphery_nodes),
                    all_nodes=frozenset([node] + list(periphery_nodes)),
                    center_degree=len(periphery_nodes),
                    periphery_size=len(periphery_nodes),
                    star_purity=star_purity,
                )

    return None


class SelectionMatcher:
    def __init__(self, graph: nx.Graph):
        self.graph = graph
        self._structures = None

    def get_structures(self) -> PrecomputedStructures:
        if self._structures is None:
            self._structures = compute_structures(self.graph)
        return self._structures

    def match(
        self,
        selected_ids: list[str],
        min_jaccard: float = 0.1,
        min_f1: float = 0.1,
        top_k: int = 10,
    ) -> list[SelectionMatch]:
        structures = self.get_structures()
        matches = match_selection(
            self.graph, selected_ids, structures, min_jaccard, min_f1, top_k
        )

        star_info = _detect_star_in_selection(self.graph, set(selected_ids))
        if star_info:
            selected_set = set(selected_ids)
            star_set = star_info.all_nodes

            intersection = selected_set & star_set
            intersection_size = len(intersection)
            selection_size = len(selected_set)
            pattern_size = len(star_set)

            jaccard = intersection_size / len(selected_set | star_set)
            precision = intersection_size / selection_size if selection_size > 0 else 0
            recall = intersection_size / pattern_size if pattern_size > 0 else 0
            f1_score = (
                2 * precision * recall / (precision + recall)
                if (precision + recall) > 0
                else 0
            )

            if jaccard >= min_jaccard and f1_score >= min_f1:
                star_match = SelectionMatch(
                    pattern_type="star",
                    pattern_id=f"star_{star_info.center_node}",
                    pattern_nodes=star_info.all_nodes,
                    jaccard=jaccard,
                    precision=precision,
                    recall=recall,
                    f1_score=f1_score,
                    intersection_size=intersection_size,
                    selection_size=selection_size,
                    pattern_size=pattern_size,
                    description=f"Star pattern centered on {star_info.center_node}",
                    metadata={
                        "center_node": star_info.center_node,
                        "star_purity": star_info.star_purity,
                    },
                )
                matches.append(star_match)

                matches.sort(key=lambda x: (x.f1_score, x.jaccard), reverse=True)
                matches = matches[:top_k]

        return matches
