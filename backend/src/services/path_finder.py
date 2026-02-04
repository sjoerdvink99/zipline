from __future__ import annotations

import time
from collections.abc import Iterator
from dataclasses import dataclass

import networkx as nx


@dataclass(frozen=True)
class PathFindingResult:
    anchor_nodes: list[str]
    paths: list[list[str]]
    path_nodes: set[str]
    path_edges: list[tuple[str, str]]
    algorithm_used: str
    max_paths_found: int
    total_computation_time_ms: float

    @property
    def has_paths(self) -> bool:
        return len(self.paths) > 0

    @property
    def unique_node_count(self) -> int:
        return len(self.path_nodes)


class PathFinder:
    def __init__(self, graph: nx.Graph) -> None:
        self.graph = graph

    def find_paths_between_nodes(
        self,
        source: str,
        target: str,
        algorithm: str = "k_shortest",
        max_paths: int = 10,
        min_path_length: int = 1,
        max_path_length: int = 6,
    ) -> PathFindingResult:
        start_time = time.perf_counter()

        if source == target:
            raise ValueError("Source and target nodes cannot be the same")

        if not self.graph.has_node(source):
            raise ValueError(f"Source node '{source}' not found in graph")

        if not self.graph.has_node(target):
            raise ValueError(f"Target node '{target}' not found in graph")

        if not nx.has_path(self.graph, source, target):
            return PathFindingResult(
                anchor_nodes=[source, target],
                paths=[],
                path_nodes=set(),
                path_edges=[],
                algorithm_used=algorithm,
                max_paths_found=0,
                total_computation_time_ms=(time.perf_counter() - start_time) * 1000,
            )

        paths = self._find_paths_with_algorithm(
            source, target, algorithm, max_paths, max_path_length
        )

        if min_path_length > 1:
            paths = [p for p in paths if len(p) - 1 >= min_path_length]

        all_path_nodes = set()
        all_path_edges = []

        for path in paths:
            all_path_nodes.update(path)
            for i in range(len(path) - 1):
                edge = (path[i], path[i + 1])
                if edge not in all_path_edges:
                    all_path_edges.append(edge)

        computation_time = (time.perf_counter() - start_time) * 1000

        return PathFindingResult(
            anchor_nodes=[source, target],
            paths=paths,
            path_nodes=all_path_nodes,
            path_edges=all_path_edges,
            algorithm_used=algorithm,
            max_paths_found=len(paths),
            total_computation_time_ms=computation_time,
        )

    def _find_paths_with_algorithm(
        self,
        source: str,
        target: str,
        algorithm: str,
        max_paths: int,
        max_path_length: int,
    ) -> list[list[str]]:
        if algorithm == "shortest":
            try:
                path = nx.shortest_path(self.graph, source, target)
                return [path] if len(path) <= max_path_length + 1 else []
            except nx.NetworkXNoPath:
                return []

        elif algorithm == "k_shortest":
            return self._k_shortest_paths(source, target, max_paths, max_path_length)

        elif algorithm == "all_simple":
            return self._all_simple_paths(source, target, max_paths, max_path_length)

        elif algorithm == "all_shortest":
            return self._all_shortest_paths(source, target, max_paths)

        else:
            raise ValueError(f"Unknown algorithm: {algorithm}")

    def _k_shortest_paths(
        self, source: str, target: str, max_paths: int, max_path_length: int
    ) -> list[list[str]]:
        paths = []
        try:
            path_generator: Iterator[list[str]] = nx.shortest_simple_paths(
                self.graph, source, target
            )

            for path in path_generator:
                if len(path) > max_path_length + 1:
                    continue

                paths.append(path)

                if len(paths) >= max_paths:
                    break

        except nx.NetworkXNoPath:
            pass

        return paths

    def _all_shortest_paths(
        self, source: str, target: str, max_paths: int
    ) -> list[list[str]]:
        paths = []
        try:
            for path in nx.all_shortest_paths(self.graph, source, target):
                paths.append(path)
                if len(paths) >= max_paths:
                    break
        except nx.NetworkXNoPath:
            pass
        return paths

    def _all_simple_paths(
        self, source: str, target: str, max_paths: int, max_path_length: int
    ) -> list[list[str]]:
        paths = []
        try:
            path_generator = nx.all_simple_paths(
                self.graph, source, target, cutoff=max_path_length
            )

            for path in path_generator:
                paths.append(path)

                if len(paths) >= max_paths:
                    break

        except nx.NetworkXNoPath:
            pass

        return paths
