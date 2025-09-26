from __future__ import annotations

from typing import List, Optional, Set

import networkx as nx

from layers.types import (
    EvidenceResult,
    PatternDefinition,
    PatternInstance,
    PatternType,
)

__all__ = [
    "DEFAULT_PATTERNS",
    "PATTERN_BY_ID",
    "detect_patterns",
    "PatternEngine",
]


DEFAULT_PATTERNS: List[PatternDefinition] = [
    PatternDefinition(
        id="isolated",
        name="Isolated Node",
        pattern_type=PatternType.ISOLATED,
        description="A node with no connections",
        level="atomic",
        min_nodes=1,
        max_nodes=1,
    ),
    PatternDefinition(
        id="leaf",
        name="Leaf Node",
        pattern_type=PatternType.LEAF,
        description="A node with exactly one connection",
        level="atomic",
        min_nodes=1,
        max_nodes=1,
    ),
    PatternDefinition(
        id="hub",
        name="Hub Node",
        pattern_type=PatternType.HUB,
        description="A highly connected node",
        level="structural",
        min_nodes=1,
        max_nodes=1,
    ),
    PatternDefinition(
        id="articulation",
        name="Articulation Point",
        pattern_type=PatternType.ARTICULATION,
        description="Node whose removal disconnects the graph",
        level="structural",
        min_nodes=1,
        max_nodes=1,
    ),
    PatternDefinition(
        id="bridge",
        name="Bridge Edge",
        pattern_type=PatternType.BRIDGE,
        description="Edge whose removal disconnects the graph",
        level="structural",
        min_nodes=2,
        max_nodes=2,
    ),
    PatternDefinition(
        id="star",
        name="Star",
        pattern_type=PatternType.STAR,
        description="A central node connected to peripheral nodes",
        level="structural",
        min_nodes=3,
    ),
    PatternDefinition(
        id="triangle",
        name="Triangle",
        pattern_type=PatternType.TRIANGLE,
        description="Three mutually connected nodes",
        level="structural",
        min_nodes=3,
        max_nodes=3,
    ),
    PatternDefinition(
        id="clique",
        name="Clique",
        pattern_type=PatternType.CLIQUE,
        description="A fully connected subgraph",
        level="structural",
        min_nodes=3,
    ),
    PatternDefinition(
        id="path",
        name="Path",
        pattern_type=PatternType.PATH,
        description="A sequence of connected nodes",
        level="structural",
        min_nodes=2,
    ),
    PatternDefinition(
        id="chain",
        name="Chain",
        pattern_type=PatternType.CHAIN,
        description="A long sequential path",
        level="structural",
        min_nodes=4,
    ),
    PatternDefinition(
        id="cycle",
        name="Cycle",
        pattern_type=PatternType.CYCLE,
        description="A closed loop of nodes",
        level="structural",
        min_nodes=3,
    ),
    PatternDefinition(
        id="cluster",
        name="Cluster",
        pattern_type=PatternType.CLUSTER,
        description="A densely connected group of nodes",
        level="pattern",
        min_nodes=3,
    ),
    PatternDefinition(
        id="community",
        name="Community",
        pattern_type=PatternType.COMMUNITY,
        description="A group with more internal than external connections",
        level="pattern",
        min_nodes=4,
    ),
    PatternDefinition(
        id="bipartite",
        name="Bipartite Structure",
        pattern_type=PatternType.BIPARTITE,
        description="Two groups with connections only between them",
        level="pattern",
        min_nodes=4,
    ),
    PatternDefinition(
        id="tree",
        name="Tree Structure",
        pattern_type=PatternType.TREE,
        description="A connected acyclic subgraph",
        level="pattern",
        min_nodes=2,
    ),
    PatternDefinition(
        id="core",
        name="K-Core",
        pattern_type=PatternType.CORE,
        description="A subgraph where all nodes have degree >= k",
        level="pattern",
        min_nodes=3,
    ),
]

PATTERN_BY_ID = {p.id: p for p in DEFAULT_PATTERNS}


def _detect_isolated(G: nx.Graph, node: str) -> Optional[PatternInstance]:
    if int(G.degree(node)) == 0:
        return PatternInstance(
            definition=PATTERN_BY_ID["isolated"],
            node_ids=frozenset([node]),
            edge_keys=frozenset(),
            confidence=1.0,
            score=1.0,
            features={"degree": 0},
            center_node=node,
        )
    return None


def _detect_leaf(G: nx.Graph, node: str) -> Optional[PatternInstance]:
    if int(G.degree(node)) == 1:
        return PatternInstance(
            definition=PATTERN_BY_ID["leaf"],
            node_ids=frozenset([node]),
            edge_keys=frozenset(),
            confidence=1.0,
            score=1.0,
            features={"degree": 1},
            center_node=node,
        )
    return None


def _detect_hub(
    G: nx.Graph, node: str, threshold_ratio: float = 0.2
) -> Optional[PatternInstance]:
    degree = int(G.degree(node))
    n = len(G)
    if n <= 1:
        return None
    degree_ratio = degree / (n - 1)
    if degree_ratio >= threshold_ratio:
        return PatternInstance(
            definition=PATTERN_BY_ID["hub"],
            node_ids=frozenset([node]),
            edge_keys=frozenset(),
            confidence=min(1.0, degree_ratio / 0.5),
            score=degree_ratio,
            features={"degree": float(degree), "degree_ratio": degree_ratio},
            center_node=node,
        )
    return None


def _detect_articulation(G: nx.Graph, node: str) -> Optional[PatternInstance]:
    try:
        aps = set(nx.articulation_points(G))
        if node in aps:
            return PatternInstance(
                definition=PATTERN_BY_ID["articulation"],
                node_ids=frozenset([node]),
                edge_keys=frozenset(),
                confidence=1.0,
                score=1.0,
                features={"is_articulation": 1},
                center_node=node,
            )
    except Exception:
        pass
    return None


def _detect_bridge(G: nx.Graph, u: str, v: str) -> Optional[PatternInstance]:
    try:
        bridges = set(nx.bridges(G))
        if (u, v) in bridges or (v, u) in bridges:
            return PatternInstance(
                definition=PATTERN_BY_ID["bridge"],
                node_ids=frozenset([u, v]),
                edge_keys=frozenset([(u, v)]),
                confidence=1.0,
                score=1.0,
                features={"is_bridge": 1},
            )
    except Exception:
        pass
    return None


def _detect_star(
    G: nx.Graph, nodes: Set[str], min_periphery: int = 3
) -> Optional[PatternInstance]:
    if len(nodes) < 3:
        return None

    H = G.subgraph(nodes)
    degrees = {n: H.degree(n) for n in nodes}

    center = max(degrees, key=degrees.get)
    center_deg = degrees[center]

    periphery = nodes - {center}
    if center_deg != len(periphery):
        return None

    periphery_internal_edges = sum(degrees[p] - 1 for p in periphery if degrees[p] > 1)

    star_purity = 1.0 - (periphery_internal_edges / (len(periphery) * (len(periphery) - 1) / 2 + 1))

    if star_purity < 0.5:
        return None

    edge_keys = frozenset((center, p) if (center, p) in G.edges() else (p, center) for p in periphery)

    return PatternInstance(
        definition=PATTERN_BY_ID["star"],
        node_ids=frozenset(nodes),
        edge_keys=edge_keys,
        confidence=star_purity,
        score=len(periphery) * star_purity,
        features={
            "center_degree": center_deg,
            "periphery_size": len(periphery),
            "star_purity": star_purity,
        },
        center_node=center,
        hub_nodes=[center],
        boundary_nodes=list(periphery),
    )


def _detect_triangle(G: nx.Graph, nodes: Set[str]) -> Optional[PatternInstance]:
    if len(nodes) != 3:
        return None

    node_list = list(nodes)
    a, b, c = node_list

    if G.has_edge(a, b) and G.has_edge(b, c) and G.has_edge(a, c):
        return PatternInstance(
            definition=PATTERN_BY_ID["triangle"],
            node_ids=frozenset(nodes),
            edge_keys=frozenset([(a, b), (b, c), (a, c)]),
            confidence=1.0,
            score=1.0,
            features={"n_nodes": 3, "n_edges": 3, "density": 1.0},
        )
    return None


def _detect_clique(
    G: nx.Graph, nodes: Set[str], min_size: int = 3
) -> Optional[PatternInstance]:
    if len(nodes) < min_size:
        return None

    H = G.subgraph(nodes)
    n = len(nodes)
    m = H.number_of_edges()
    max_edges = n * (n - 1) // 2

    if m == max_edges:
        return PatternInstance(
            definition=PATTERN_BY_ID["clique"],
            node_ids=frozenset(nodes),
            edge_keys=frozenset(H.edges()),
            confidence=1.0,
            score=n,
            features={"n_nodes": n, "n_edges": m, "density": 1.0},
        )
    return None


def _detect_cycle(G: nx.Graph, path_nodes: List[str]) -> Optional[PatternInstance]:
    if len(path_nodes) < 3:
        return None

    if path_nodes[0] != path_nodes[-1]:
        if not G.has_edge(path_nodes[0], path_nodes[-1]):
            return None

    unique_nodes = list(dict.fromkeys(path_nodes))
    if len(unique_nodes) < 3:
        return None

    edges = []
    for i in range(len(unique_nodes)):
        u = unique_nodes[i]
        v = unique_nodes[(i + 1) % len(unique_nodes)]
        if not G.has_edge(u, v):
            return None
        edges.append((u, v))

    return PatternInstance(
        definition=PATTERN_BY_ID["cycle"],
        node_ids=frozenset(unique_nodes),
        edge_keys=frozenset(edges),
        confidence=1.0,
        score=len(unique_nodes),
        features={"cycle_length": len(unique_nodes)},
    )


def _detect_path(G: nx.Graph, path_nodes: List[str]) -> Optional[PatternInstance]:
    if len(path_nodes) < 2:
        return None

    edges = []
    for i in range(len(path_nodes) - 1):
        u, v = path_nodes[i], path_nodes[i + 1]
        if not G.has_edge(u, v):
            return None
        edges.append((u, v))

    return PatternInstance(
        definition=PATTERN_BY_ID["path"],
        node_ids=frozenset(path_nodes),
        edge_keys=frozenset(edges),
        confidence=1.0,
        score=len(path_nodes),
        features={"path_length": len(path_nodes) - 1},
    )


def _detect_chain(
    G: nx.Graph, path_nodes: List[str], min_length: int = 4
) -> Optional[PatternInstance]:
    if len(path_nodes) < min_length:
        return None

    path_inst = _detect_path(G, path_nodes)
    if not path_inst:
        return None

    H = G.subgraph(path_nodes)
    internal = path_nodes[1:-1]
    internal_deg_2 = sum(1 for n in internal if H.degree(n) == 2)
    chain_purity = internal_deg_2 / len(internal) if internal else 1.0

    if chain_purity < 0.7:
        return None

    return PatternInstance(
        definition=PATTERN_BY_ID["chain"],
        node_ids=path_inst.node_ids,
        edge_keys=path_inst.edge_keys,
        confidence=chain_purity,
        score=len(path_nodes) * chain_purity,
        features={
            "chain_length": len(path_nodes) - 1,
            "chain_purity": chain_purity,
        },
    )


def _detect_cluster(
    G: nx.Graph, nodes: Set[str], min_density: float = 0.4
) -> Optional[PatternInstance]:
    if len(nodes) < 3:
        return None

    H = G.subgraph(nodes)
    n = len(nodes)
    m = H.number_of_edges()
    max_edges = n * (n - 1) / 2
    density = m / max_edges if max_edges > 0 else 0

    if density < min_density:
        return None

    degrees = dict(H.degree())
    avg_deg = sum(degrees.values()) / n
    hubs = [node for node, deg in degrees.items() if deg > avg_deg * 1.5]

    return PatternInstance(
        definition=PATTERN_BY_ID["cluster"],
        node_ids=frozenset(nodes),
        edge_keys=frozenset(H.edges()),
        confidence=density,
        score=n * density,
        features={"n_nodes": n, "n_edges": m, "density": density},
        hub_nodes=hubs,
    )


def _detect_community(
    G: nx.Graph, nodes: Set[str], min_internal_ratio: float = 0.6
) -> Optional[PatternInstance]:
    if len(nodes) < 4:
        return None

    H = G.subgraph(nodes)
    internal_edges = H.number_of_edges()

    boundary_edges = 0
    for u in nodes:
        for v in G.neighbors(u):
            if v not in nodes:
                boundary_edges += 1

    total_edges = internal_edges + boundary_edges
    if total_edges == 0:
        return None

    internal_ratio = internal_edges / total_edges

    if internal_ratio < min_internal_ratio:
        return None

    return PatternInstance(
        definition=PATTERN_BY_ID["community"],
        node_ids=frozenset(nodes),
        edge_keys=frozenset(H.edges()),
        confidence=internal_ratio,
        score=len(nodes) * internal_ratio,
        features={
            "n_nodes": len(nodes),
            "internal_edges": internal_edges,
            "boundary_edges": boundary_edges,
            "internal_ratio": internal_ratio,
        },
    )


def _detect_bipartite(G: nx.Graph, nodes: Set[str]) -> Optional[PatternInstance]:
    if len(nodes) < 4:
        return None

    H = G.subgraph(nodes)

    try:
        if not nx.is_bipartite(H):
            return None

        top, bottom = nx.bipartite.sets(H)

        cross_edges = H.number_of_edges()
        max_cross = len(top) * len(bottom)
        bipartite_density = cross_edges / max_cross if max_cross > 0 else 0

        return PatternInstance(
            definition=PATTERN_BY_ID["bipartite"],
            node_ids=frozenset(nodes),
            edge_keys=frozenset(H.edges()),
            confidence=min(1.0, bipartite_density * 2),
            score=len(nodes) * bipartite_density,
            features={
                "partition_1_size": len(top),
                "partition_2_size": len(bottom),
                "cross_edges": cross_edges,
                "bipartite_density": bipartite_density,
            },
        )
    except Exception:
        return None


def _detect_tree(G: nx.Graph, nodes: Set[str]) -> Optional[PatternInstance]:
    if len(nodes) < 2:
        return None

    H = G.subgraph(nodes)
    n = H.number_of_nodes()
    m = H.number_of_edges()

    if m != n - 1:
        return None

    if not nx.is_connected(H):
        return None

    degrees = dict(H.degree())
    root = max(degrees, key=lambda x: (degrees[x], -hash(x)))

    return PatternInstance(
        definition=PATTERN_BY_ID["tree"],
        node_ids=frozenset(nodes),
        edge_keys=frozenset(H.edges()),
        confidence=1.0,
        score=n,
        features={"n_nodes": n, "n_edges": m},
        center_node=root,
    )


def _detect_core(
    G: nx.Graph, nodes: Set[str], min_k: int = 2
) -> Optional[PatternInstance]:
    if len(nodes) < 3:
        return None

    H = G.subgraph(nodes)

    try:
        core_numbers = nx.core_number(H)
        min_core = min(core_numbers.values())

        if min_core < min_k:
            return None

        return PatternInstance(
            definition=PATTERN_BY_ID["core"],
            node_ids=frozenset(nodes),
            edge_keys=frozenset(H.edges()),
            confidence=min(1.0, min_core / 5),
            score=len(nodes) * min_core,
            features={
                "k_core": min_core,
                "n_nodes": len(nodes),
            },
        )
    except Exception:
        return None


def detect_patterns(
    G: nx.Graph,
    selection_type: str,
    selected_ids: List[str],
    evidence: Optional[EvidenceResult] = None,
    pattern_definitions: Optional[List[PatternDefinition]] = None,
) -> List[PatternInstance]:
    patterns: List[PatternInstance] = []

    if not selected_ids:
        return patterns

    node_set = set(selected_ids)

    if selection_type == "node":
        if len(selected_ids) == 1:
            node = selected_ids[0]
            for detector in [_detect_isolated, _detect_leaf, _detect_articulation]:
                p = detector(G, node)
                if p:
                    patterns.append(p)

            p = _detect_hub(G, node)
            if p:
                patterns.append(p)

        else:
            p = _detect_clique(G, node_set)
            if p:
                patterns.append(p)

            p = _detect_star(G, node_set)
            if p:
                patterns.append(p)

            p = _detect_cluster(G, node_set)
            if p:
                patterns.append(p)

            p = _detect_community(G, node_set)
            if p:
                patterns.append(p)

            p = _detect_bipartite(G, node_set)
            if p:
                patterns.append(p)

            p = _detect_tree(G, node_set)
            if p:
                patterns.append(p)

            p = _detect_core(G, node_set)
            if p:
                patterns.append(p)

    elif selection_type == "edge":
        if len(selected_ids) >= 2:
            u, v = selected_ids[0], selected_ids[1]
            p = _detect_bridge(G, u, v)
            if p:
                patterns.append(p)

            common = set(G.neighbors(u)) & set(G.neighbors(v))
            for w in common:
                tri = _detect_triangle(G, {u, v, w})
                if tri:
                    patterns.append(tri)
                    break

    elif selection_type == "path":
        p = _detect_path(G, selected_ids)
        if p:
            patterns.append(p)

        p = _detect_cycle(G, selected_ids)
        if p:
            patterns.append(p)

        p = _detect_chain(G, selected_ids)
        if p:
            patterns.append(p)

    elif selection_type == "subgraph":
        p = _detect_clique(G, node_set)
        if p:
            patterns.append(p)

        if not p:
            p = _detect_cluster(G, node_set)
            if p:
                patterns.append(p)

        p = _detect_star(G, node_set)
        if p:
            patterns.append(p)

        p = _detect_community(G, node_set)
        if p:
            patterns.append(p)

        p = _detect_bipartite(G, node_set)
        if p:
            patterns.append(p)

        p = _detect_tree(G, node_set)
        if p:
            patterns.append(p)

        p = _detect_core(G, node_set)
        if p:
            patterns.append(p)

        H = G.subgraph(node_set)
        try:
            cycles = list(nx.simple_cycles(H.to_directed()))
            for cycle in cycles[:3]:
                if len(cycle) >= 3:
                    p = _detect_cycle(G, cycle + [cycle[0]])
                    if p:
                        patterns.append(p)
        except Exception:
            pass

    patterns.sort(key=lambda p: (p.score, p.confidence), reverse=True)

    return patterns


class PatternEngine:
    def __init__(self, graph: Optional[nx.Graph] = None):
        self._graph = graph
        self._definitions = list(DEFAULT_PATTERNS)
        self._detected: List[PatternInstance] = []

    def set_graph(self, graph: nx.Graph) -> None:
        self._graph = graph
        self._detected.clear()

    def add_definition(self, definition: PatternDefinition) -> None:
        self._definitions.append(definition)

    def get_definitions(self) -> List[PatternDefinition]:
        return list(self._definitions)

    def detect(
        self,
        selection_type: str,
        selected_ids: List[str],
        evidence: Optional[EvidenceResult] = None,
    ) -> List[PatternInstance]:
        if self._graph is None:
            raise ValueError("No graph set")

        self._detected = detect_patterns(
            self._graph, selection_type, selected_ids, evidence, self._definitions
        )
        return self._detected

    def get_detected(self) -> List[PatternInstance]:
        return list(self._detected)

    def accept_pattern(self, index: int) -> Optional[PatternInstance]:
        if 0 <= index < len(self._detected):
            return self._detected[index]
        return None

    def reject_pattern(self, index: int) -> bool:
        if 0 <= index < len(self._detected):
            self._detected.pop(index)
            return True
        return False
