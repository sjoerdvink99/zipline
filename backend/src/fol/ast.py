from __future__ import annotations

import weakref
from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Any, Protocol, cast, runtime_checkable

if TYPE_CHECKING:
    from fol.learning.neighborhood_index import NeighborhoodIndex

import networkx as nx

_neighborhood_index_registry: dict[int, NeighborhoodIndex] = {}
_graph_refs: dict[int, weakref.ref] = {}


def _get_shared_neighborhood_index(graph: nx.Graph) -> NeighborhoodIndex:
    from fol.learning.neighborhood_index import NeighborhoodIndex

    graph_id = id(graph)
    if graph_id not in _neighborhood_index_registry:

        def _evict(ref: Any, gid: int = graph_id) -> None:
            _neighborhood_index_registry.pop(gid, None)
            _graph_refs.pop(gid, None)

        _graph_refs[graph_id] = weakref.ref(graph, _evict)
        _neighborhood_index_registry[graph_id] = NeighborhoodIndex(graph)
    return _neighborhood_index_registry[graph_id]


class Quantifier(Enum):
    FORALL = "∀"
    EXISTS = "∃"
    EXACTLY = "exactly"
    AT_LEAST = "at_least"
    AT_MOST = "at_most"


class Comparator(Enum):
    EQ = "="
    NEQ = "!="
    GT = ">"
    GTE = ">="
    LT = "<"
    LTE = "<="


@dataclass(frozen=True, slots=True)
class Variable:
    name: str

    def __str__(self) -> str:
        return self.name


@runtime_checkable
class FOLNode(Protocol):
    def evaluate(self, graph: nx.Graph, bindings: dict[str, str]) -> bool: ...

    def free_variables(self) -> set[str]: ...

    def to_fol(self) -> str: ...


@dataclass(slots=True)
class UnaryPredicate:
    name: str
    variable: Variable

    def evaluate(self, graph: nx.Graph, bindings: dict[str, str]) -> bool:
        node_id = bindings.get(self.variable.name)
        if node_id is None or not graph.has_node(node_id):
            return False

        node_data = graph.nodes[node_id]

        if "_" in self.name:
            parts = self.name.split("_", 1)
            if len(parts) == 2:
                attr_name, attr_value = parts
                if attr_name in node_data:
                    node_val = node_data[attr_name]
                    if isinstance(node_val, list):
                        return attr_value in node_val or any(
                            str(v).replace(" ", "_") == attr_value for v in node_val
                        )
                    return (
                        str(node_val) == attr_value
                        or str(node_val).replace(" ", "_") == attr_value
                    )

        return node_data.get(self.name, False) is True

    def free_variables(self) -> set[str]:
        return {self.variable.name}

    def to_fol(self) -> str:
        return f"{self.name}({self.variable.name})"


@dataclass(slots=True)
class TypePredicate:
    type_name: str
    variable: Variable

    def evaluate(self, graph: nx.Graph, bindings: dict[str, str]) -> bool:
        node_id = bindings.get(self.variable.name)
        if node_id is None or not graph.has_node(node_id):
            return False

        node_data = graph.nodes[node_id]
        node_type = (
            node_data.get("node_type")
            or node_data.get("type")
            or node_data.get("label")
        )
        return bool(node_type == self.type_name)

    def free_variables(self) -> set[str]:
        return {self.variable.name}

    def to_fol(self) -> str:
        return f"{self.type_name}({self.variable.name})"


@dataclass(slots=True)
class ComparisonPredicate:
    attribute: str
    variable: Variable
    comparator: Comparator
    value: Any
    _topology_cache: dict[str, dict[str, float]] = field(
        default_factory=dict, repr=False
    )
    _categorical_topology_cache: dict[int, Any] = field(
        default_factory=dict, repr=False
    )

    CATEGORICAL_TOPOLOGY_METRICS = frozenset(
        {
            "louvain_community",
            "component",
        }
    )

    NUMERIC_TOPOLOGY_METRICS = frozenset(
        {
            "k_core",
            "closeness_centrality",
        }
    )

    def evaluate(self, graph: nx.Graph, bindings: dict[str, str]) -> bool:
        node_id = bindings.get(self.variable.name)
        if node_id is None or not graph.has_node(node_id):
            return False

        node_value = self._get_value(graph, node_id)
        if node_value is None:
            return False

        return self._compare(node_value)

    def _get_value(self, graph: nx.Graph, node_id: str) -> Any:
        if self.attribute == "degree":
            return graph.degree[node_id]
        elif (
            self.attribute == "clustering" or self.attribute == "clustering_coefficient"
        ):
            return nx.clustering(graph, node_id)
        elif self.attribute == "betweenness_centrality":
            return self._get_cached_centrality(graph, "betweenness", node_id)
        elif self.attribute == "pagerank":
            return self._get_cached_centrality(graph, "pagerank", node_id)
        elif self.attribute in self.CATEGORICAL_TOPOLOGY_METRICS:
            return self._get_categorical_topology(graph, node_id)
        elif self.attribute in self.NUMERIC_TOPOLOGY_METRICS:
            return self._get_numeric_topology(graph, node_id)

        return graph.nodes[node_id].get(self.attribute)

    def _get_categorical_topology(self, graph: nx.Graph, node_id: str) -> str | None:
        graph_id = id(graph)
        if graph_id not in self._categorical_topology_cache:
            from fol.topology import TopologyMetrics

            self._categorical_topology_cache[graph_id] = TopologyMetrics(graph)

        topology = self._categorical_topology_cache[graph_id]
        return cast("str | None", topology.get_category(node_id, self.attribute))

    def _get_numeric_topology(self, graph: nx.Graph, node_id: str) -> float:
        graph_id = id(graph)
        if graph_id not in self._categorical_topology_cache:
            from fol.topology import TopologyMetrics

            self._categorical_topology_cache[graph_id] = TopologyMetrics(graph)

        topology = self._categorical_topology_cache[graph_id]
        return float(topology.get_metric(node_id, self.attribute))

    def _get_cached_centrality(
        self, graph: nx.Graph, metric: str, node_id: str
    ) -> float:
        graph_id = id(graph)
        cache_key = f"{graph_id}_{metric}"

        if cache_key not in self._topology_cache:
            if metric == "betweenness":
                self._topology_cache[cache_key] = nx.betweenness_centrality(graph)
            elif metric == "pagerank":
                self._topology_cache[cache_key] = nx.pagerank(graph)

        return self._topology_cache[cache_key].get(node_id, 0.0)

    def _compare(self, left: Any) -> bool:
        right = self.value

        if isinstance(left, list):
            if self.comparator == Comparator.EQ:
                return str(right) in [str(item) for item in left]
            elif self.comparator == Comparator.NEQ:
                return str(right) not in [str(item) for item in left]
            return False

        if self.comparator == Comparator.EQ:
            return bool(left == right)
        elif self.comparator == Comparator.NEQ:
            return bool(left != right)

        try:
            if self.comparator == Comparator.GT:
                return bool(left > right)
            elif self.comparator == Comparator.GTE:
                return bool(left >= right)
            elif self.comparator == Comparator.LT:
                return bool(left < right)
            elif self.comparator == Comparator.LTE:
                return bool(left <= right)
        except TypeError:
            return False

        raise ValueError(f"Unknown comparator: {self.comparator}")

    def free_variables(self) -> set[str]:
        return {self.variable.name}

    def to_fol(self) -> str:
        val = f'"{self.value}"' if isinstance(self.value, str) else str(self.value)
        return f"{self.attribute}({self.variable.name}) {self.comparator.value} {val}"


@dataclass(slots=True)
class Conjunction:
    operands: list[FOLNode]

    def evaluate(self, graph: nx.Graph, bindings: dict[str, str]) -> bool:
        return all(op.evaluate(graph, bindings) for op in self.operands)

    def free_variables(self) -> set[str]:
        result: set[str] = set()
        for op in self.operands:
            result.update(op.free_variables())
        return result

    def to_fol(self) -> str:
        parts = []
        for op in self.operands:
            s = op.to_fol()
            if isinstance(op, Conjunction | Disjunction):
                s = f"({s})"
            parts.append(s)
        return " ∧ ".join(parts)


@dataclass(slots=True)
class Disjunction:
    operands: list[FOLNode]

    def evaluate(self, graph: nx.Graph, bindings: dict[str, str]) -> bool:
        return any(op.evaluate(graph, bindings) for op in self.operands)

    def free_variables(self) -> set[str]:
        result: set[str] = set()
        for op in self.operands:
            result.update(op.free_variables())
        return result

    def to_fol(self) -> str:
        parts = []
        for op in self.operands:
            s = op.to_fol()
            if isinstance(op, Conjunction | Disjunction):
                s = f"({s})"
            parts.append(s)
        return " ∨ ".join(parts)


@dataclass(slots=True)
class Negation:
    operand: FOLNode

    def evaluate(self, graph: nx.Graph, bindings: dict[str, str]) -> bool:
        return not self.operand.evaluate(graph, bindings)

    def free_variables(self) -> set[str]:
        return self.operand.free_variables()

    def to_fol(self) -> str:
        inner = self.operand.to_fol()
        if isinstance(self.operand, Conjunction | Disjunction):
            return f"¬({inner})"
        return f"¬{inner}"


@dataclass(slots=True)
class NeighborhoodQuantifier:
    quantifier: Quantifier
    bound_variable: Variable
    target_variable: Variable
    k: int
    body: FOLNode
    count: int | None = None
    path: tuple[Any, ...] | None = None

    def evaluate(self, graph: nx.Graph, bindings: dict[str, str]) -> bool:
        target_id = bindings.get(self.target_variable.name)
        if target_id is None or not graph.has_node(target_id):
            return False

        neighbors = self._get_k_hop_neighbors(graph, target_id)
        satisfying = 0

        for neighbor_id in neighbors:
            new_bindings = {**bindings, self.bound_variable.name: neighbor_id}
            if self.body.evaluate(graph, new_bindings):
                satisfying += 1

        return self._check_quantifier(satisfying, len(neighbors))

    def _get_k_hop_neighbors(self, graph: nx.Graph, node_id: str) -> set[str]:
        if self.path is not None:
            idx = _get_shared_neighborhood_index(graph)
            if len(self.path) == 1:
                return idx.get_typed_neighbors(node_id, self.path[0].edge_type)
            elif len(self.path) == 2:
                return idx.get_typed_2hop_neighbors(
                    node_id, self.path[0].edge_type, self.path[1].edge_type
                )
            raise ValueError(f"Path length {len(self.path)} not supported")
        if self.k == 1:
            return set(graph.neighbors(node_id))

        visited: set[str] = set()
        current = {node_id}

        for _ in range(self.k):
            next_frontier: set[str] = set()
            for n in current:
                for neighbor in graph.neighbors(n):
                    if neighbor != node_id and neighbor not in visited:
                        next_frontier.add(neighbor)
            visited.update(next_frontier)
            current = next_frontier

        return visited

    def _check_quantifier(self, satisfying: int, total: int) -> bool:
        if self.quantifier == Quantifier.FORALL:
            return total == 0 or satisfying == total
        elif self.quantifier == Quantifier.EXISTS:
            return satisfying > 0
        elif self.quantifier == Quantifier.EXACTLY:
            return satisfying == (self.count or 0)
        elif self.quantifier == Quantifier.AT_LEAST:
            return satisfying >= (self.count or 0)
        elif self.quantifier == Quantifier.AT_MOST:
            return satisfying <= (self.count or 0)
        raise ValueError(f"Unknown quantifier: {self.quantifier}")

    def free_variables(self) -> set[str]:
        body_vars = self.body.free_variables()
        body_vars.discard(self.bound_variable.name)
        body_vars.add(self.target_variable.name)
        return body_vars

    def to_fol(self) -> str:
        if self.quantifier in (Quantifier.FORALL, Quantifier.EXISTS):
            q = self.quantifier.value
        else:
            q = f"{self.quantifier.value}({self.count})"

        if self.path is not None:
            path_str = ".".join(step.edge_type for step in self.path)
            rel = f"N_{{{path_str}}}({self.target_variable.name})"
        elif self.k == 1:
            rel = f"neighbors({self.target_variable.name})"
        else:
            rel = f"N_{self.k}({self.target_variable.name})"

        return f"{q}{self.bound_variable.name} ∈ {rel} : {self.body.to_fol()}"


@dataclass(slots=True)
class SetComprehension:
    variables: list[Variable]
    predicate: FOLNode

    def evaluate(self, graph: nx.Graph) -> list[dict[str, str]]:
        from fol.evaluator import Evaluator

        evaluator = Evaluator()
        result = evaluator.evaluate(graph, self.predicate, self.variables)
        return result.bindings

    def free_variables(self) -> set[str]:
        return set()

    def to_fol(self) -> str:
        if len(self.variables) == 1:
            var_str = self.variables[0].name
        else:
            var_str = "(" + ", ".join(v.name for v in self.variables) + ")"
        return f"{{ {var_str} | {self.predicate.to_fol()} }}"

    @property
    def tuples(self) -> bool:
        return len(self.variables) > 1
