from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, Field


class ProjectionResultModel(BaseModel):
    primary_node: str = Field(
        ..., description="The primary node that matches the predicate"
    )
    projected_variables: dict[str, list[str]] = Field(
        default_factory=dict,
        description="Variables and their matching nodes in the predicate evaluation",
    )


class PredicateEvaluationResult(BaseModel):
    matching_nodes: list[str] = Field(
        default_factory=list,
        description="List of primary nodes that match the predicate",
    )
    projections: list[ProjectionResultModel] | None = Field(
        default=None,
        description="Projected relational variables if projection is enabled",
    )


class PredicateEvaluationRequest(BaseModel):
    expression: str = Field(..., description="FOL predicate expression to evaluate")
    project_variables: list[str] | None = Field(
        default=None,
        description="List of relational variables to project (e.g., ['y', 'z'])",
    )


class PredicateEvaluationResponse(BaseModel):
    result: PredicateEvaluationResult
    stats: dict[str, float] = Field(
        default_factory=dict,
        description="Evaluation statistics (time, nodes evaluated, etc.)",
    )
    validation: dict[str, Any] = Field(
        default_factory=dict,
        description="Validation information including errors and warnings",
    )


class SelectionPredicateRequest(BaseModel):
    selected_nodes: list[str] = Field(..., description="List of selected node IDs")
    include_cross_space: bool = Field(
        default=True, description="Include cross-space predicates"
    )
    max_predicates_per_type: int = Field(
        default=10, description="Maximum predicates per type"
    )
    min_coverage: float = Field(default=0.6, description="Minimum coverage threshold")
    min_selectivity: float = Field(
        default=0.1, description="Minimum selectivity threshold"
    )


class PredicateResponse(BaseModel):
    space: str
    fol_expression: str
    coverage: float
    selectivity: float
    quality_score: float
    matching_nodes: list[str]


class AttributePredicateResponse(PredicateResponse):
    attribute: str
    operator: str
    value: str | float | int | bool


class TopologyPredicateResponse(PredicateResponse):
    metric: str
    operator: str
    threshold: float


class SelectionPredicateResponse(BaseModel):
    attribute_predicates: list[AttributePredicateResponse]
    topology_predicates: list[TopologyPredicateResponse]
    selection_size: int
    total_predicates: int


@dataclass
class PredicateQuality:
    coverage: float
    selectivity: float
    quality_score: float


@dataclass
class AttributePredicate:
    attribute: str
    operator: str | Any
    value: str | float | int | bool
    coverage: float
    selectivity: float
    quality_score: float
    matching_nodes: list[str] = field(default_factory=list)

    def to_fol(self) -> str:
        operator_str = (
            self.operator.value
            if hasattr(self.operator, "value")
            else str(self.operator)
        )

        if operator_str == "=":
            return f'{self.attribute}(x, "{self.value}")'
        elif operator_str == "in":
            return f'x.{self.attribute} in "{self.value}"'
        elif operator_str in [">=", "<=", ">", "<"]:
            return f"{self.attribute}(x) {operator_str} {self.value}"
        else:
            return f'{self.attribute}(x) {operator_str} "{self.value}"'

    def matches(self, node_id: str, graph) -> bool:
        import networkx as nx

        if not isinstance(graph, nx.Graph) or not graph.has_node(node_id):
            return False

        node_data = graph.nodes[node_id]
        if self.attribute not in node_data:
            return False

        node_value = node_data[self.attribute]
        operator_str = (
            self.operator.value
            if hasattr(self.operator, "value")
            else str(self.operator)
        )

        if operator_str == "=":
            return node_value == self.value
        elif operator_str == "in":
            return isinstance(node_value, list) and self.value in node_value
        elif operator_str == ">=":
            return node_value >= self.value
        elif operator_str == "<=":
            return node_value <= self.value
        elif operator_str == ">":
            return node_value > self.value
        elif operator_str == "<":
            return node_value < self.value
        else:
            return node_value == self.value


@dataclass
class TopologyPredicate:
    metric: str
    operator: str | Any
    threshold: float
    coverage: float
    selectivity: float
    quality_score: float
    matching_nodes: list[str] = field(default_factory=list)

    def to_fol(self) -> str:
        operator_str = (
            self.operator.value
            if hasattr(self.operator, "value")
            else str(self.operator)
        )
        return f"{self.metric}(x) {operator_str} {self.threshold}"

    def matches(self, node_id: str, metrics) -> bool:
        from services.inference.precomputed_metrics import PrecomputedGraphMetrics

        if not isinstance(metrics, PrecomputedGraphMetrics):
            return False

        node_metric_value = metrics.get_metric(node_id, self.metric)
        if node_metric_value is None:
            return False

        operator_str = (
            self.operator.value
            if hasattr(self.operator, "value")
            else str(self.operator)
        )

        if operator_str == ">=":
            return node_metric_value >= self.threshold
        elif operator_str == "<=":
            return node_metric_value <= self.threshold
        elif operator_str == ">":
            return node_metric_value > self.threshold
        elif operator_str == "<":
            return node_metric_value < self.threshold
        elif operator_str == "=":
            return node_metric_value == self.threshold
        else:
            return False


@dataclass
class PredicateInferenceResult:
    attribute_predicates: list[AttributePredicate]
    topology_predicates: list[TopologyPredicate]
    computation_time: float
    selection_size: int

    @property
    def all_predicates(self) -> list[AttributePredicate | TopologyPredicate]:
        return self.attribute_predicates + self.topology_predicates

    def get_top_quality_predicates(
        self, n: int = 5
    ) -> list[AttributePredicate | TopologyPredicate]:
        all_preds = self.all_predicates
        return sorted(all_preds, key=lambda p: p.quality_score, reverse=True)[:n]


@dataclass
class CrossSpaceFilterResult:
    matching_nodes: set[str]
    expression: str
    description: str
    stats: Any
    validation_result: dict[str, Any]
