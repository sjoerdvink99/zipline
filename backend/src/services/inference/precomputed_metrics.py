import logging

import networkx as nx
import numpy as np

logger = logging.getLogger(__name__)


class PrecomputedGraphMetrics:
    def __init__(self, graph: nx.Graph):
        self.graph = graph
        self.node_count = len(graph.nodes())

        self.degree: dict[str, int] = {}
        self.betweenness: dict[str, float] = {}
        self.closeness: dict[str, float] = {}
        self.clustering: dict[str, float] = {}
        self.eigenvector: dict[str, float] = {}
        self.pagerank: dict[str, float] = {}

        self._compute_all_metrics()
        self._compute_metric_statistics()

    def _compute_all_metrics(self) -> None:
        logger.info(
            f"Computing topological metrics for graph with {self.node_count} nodes"
        )

        try:
            self.degree = dict(self.graph.degree())

            if self.node_count > 0:
                if self.node_count <= 1000:
                    self.betweenness = nx.betweenness_centrality(self.graph)
                    self.closeness = nx.closeness_centrality(self.graph)

                    try:
                        self.eigenvector = nx.eigenvector_centrality(
                            self.graph, max_iter=1000
                        )
                    except (nx.PowerIterationFailedConvergence, nx.NetworkXError):
                        logger.warning(
                            "Eigenvector centrality computation failed, using zeros"
                        )
                        self.eigenvector = dict.fromkeys(self.graph.nodes(), 0.0)
                else:
                    sample_size = min(100, self.node_count)
                    sample_nodes = list(self.graph.nodes())[:sample_size]

                    self.betweenness = nx.betweenness_centrality_subset(
                        self.graph, sample_nodes, sample_nodes
                    )
                    self.closeness = dict.fromkeys(self.graph.nodes(), 0.0)
                    self.eigenvector = dict.fromkeys(self.graph.nodes(), 0.0)

                self.pagerank = nx.pagerank(self.graph, max_iter=100)
                self.clustering = nx.clustering(self.graph)

        except Exception as e:
            logger.error(f"Error computing graph metrics: {e}")
            self.betweenness = dict.fromkeys(self.graph.nodes(), 0.0)
            self.closeness = dict.fromkeys(self.graph.nodes(), 0.0)
            self.clustering = dict.fromkeys(self.graph.nodes(), 0.0)
            self.eigenvector = dict.fromkeys(self.graph.nodes(), 0.0)
            self.pagerank = dict.fromkeys(self.graph.nodes(), 1.0 / self.node_count)

    def _compute_metric_statistics(self) -> None:
        self.metric_stats = {}

        for metric_name in [
            "degree",
            "betweenness",
            "closeness",
            "clustering",
            "eigenvector",
            "pagerank",
        ]:
            metric_dict = getattr(self, metric_name)
            values = list(metric_dict.values())

            if values:
                self.metric_stats[metric_name] = {
                    "min": np.min(values),
                    "q25": np.percentile(values, 25),
                    "median": np.percentile(values, 50),
                    "q75": np.percentile(values, 75),
                    "max": np.max(values),
                    "mean": np.mean(values),
                    "std": np.std(values),
                }

    def get_metric(self, node_id: str, metric: str) -> float:
        metric_dict = getattr(self, metric, {})
        return metric_dict.get(node_id, 0.0)

    def get_metric_stats(self, metric: str) -> dict[str, float]:
        return self.metric_stats.get(metric, {})

    def get_all_metrics_for_node(self, node_id: str) -> dict[str, float]:
        return {
            "degree": self.get_metric(node_id, "degree"),
            "betweenness": self.get_metric(node_id, "betweenness"),
            "closeness": self.get_metric(node_id, "closeness"),
            "clustering": self.get_metric(node_id, "clustering"),
            "eigenvector": self.get_metric(node_id, "eigenvector"),
            "pagerank": self.get_metric(node_id, "pagerank"),
        }
