from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any

import networkx as nx

from utils.logging_config import get_logger

logger = get_logger("fol.ast")


class Quantifier(Enum):
    FORALL = "forall"
    EXISTS = "exists"
    EXACTLY = "exactly"
    AT_LEAST = "at_least"
    AT_MOST = "at_most"


class Relation(Enum):
    NEIGHBORS = "neighbors"
    K_HOP = "k_hop"
    CONNECTED_COMPONENTS = "connected_components"


class LogicalConnective(Enum):
    AND = "and"
    OR = "or"
    NOT = "not"


class ComparisonOperator(Enum):
    EQUALS = "="
    NOT_EQUALS = "!="
    GREATER = ">"
    GREATER_EQUAL = ">="
    LESS = "<"
    LESS_EQUAL = "<="
    IN = "in"
    NOT_IN = "not_in"


@dataclass
class Variable:
    name: str
    type_constraint: str | None = None


@dataclass
class ProjectionResult:
    primary_node: str
    projected_variables: dict[str, list[str]]


@dataclass
class EvaluationResult:
    matching_nodes: set[str]
    projections: list[ProjectionResult] | None = None


class FOLPredicateAST(ABC):
    @abstractmethod
    def evaluate(self, graph: nx.Graph, assignment: dict[str, str]) -> bool:
        pass

    @abstractmethod
    def evaluate_with_projection(
        self,
        graph: nx.Graph,
        assignment: dict[str, str],
        project_variables: set[str] | None = None,
    ) -> tuple[bool, dict[str, list[str]]]:
        pass

    @abstractmethod
    def get_free_variables(self) -> set[str]:
        pass

    @abstractmethod
    def to_string(self) -> str:
        pass


@dataclass
class AtomicPredicate(FOLPredicateAST):
    predicate_type: str
    target: str
    operator: ComparisonOperator
    value: Any

    def evaluate(self, graph: nx.Graph, assignment: dict[str, str]) -> bool:
        result, _ = self.evaluate_with_projection(graph, assignment, None)
        return result

    def evaluate_with_projection(
        self,
        graph: nx.Graph,
        assignment: dict[str, str],
        project_variables: set[str] | None = None,
    ) -> tuple[bool, dict[str, list[str]]]:
        node_id = assignment[self.target]

        if self.predicate_type.startswith("attr_"):
            attr_key = self.predicate_type[5:]
            node_value = graph.nodes[node_id].get(attr_key)
            result = self._compare_values(node_value, self.operator, self.value)
        elif self.predicate_type == "degree":
            node_value = graph.degree[node_id]
            result = self._compare_values(node_value, self.operator, self.value)
        elif self.predicate_type == "clustering":
            clustering = nx.clustering(graph, node_id)
            result = self._compare_values(clustering, self.operator, self.value)
        elif self.predicate_type.endswith("_centrality"):
            centrality_type = self.predicate_type.replace("_centrality", "")
            if centrality_type == "betweenness":
                centrality_map = nx.betweenness_centrality(graph)
            elif centrality_type == "closeness":
                centrality_map = nx.closeness_centrality(graph)
            elif centrality_type == "eigenvector":
                centrality_map = nx.eigenvector_centrality(graph)
            else:
                return False, {}

            node_value = centrality_map.get(node_id, 0)
            result = self._compare_values(node_value, self.operator, self.value)
        else:
            # Treat as attribute predicate if not a known topology predicate
            node_value = graph.nodes[node_id].get(self.predicate_type)
            result = self._compare_values(node_value, self.operator, self.value)

        return result, {}

    def _compare_values(
        self, node_value: Any, operator: ComparisonOperator, target_value: Any
    ) -> bool:
        if isinstance(node_value, list) and operator in (
            ComparisonOperator.EQUALS,
            ComparisonOperator.NOT_EQUALS,
        ):
            if operator == ComparisonOperator.EQUALS:
                return target_value in node_value
            else:
                return target_value not in node_value

        if operator == ComparisonOperator.EQUALS:
            return node_value == target_value
        elif operator == ComparisonOperator.NOT_EQUALS:
            return node_value != target_value
        elif operator == ComparisonOperator.GREATER:
            return node_value > target_value
        elif operator == ComparisonOperator.GREATER_EQUAL:
            return node_value >= target_value
        elif operator == ComparisonOperator.LESS:
            return node_value < target_value
        elif operator == ComparisonOperator.LESS_EQUAL:
            return node_value <= target_value
        elif operator == ComparisonOperator.IN:
            if isinstance(node_value, list):
                return target_value in node_value
            else:
                return node_value in target_value
        elif operator == ComparisonOperator.NOT_IN:
            if isinstance(node_value, list):
                return target_value not in node_value
            else:
                return node_value not in target_value
        return False

    def get_free_variables(self) -> set[str]:
        return {self.target}

    def to_string(self) -> str:
        if self.predicate_type.startswith("attr_"):
            attr_name = self.predicate_type[5:]
            if self.operator == ComparisonOperator.EQUALS:
                return f"{attr_name}({self.target}, {self._format_value(self.value)})"
            elif self.operator == ComparisonOperator.NOT_EQUALS:
                return f"¬{attr_name}({self.target}, {self._format_value(self.value)})"
            else:
                return f"{attr_name}({self.target}) {self.operator.value} {self._format_value(self.value)}"
        else:
            return f"{self.predicate_type}({self.target}) {self.operator.value} {self._format_value(self.value)}"

    def _format_value(self, value: Any) -> str:
        if isinstance(value, str):
            return f'"{value}"'
        return str(value)


@dataclass
class CompoundPredicate(FOLPredicateAST):
    connective: LogicalConnective
    operands: list[FOLPredicateAST]

    def evaluate(self, graph: nx.Graph, assignment: dict[str, str]) -> bool:
        result, _ = self.evaluate_with_projection(graph, assignment, None)
        return result

    def evaluate_with_projection(
        self,
        graph: nx.Graph,
        assignment: dict[str, str],
        project_variables: set[str] | None = None,
    ) -> tuple[bool, dict[str, list[str]]]:
        all_projections: dict[str, list[str]] = {}

        if self.connective == LogicalConnective.AND:
            result = True
            for op in self.operands:
                op_result, op_projections = op.evaluate_with_projection(
                    graph, assignment, project_variables
                )
                result = result and op_result
                if not result:
                    break
                for var, nodes in op_projections.items():
                    if var in all_projections:
                        # Use set to avoid duplicates, then convert back to list
                        combined = list(set(all_projections[var] + nodes))
                        all_projections[var] = combined
                    else:
                        all_projections[var] = nodes.copy()

        elif self.connective == LogicalConnective.OR:
            result = False
            for op in self.operands:
                op_result, op_projections = op.evaluate_with_projection(
                    graph, assignment, project_variables
                )
                if op_result:
                    result = True
                    for var, nodes in op_projections.items():
                        if var in all_projections:
                            # Use set to avoid duplicates, then convert back to list
                            combined = list(set(all_projections[var] + nodes))
                            all_projections[var] = combined
                        else:
                            all_projections[var] = nodes.copy()
                    break

        elif self.connective == LogicalConnective.NOT:
            op_result, _ = self.operands[0].evaluate_with_projection(
                graph, assignment, project_variables
            )
            result = not op_result

        else:
            result = False

        return result, all_projections

    def get_free_variables(self) -> set[str]:
        variables = set()
        for operand in self.operands:
            variables.update(operand.get_free_variables())
        return variables

    def to_string(self) -> str:
        if self.connective == LogicalConnective.NOT:
            return f"¬({self.operands[0].to_string()})"

        operator_symbol = "∧" if self.connective == LogicalConnective.AND else "∨"
        operand_strings = [op.to_string() for op in self.operands]
        return f"({operator_symbol.join(operand_strings)})"


@dataclass
class QuantifiedPredicate(FOLPredicateAST):
    quantifier: Quantifier
    variable: Variable
    relation: Relation
    target: str
    constraint: FOLPredicateAST
    k_parameter: int | None = None
    count_parameter: int | None = None

    def evaluate(self, graph: nx.Graph, assignment: dict[str, str]) -> bool:
        result, _ = self.evaluate_with_projection(graph, assignment, None)
        return result

    def evaluate_with_projection(
        self,
        graph: nx.Graph,
        assignment: dict[str, str],
        project_variables: set[str] | None = None,
    ) -> tuple[bool, dict[str, list[str]]]:
        target_node = assignment[self.target]
        projections: dict[str, list[str]] = {}

        if self.relation == Relation.NEIGHBORS:
            related_nodes = list(graph.neighbors(target_node))
        elif self.relation == Relation.K_HOP:
            k = self.k_parameter or 2
            related_nodes = list(self._get_k_hop_neighbors(graph, target_node, k))
        elif self.relation == Relation.CONNECTED_COMPONENTS:
            if graph.is_directed():
                components = list(nx.weakly_connected_components(graph))
            else:
                components = list(nx.connected_components(graph))

            target_component = None
            for component in components:
                if target_node in component:
                    target_component = component
                    break

            related_nodes = list(target_component) if target_component else []
            related_nodes.remove(target_node)
        else:
            return False, {}

        satisfied_nodes = []
        for node in related_nodes:
            new_assignment = assignment.copy()
            new_assignment[self.variable.name] = node

            if self.variable.type_constraint:
                node_type = graph.nodes[node].get("type", "unknown")
                if node_type != self.variable.type_constraint:
                    continue

            constraint_result, constraint_projections = (
                self.constraint.evaluate_with_projection(
                    graph, new_assignment, project_variables
                )
            )

            if constraint_result:
                satisfied_nodes.append(node)

                for var, nodes in constraint_projections.items():
                    if var in projections:
                        projections[var].extend(nodes)
                    else:
                        projections[var] = nodes.copy()

        result = self._check_quantifier_condition(satisfied_nodes, related_nodes)

        if project_variables and self.variable.name in project_variables and result:
            projections[self.variable.name] = satisfied_nodes

        return result, projections

    def _get_k_hop_neighbors(
        self, graph: nx.Graph, start_node: str, k: int
    ) -> set[str]:
        current_level = {start_node}
        all_neighbors = set()

        for _ in range(k):
            next_level = set()
            for node in current_level:
                next_level.update(graph.neighbors(node))
            next_level.discard(start_node)
            all_neighbors.update(next_level)
            current_level = next_level

        return all_neighbors

    def _check_quantifier_condition(
        self, satisfied_nodes: list[str], all_related_nodes: list[str]
    ) -> bool:
        satisfied_count = len(satisfied_nodes)
        total_count = len(all_related_nodes)

        if self.quantifier == Quantifier.FORALL:
            # For GraphBridge: FORALL requires at least one neighbor to exist
            # and ALL of them must satisfy the constraint
            return total_count > 0 and satisfied_count == total_count
        elif self.quantifier == Quantifier.EXISTS:
            return satisfied_count > 0
        elif self.quantifier == Quantifier.EXACTLY:
            return satisfied_count == (self.count_parameter or 0)
        elif self.quantifier == Quantifier.AT_LEAST:
            return satisfied_count >= (self.count_parameter or 0)
        elif self.quantifier == Quantifier.AT_MOST:
            return satisfied_count <= (self.count_parameter or 0)

        return False

    def get_free_variables(self) -> set[str]:
        free_vars = {self.target}
        constraint_vars = self.constraint.get_free_variables()
        constraint_vars.discard(self.variable.name)
        free_vars.update(constraint_vars)
        return free_vars

    def to_string(self) -> str:
        quantifier_symbols = {
            Quantifier.FORALL: "∀",
            Quantifier.EXISTS: "∃",
            Quantifier.EXACTLY: f"EXACTLY({self.count_parameter})",
            Quantifier.AT_LEAST: f"AT_LEAST({self.count_parameter})",
            Quantifier.AT_MOST: f"AT_MOST({self.count_parameter})",
        }

        relation_text = {
            Relation.NEIGHBORS: f"neighbors({self.target})",
            Relation.K_HOP: f"k_hop_neighbors({self.target}, {self.k_parameter})",
            Relation.CONNECTED_COMPONENTS: f"connected_components({self.target})",
        }

        quantifier_str = quantifier_symbols[self.quantifier]
        relation_str = relation_text[self.relation]

        type_constraint = (
            f": {self.variable.type_constraint}"
            if self.variable.type_constraint
            else ""
        )

        return f"{quantifier_str} {self.variable.name}{type_constraint} ∈ {relation_str}: {self.constraint.to_string()}"


class CrossSpacePredicate:
    def __init__(self, ast: FOLPredicateAST, description: str = ""):
        self.ast = ast
        self.description = description

    def evaluate_nodes(self, graph: nx.Graph) -> set[str]:
        result = self.evaluate_nodes_with_projection(graph)
        return result.matching_nodes

    def evaluate_nodes_with_projection(
        self, graph: nx.Graph, project_variables: set[str] | None = None
    ) -> EvaluationResult:
        import time

        start_time = time.time()

        matching_nodes = set()
        projections = []
        free_variables = self.ast.get_free_variables()

        logger.info(
            "🔍 Starting cross-space predicate evaluation",
            extra={
                "predicate_description": self.description,
                "ast_type": type(self.ast).__name__,
                "ast_string": self.ast.to_string(),
                "free_variables": list(free_variables),
                "project_variables": list(project_variables)
                if project_variables
                else None,
                "graph_nodes": graph.number_of_nodes(),
            },
        )

        if len(free_variables) == 1:
            main_variable = list(free_variables)[0]
            total_nodes = graph.number_of_nodes()
            evaluated_count = 0
            matched_count = 0

            logger.debug(
                f"📊 Evaluating {total_nodes} nodes for variable '{main_variable}'"
            )

            for node_id in graph.nodes():
                assignment = {main_variable: str(node_id)}
                try:
                    result, projection_data = self.ast.evaluate_with_projection(
                        graph, assignment, project_variables
                    )

                    evaluated_count += 1

                    if result:
                        matching_nodes.add(str(node_id))
                        matched_count += 1

                        logger.debug(
                            f"✅ Node {node_id} matches predicate",
                            extra={
                                "node_id": str(node_id),
                                "assignment": assignment,
                                "has_projection": bool(projection_data),
                            },
                        )

                        if project_variables and projection_data:
                            projections.append(
                                ProjectionResult(
                                    primary_node=str(node_id),
                                    projected_variables=projection_data,
                                )
                            )
                    else:
                        logger.debug(f"❌ Node {node_id} does not match predicate")

                except Exception as e:
                    logger.warning(
                        f"⚠️ Error evaluating node {node_id}: {e}",
                        extra={"node_id": str(node_id), "error": str(e)},
                    )
                    continue

            evaluation_time = (time.time() - start_time) * 1000
            logger.info(
                "✅ Cross-space predicate evaluation completed",
                extra={
                    "evaluation_time_ms": round(evaluation_time, 2),
                    "nodes_evaluated": evaluated_count,
                    "nodes_matched": matched_count,
                    "match_ratio": round(matched_count / evaluated_count, 3)
                    if evaluated_count > 0
                    else 0,
                    "projections_count": len(projections),
                },
            )

        return EvaluationResult(
            matching_nodes=matching_nodes,
            projections=projections if project_variables else None,
        )

    def to_string(self) -> str:
        return self.ast.to_string()
