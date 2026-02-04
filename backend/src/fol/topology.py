from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import networkx as nx
from networkx.algorithms import community


@dataclass
class TopologyMetrics:
    graph: nx.Graph
    _cache: dict[str, dict[str, float]] = field(default_factory=dict, repr=False)
    _categorical_cache: dict[str, dict[str, Any]] = field(
        default_factory=dict, repr=False
    )
    _computed: set[str] = field(default_factory=set, repr=False)
    NUMERIC_METRICS = frozenset(
        {
            "degree",
            "betweenness_centrality",
            "closeness_centrality",
            "pagerank",
            "clustering_coefficient",
            "k_core",
        }
    )

    CATEGORICAL_METRICS = frozenset(
        {
            "louvain_community",
            "component",
        }
    )

    METRICS = NUMERIC_METRICS | CATEGORICAL_METRICS

    FAST_METRICS = frozenset(
        {
            "degree",
            "k_core",
            "pagerank",
            "clustering_coefficient",
            "louvain_community",
            "component",
        }
    )

    def get_metric(self, node_id: str, metric: str) -> float | Any:
        if metric not in self._computed:
            self._compute_metric(metric)

        if metric in self.CATEGORICAL_METRICS:
            return self._categorical_cache.get(metric, {}).get(node_id, None)
        return self._cache.get(metric, {}).get(node_id, 0.0)

    def get_category(self, node_id: str, metric: str) -> str | None:
        if metric not in self.CATEGORICAL_METRICS:
            return None

        if metric not in self._computed:
            self._compute_metric(metric)

        return self._categorical_cache.get(metric, {}).get(node_id)

    def get_all_metrics(self, node_id: str) -> dict[str, float | Any]:
        result = {}
        for metric in self.METRICS:
            if metric in self._computed:
                if metric in self.CATEGORICAL_METRICS:
                    val = self._categorical_cache.get(metric, {}).get(node_id)
                    if val is not None:
                        result[metric] = val
                else:
                    result[metric] = self._cache.get(metric, {}).get(node_id, 0.0)
        return result

    def compute_all(self) -> None:
        for metric in self.METRICS:
            if metric not in self._computed:
                self._compute_metric(metric)

    def compute_fast(self) -> None:
        for metric in self.FAST_METRICS:
            if metric not in self._computed:
                self._compute_metric(metric)

    def _compute_metric(self, metric: str) -> None:
        if metric in self._computed:
            return

        graph = self.graph
        n = graph.number_of_nodes()

        if n == 0:
            if metric in self.CATEGORICAL_METRICS:
                self._categorical_cache[metric] = {}
            else:
                self._cache[metric] = {}
            self._computed.add(metric)
            return

        try:
            if metric == "degree":
                self._cache[metric] = {
                    str(k): float(v) for k, v in dict(graph.degree()).items()
                }

            elif metric == "betweenness_centrality":
                if n < 5000:
                    bc = nx.betweenness_centrality(graph)
                else:
                    bc = nx.betweenness_centrality(graph, k=min(100, n))
                self._cache[metric] = {str(k): float(v) for k, v in bc.items()}

            elif metric == "closeness_centrality":
                cc = nx.closeness_centrality(graph)
                self._cache[metric] = {str(k): float(v) for k, v in cc.items()}

            elif metric == "pagerank":
                pr = nx.pagerank(graph, max_iter=100)
                self._cache[metric] = {str(k): float(v) for k, v in pr.items()}

            elif metric == "clustering_coefficient":
                g = graph.to_undirected() if graph.is_directed() else graph
                cc = nx.clustering(g)
                self._cache[metric] = {
                    str(k): 0.0 if math.isnan(float(v)) else float(v)
                    for k, v in cc.items()
                }

            elif metric == "k_core":
                g = graph.to_undirected() if graph.is_directed() else graph
                kc = nx.core_number(g)
                self._cache[metric] = {str(k): float(v) for k, v in kc.items()}

            elif metric == "louvain_community":
                g = graph.to_undirected() if graph.is_directed() else graph
                try:
                    communities = community.louvain_communities(g, seed=42)
                    result = {}
                    sorted_communities = sorted(
                        communities, key=lambda c: min(str(n) for n in c)
                    )
                    for idx, comm in enumerate(sorted_communities):
                        for node in comm:
                            result[str(node)] = f"cluster_{idx}"
                    self._categorical_cache[metric] = result
                except Exception:
                    self._categorical_cache[metric] = {
                        str(k): "cluster_0" for k in graph.nodes()
                    }

            elif metric == "component":
                g = graph.to_undirected() if graph.is_directed() else graph
                components = sorted(nx.connected_components(g), key=len, reverse=True)
                result = {}
                for idx, comp in enumerate(components):
                    for node in comp:
                        result[str(node)] = f"component_{idx}"
                self._categorical_cache[metric] = result

            else:
                if metric in self.CATEGORICAL_METRICS:
                    self._categorical_cache[metric] = {}
                else:
                    self._cache[metric] = {}

        except Exception:
            if metric in self.CATEGORICAL_METRICS:
                self._categorical_cache[metric] = {}
            else:
                self._cache[metric] = {}

        self._computed.add(metric)

    def get_nodes_by_threshold(
        self,
        metric: str,
        operator: str,
        threshold: float,
    ) -> set[str]:
        if metric not in self._computed:
            self._compute_metric(metric)

        values = self._cache.get(metric, {})

        ops = {
            ">=": lambda x: x >= threshold,
            ">": lambda x: x > threshold,
            "<=": lambda x: x <= threshold,
            "<": lambda x: x < threshold,
            "=": lambda x: x == threshold,
            "!=": lambda x: x != threshold,
        }

        op_func = ops.get(operator, lambda x: False)
        return {node_id for node_id, value in values.items() if op_func(value)}

    def get_nodes_by_category(
        self,
        metric: str,
        value: str,
        operator: str = "=",
    ) -> set[str]:
        if metric not in self._computed:
            self._compute_metric(metric)

        values = self._categorical_cache.get(metric, {})

        if operator == "=":
            return {node_id for node_id, v in values.items() if v == value}
        elif operator == "!=":
            return {node_id for node_id, v in values.items() if v != value}
        return set()
