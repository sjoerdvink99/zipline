import networkx as nx

from ..compiler.base_predicates import BasePredicate, NodeTypeConstraint
from ..compiler.formal_types import NumericOperator


class TopologyPredicate(BasePredicate):
    def __init__(
        self,
        metric: str,
        operator: NumericOperator,
        value: float,
        value2: float | None = None,
        node_types: list | None = None,
        description: str | None = None,
    ):
        self.metric = metric
        self.operator = operator
        self.value = value
        self.value2 = value2
        self.node_constraint = NodeTypeConstraint(node_types)

        super().__init__(
            f"topo_{metric}_{operator.value}_{value}",
            description or self._generate_description(),
        )

    def _generate_description(self) -> str:
        node_type_suffix = ""
        if self.node_constraint.allowed_types:
            node_type_suffix = f" ({', '.join(self.node_constraint.allowed_types)})"

        if self.operator == NumericOperator.BETWEEN:
            return f"{self.metric} between {self.value} and {self.value2}{node_type_suffix}"
        else:
            return f"{self.metric} {self.operator.value} {self.value}{node_type_suffix}"

    def evaluate(self, graph: nx.Graph, node_id: str) -> bool:
        if not self.node_constraint.is_applicable(graph, node_id):
            return False

        try:
            metric_value = self._calculate_metric(graph, node_id)
            return self._evaluate_numeric(metric_value)
        except (KeyError, ValueError, nx.NetworkXError):
            return False

    def _calculate_metric(self, graph: nx.Graph, node_id: str) -> float:
        node = node_id if isinstance(node_id, str | int) else str(node_id)

        if self.metric == "degree":
            return float(graph.degree(node))
        elif self.metric == "clustering_coefficient":
            return nx.clustering(graph, node)
        elif self.metric == "betweenness_centrality":
            centralities = nx.betweenness_centrality(graph)
            return centralities.get(node, 0.0)
        elif self.metric == "closeness_centrality":
            centralities = nx.closeness_centrality(graph)
            return centralities.get(node, 0.0)
        elif self.metric == "eigenvector_centrality":
            try:
                centralities = nx.eigenvector_centrality(
                    graph, max_iter=1000, tol=1e-06
                )
                return centralities.get(node, 0.0)
            except (nx.NetworkXError, nx.PowerIterationFailedConvergence):
                return 0.0
        elif self.metric == "pagerank":
            try:
                pagerank = nx.pagerank(graph, max_iter=1000, tol=1e-06)
                return pagerank.get(node, 0.0)
            except (nx.NetworkXError, nx.PowerIterationFailedConvergence):
                return 0.0
        elif self.metric == "k_core":
            try:
                core_numbers = nx.core_number(graph)
                return float(core_numbers.get(node, 0))
            except nx.NetworkXError:
                return 0.0
        else:
            raise ValueError(f"Unknown topology metric: {self.metric}")

    def _evaluate_numeric(self, metric_value: float) -> bool:
        if self.operator == NumericOperator.EQUALS:
            return abs(metric_value - self.value) < 1e-9
        elif self.operator == NumericOperator.NOT_EQUALS:
            return abs(metric_value - self.value) >= 1e-9
        elif self.operator == NumericOperator.GREATER:
            return metric_value > self.value
        elif self.operator == NumericOperator.GREATER_EQUAL:
            return metric_value >= self.value
        elif self.operator == NumericOperator.LESS:
            return metric_value < self.value
        elif self.operator == NumericOperator.LESS_EQUAL:
            return metric_value <= self.value
        elif self.operator == NumericOperator.BETWEEN:
            return self.value <= metric_value <= self.value2
        else:
            raise ValueError(f"Unsupported numeric operator: {self.operator}")

    def get_applicable_nodes(self, graph: nx.Graph) -> set[str]:
        applicable_nodes = set()

        for node_id in graph.nodes():
            try:
                if self.evaluate(graph, str(node_id)):
                    applicable_nodes.add(str(node_id))
            except Exception:
                continue

        return applicable_nodes

    def validate(self, graph: nx.Graph) -> bool:
        if graph.number_of_nodes() == 0:
            return False

        try:
            test_node = next(iter(graph.nodes()))
            self._calculate_metric(graph, test_node)
            return True
        except Exception:
            return False
