from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import networkx as nx

from fol.schema import EdgeStep


class QuantifierType(Enum):
    EXISTS = "exists"
    FORALL = "forall"
    COUNT_GE = "count_ge"


@dataclass(frozen=True, slots=True)
class NeighborhoodLiteralSpec:
    quantifier: QuantifierType
    k_hop: int
    base_predicates: tuple[str, ...]
    threshold: int | None = None
    path: tuple[EdgeStep, ...] | None = None

    def is_typed(self) -> bool:
        return self.path is not None

    def to_fol_string(self) -> str:
        if self.path:
            path_str = ".".join(step.edge_type for step in self.path)
            neighborhood = f"N_{{{path_str}}}(x)"
        elif self.k_hop == 1:
            neighborhood = "neighbors(x)"
        else:
            neighborhood = f"N_{self.k_hop}(x)"

        body = " ∧ ".join(p if "(y)" in p else f"{p}(y)" for p in self.base_predicates)

        if self.quantifier == QuantifierType.EXISTS:
            return f"∃y ∈ {neighborhood} : {body}"
        elif self.quantifier == QuantifierType.FORALL:
            return f"∀y ∈ {neighborhood} : {body}"
        elif self.quantifier == QuantifierType.COUNT_GE:
            return f"at_least({self.threshold}) y ∈ {neighborhood} : {body}"
        raise ValueError(f"Unknown quantifier: {self.quantifier}")


class NeighborhoodIndex:
    def __init__(self, graph: nx.Graph):
        self.graph = graph
        self._adjacency_cache: dict[str, set[str]] = {}
        self._typed_adjacency: dict[str, dict[str, set[str]]] = {}
        self._typed_2hop_cache: dict[tuple[str, str], dict[str, set[str]]] = {}
        self._node_type: dict[str, str] = {}
        self._precompute_adjacency()

    def _precompute_adjacency(self) -> None:
        for node, data in self.graph.nodes(data=True):
            node_str = str(node)
            self._node_type[node_str] = (
                data.get("node_type")
                or data.get("type")
                or data.get("label")
                or "unknown"
            )
        for node in self.graph.nodes():
            node_str = str(node)
            self._adjacency_cache[node_str] = {
                str(neighbor) for neighbor in self.graph.neighbors(node)
            }
        for u, v, data in self.graph.edges(data=True):
            edge_type = data.get("edge_type", "related")
            u_str, v_str = str(u), str(v)
            self._typed_adjacency.setdefault(edge_type, {})
            self._typed_adjacency[edge_type].setdefault(u_str, set()).add(v_str)
            if not self.graph.is_directed():
                self._typed_adjacency[edge_type].setdefault(v_str, set()).add(u_str)

    def get_neighbors(self, node_id: str) -> set[str]:
        return self._adjacency_cache.get(node_id, set())

    def get_k_hop_neighbors(self, node_id: str, k: int) -> set[str]:
        if k == 1:
            return self.get_neighbors(node_id)

        visited: set[str] = set()
        current = {node_id}

        for _hop in range(k):
            next_frontier: set[str] = set()
            for n in current:
                for neighbor in self.get_neighbors(n):
                    if neighbor != node_id and neighbor not in visited:
                        next_frontier.add(neighbor)
            visited.update(next_frontier)
            current = next_frontier

        return visited

    def get_typed_neighbors(self, node_id: str, edge_type: str) -> set[str]:
        return self._typed_adjacency.get(edge_type, {}).get(node_id, set())

    def get_typed_2hop_neighbors(
        self, node_id: str, step1_edge_type: str, step2_edge_type: str
    ) -> set[str]:
        return self._get_typed_2hop_adjacency(step1_edge_type, step2_edge_type).get(
            node_id, set()
        )

    def _get_typed_2hop_adjacency(self, t1: str, t2: str) -> dict[str, set[str]]:
        cache_key = (t1, t2)
        if cache_key in self._typed_2hop_cache:
            return self._typed_2hop_cache[cache_key]

        step1_adj = self._typed_adjacency.get(t1, {})
        step2_adj = self._typed_adjacency.get(t2, {})
        result: dict[str, set[str]] = {}
        for node_str, hubs in step1_adj.items():
            source_type = self._node_type.get(node_str, "unknown")
            terminals: set[str] = set()
            for hub in hubs:
                for terminal in step2_adj.get(hub, ()):
                    if terminal == node_str:
                        continue
                    if self._node_type.get(terminal, "unknown") == source_type:
                        continue
                    terminals.add(terminal)
            if terminals:
                result[node_str] = terminals
        self._typed_2hop_cache[cache_key] = result
        return result

    def evaluate_typed_path_existential(
        self, path: tuple[EdgeStep, ...], base_predicate_matches: set[str]
    ) -> set[str]:
        if len(path) not in (1, 2):
            raise ValueError(
                f"Only paths of length 1 or 2 are supported, got {len(path)}"
            )
        result: set[str] = set()
        if len(path) == 1:
            t1 = path[0].edge_type
            for node_str, neighbors in self._typed_adjacency.get(t1, {}).items():
                if any(n in base_predicate_matches for n in neighbors):
                    result.add(node_str)
        else:
            t1, t2 = path[0].edge_type, path[1].edge_type
            for node_str, terminals in self._get_typed_2hop_adjacency(t1, t2).items():
                if any(n in base_predicate_matches for n in terminals):
                    result.add(node_str)
        return result

    def evaluate_typed_path_universal(
        self, path: tuple[EdgeStep, ...], base_predicate_matches: set[str]
    ) -> set[str]:
        if len(path) not in (1, 2):
            raise ValueError(
                f"Only paths of length 1 or 2 are supported, got {len(path)}"
            )
        all_nodes = {str(n) for n in self.graph.nodes()}
        result: set[str] = set()
        if len(path) == 1:
            t1 = path[0].edge_type
            nodes_with_typed_neighbors = set(self._typed_adjacency.get(t1, {}).keys())
            result = all_nodes - nodes_with_typed_neighbors
            for node_str, neighbors in self._typed_adjacency.get(t1, {}).items():
                if all(n in base_predicate_matches for n in neighbors):
                    result.add(node_str)
        else:
            t1, t2 = path[0].edge_type, path[1].edge_type
            adjacency = self._get_typed_2hop_adjacency(t1, t2)
            nodes_with_terminals = set(adjacency.keys())
            result = all_nodes - nodes_with_terminals
            for node_str, terminals in adjacency.items():
                if all(n in base_predicate_matches for n in terminals):
                    result.add(node_str)
        return result

    def evaluate_typed_path_count_ge(
        self,
        path: tuple[EdgeStep, ...],
        base_predicate_matches: set[str],
        threshold: int,
    ) -> set[str]:
        if len(path) not in (1, 2):
            raise ValueError(
                f"Only paths of length 1 or 2 are supported, got {len(path)}"
            )
        result: set[str] = set()
        if len(path) == 1:
            t1 = path[0].edge_type
            for node_str, neighbors in self._typed_adjacency.get(t1, {}).items():
                count = sum(1 for n in neighbors if n in base_predicate_matches)
                if count >= threshold:
                    result.add(node_str)
        else:
            t1, t2 = path[0].edge_type, path[1].edge_type
            for node_str, terminals in self._get_typed_2hop_adjacency(t1, t2).items():
                count = sum(1 for n in terminals if n in base_predicate_matches)
                if count >= threshold:
                    result.add(node_str)
        return result

    def evaluate_existential(
        self, base_predicate_matches: set[str], k_hop: int = 1
    ) -> set[str]:
        result: set[str] = set()
        for node_id in self.graph.nodes():
            node_str = str(node_id)
            neighbors = self.get_k_hop_neighbors(node_str, k_hop)
            if any(neighbor in base_predicate_matches for neighbor in neighbors):
                result.add(node_str)
        return result

    def evaluate_universal(
        self, base_predicate_matches: set[str], k_hop: int = 1
    ) -> set[str]:
        result: set[str] = set()
        for node_id in self.graph.nodes():
            node_str = str(node_id)
            neighbors = self.get_k_hop_neighbors(node_str, k_hop)
            if all(neighbor in base_predicate_matches for neighbor in neighbors):
                result.add(node_str)
        return result

    def evaluate_count_ge(
        self, base_predicate_matches: set[str], threshold: int, k_hop: int = 1
    ) -> set[str]:
        result: set[str] = set()
        for node_id in self.graph.nodes():
            node_str = str(node_id)
            neighbors = self.get_k_hop_neighbors(node_str, k_hop)
            count = sum(
                1 for neighbor in neighbors if neighbor in base_predicate_matches
            )
            if count >= threshold:
                result.add(node_str)
        return result

    def evaluate_neighborhood_literal(
        self, spec: NeighborhoodLiteralSpec, base_predicate_matches: set[str]
    ) -> set[str]:
        if spec.is_typed():
            path = spec.path
            assert path is not None
            if spec.quantifier == QuantifierType.EXISTS:
                return self.evaluate_typed_path_existential(
                    path, base_predicate_matches
                )
            elif spec.quantifier == QuantifierType.FORALL:
                return self.evaluate_typed_path_universal(path, base_predicate_matches)
            elif spec.quantifier == QuantifierType.COUNT_GE:
                if spec.threshold is None:
                    raise ValueError("COUNT_GE requires threshold")
                return self.evaluate_typed_path_count_ge(
                    path, base_predicate_matches, spec.threshold
                )
            raise ValueError(
                f"Unknown quantifier type for typed path: {spec.quantifier}"
            )
        if spec.quantifier == QuantifierType.EXISTS:
            return self.evaluate_existential(base_predicate_matches, spec.k_hop)
        elif spec.quantifier == QuantifierType.FORALL:
            return self.evaluate_universal(base_predicate_matches, spec.k_hop)
        elif spec.quantifier == QuantifierType.COUNT_GE:
            if spec.threshold is None:
                raise ValueError("COUNT_GE requires threshold")
            return self.evaluate_count_ge(
                base_predicate_matches, spec.threshold, spec.k_hop
            )
        else:
            raise ValueError(f"Unknown quantifier type: {spec.quantifier}")
