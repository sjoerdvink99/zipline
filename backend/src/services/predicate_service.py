from __future__ import annotations

import time
from typing import Any

import networkx as nx

from models import (
    CrossSpacePredicateRequest,
    CrossSpacePredicateResponse,
    FOLFilterRequest,
    LegacyPredicateRequest,
    NeighborhoodPredicateRequest,
    ProjectionResultResponse,
    SimplePredicateRequest,
    SimplePredicateResponse,
    TemplateListResponse,
    TemplatePredicateRequest,
)
from models.predicate_models import CrossSpaceFilterResult
from services.compiler.fol_parser import FOLPredicateParser, TemplatePredicateBuilder
from services.evaluation.fol_evaluator import EvaluationStats, FOLPredicateEvaluator
from services.evaluation.unified_evaluator import (
    EvaluationContext,
    PredicateEvaluationRequest,
    UnifiedPredicateEvaluator,
)
from utils.logging_config import get_logger

logger = get_logger("predicates.service")


class PredicateService:
    def __init__(self):
        self.parser = FOLPredicateParser()
        self.evaluator = FOLPredicateEvaluator()
        self.unified_evaluator = UnifiedPredicateEvaluator()
        self.template_builder = TemplatePredicateBuilder()

    def evaluate_simple_predicate(
        self, request: SimplePredicateRequest, graph: nx.Graph
    ) -> SimplePredicateResponse:
        start_time = time.time()

        logger.info(
            "📝 Simple predicate evaluation request",
            extra={
                "expression": request.expression,
                "expression_length": len(request.expression),
                "project_variables": list(request.project_variables)
                if request.project_variables
                else None,
                "graph_nodes": graph.number_of_nodes(),
                "graph_edges": graph.number_of_edges(),
            },
        )

        context = EvaluationContext(graph=graph, session_id="default")
        eval_request = PredicateEvaluationRequest(
            expression=request.expression,
            project_variables=request.project_variables,
            context=context,
        )

        logger.debug("🔧 Calling unified evaluator")
        response = self.unified_evaluator.evaluate(eval_request)
        evaluation_time_ms = (time.time() - start_time) * 1000

        logger.info(
            "✅ Simple predicate evaluation completed",
            extra={
                "evaluation_time_ms": round(evaluation_time_ms, 2),
                "matching_nodes_count": response.count,
                "has_projections": bool(response.projections),
                "has_validation_errors": bool(response.validation_errors),
            },
        )

        return SimplePredicateResponse(
            matching_nodes=response.matching_nodes,
            count=response.count,
            projections=response.projections,
            evaluation_time_ms=evaluation_time_ms,
            errors=response.validation_errors,
        )

    def evaluate_cross_space_predicate(
        self, request: CrossSpacePredicateRequest, graph: nx.Graph
    ) -> CrossSpacePredicateResponse:
        validation_result = self.evaluator.validate_expression(
            request.expression, graph
        )

        if not validation_result["valid"]:
            return CrossSpacePredicateResponse(
                id="invalid",
                expression=request.expression,
                description="Invalid expression",
                matching_nodes=[],
                projections=None,
                evaluation_stats={},
                validation_result=validation_result,
            )

        project_variables = (
            set(request.project_variables) if request.project_variables else None
        )
        evaluation_result, stats = self.evaluator.evaluate_expression(
            request.expression, graph, project_variables
        )

        projections = None
        if evaluation_result.projections:
            projections = [
                ProjectionResultResponse(
                    primary_node=proj.primary_node,
                    projected_variables=proj.projected_variables,
                )
                for proj in evaluation_result.projections
            ]

        return CrossSpacePredicateResponse(
            id=f"fol_{hash(request.expression)}",
            expression=request.expression,
            description=request.description or f"Cross-space: {request.expression}",
            matching_nodes=list(evaluation_result.matching_nodes),
            projections=projections,
            evaluation_stats={
                "total_evaluated": stats.total_nodes_evaluated,
                "cache_hits": stats.cache_hits,
                "cache_misses": stats.cache_misses,
                "evaluation_time_ms": stats.evaluation_time_ms,
                "nodes_matched": stats.nodes_matched,
            },
            validation_result=validation_result,
        )

    def evaluate_template_predicate(
        self, request: TemplatePredicateRequest, graph: nx.Graph
    ) -> CrossSpacePredicateResponse:
        predicate = self.template_builder.build_predicate(
            request.template_key, self.parser
        )

        if not predicate:
            return CrossSpacePredicateResponse(
                id="template_not_found",
                expression="",
                description="Template not found",
                matching_nodes=[],
                projections=None,
                evaluation_stats={},
                validation_result={"valid": False, "errors": ["Template not found"]},
            )

        matching_nodes, stats = self.evaluator.evaluate_predicate(predicate, graph)

        template_info = self.template_builder.get_all_templates().get(
            request.template_key, {}
        )

        return CrossSpacePredicateResponse(
            id=f"template_{request.template_key}",
            expression=predicate.ast.to_string(),
            description=template_info.get("description", predicate.description),
            matching_nodes=list(matching_nodes),
            projections=None,
            evaluation_stats={
                "total_evaluated": stats.total_nodes_evaluated,
                "cache_hits": stats.cache_hits,
                "cache_misses": stats.cache_misses,
                "evaluation_time_ms": stats.evaluation_time_ms,
                "nodes_matched": stats.nodes_matched,
            },
            validation_result={"valid": True, "errors": [], "warnings": []},
        )

    def evaluate_neighborhood_predicate(
        self,
        request: NeighborhoodPredicateRequest,
        graph: nx.Graph,
        starting_node_sets: dict[str, set[str]] | None = None,
    ) -> CrossSpacePredicateResponse:
        if not request.starting_filters:
            return CrossSpacePredicateResponse(
                id="invalid_neighborhood",
                expression="",
                description="Neighborhood constraint requires starting filters",
                matching_nodes=[],
                projections=None,
                evaluation_stats={},
                validation_result={
                    "valid": False,
                    "errors": ["No starting filters specified"],
                },
            )

        if starting_node_sets is None:
            starting_node_sets = {}

        starting_nodes = set()
        for filter_id in request.starting_filters:
            if filter_id in starting_node_sets:
                starting_nodes.update(starting_node_sets[filter_id])

        if not starting_nodes:
            return CrossSpacePredicateResponse(
                id="empty_starting_set",
                expression="",
                description="No nodes match the selected starting filters",
                matching_nodes=[],
                projections=None,
                evaluation_stats={},
                validation_result={
                    "valid": True,
                    "errors": [],
                    "warnings": ["Empty starting set"],
                },
            )

        matching_nodes = self._evaluate_neighborhood_constraint_on_nodes(
            starting_nodes, request, graph
        )

        neighborhood_expr = self._build_neighborhood_predicate_expression(request)
        starting_filters_expr = " ∨ ".join(
            [f"filter_{fid}" for fid in request.starting_filters]
        )
        full_expression = f"({starting_filters_expr}) ∧ {neighborhood_expr}"

        return CrossSpacePredicateResponse(
            id=f"neighborhood_{hash(full_expression)}",
            expression=full_expression,
            description=f"Neighborhood: {request.quantifier} {request.relation} (from {len(request.starting_filters)} starting filters)",
            matching_nodes=list(matching_nodes),
            projections=None,
            evaluation_stats={
                "total_evaluated": len(starting_nodes),
                "cache_hits": 0,
                "cache_misses": 0,
                "evaluation_time_ms": 0,
                "nodes_matched": len(matching_nodes),
            },
            validation_result={"valid": True, "errors": [], "warnings": []},
        )

    def get_available_templates(self) -> TemplateListResponse:
        templates = self.template_builder.get_all_templates()
        domains = list(
            {template.get("domain", "general") for template in templates.values()}
        )
        return TemplateListResponse(templates=templates, domains=domains)

    def get_templates_by_domain(self, domain: str) -> TemplateListResponse:
        templates = self.template_builder.get_templates_by_domain(domain)
        return TemplateListResponse(templates=templates, domains=[domain])

    def validate_expression(self, expression: str, graph: nx.Graph) -> dict[str, Any]:
        return self.evaluator.validate_expression(expression, graph)

    def convert_legacy_to_fol(self, request: LegacyPredicateRequest) -> str:
        expressions = []

        for pred_dict in request.predicates:
            if pred_dict.get("type") == "fol":
                expressions.append(pred_dict.get("expression", ""))
                continue

            attribute = pred_dict.get("attribute", "")
            operator = pred_dict.get("operator", "")
            value = pred_dict.get("value", "")
            is_structural = pred_dict.get("is_structural", False)

            if is_structural:
                expr = f"{attribute}(x) {operator} {value}"
            else:
                if isinstance(value, str):
                    expr = f'x.{attribute} {operator} "{value}"'
                else:
                    expr = f"x.{attribute} {operator} {value}"

            expressions.append(expr)

        if request.combine_op == "and":
            return " ∧ ".join(expressions) if expressions else "true"
        else:
            return " ∨ ".join(expressions) if expressions else "false"

    def evaluate_legacy_predicates(
        self, request: LegacyPredicateRequest, graph: nx.Graph
    ) -> SimplePredicateResponse:
        try:
            fol_expression = self.convert_legacy_to_fol(request)

            simple_request = SimplePredicateRequest(
                expression=fol_expression,
            )

            return self.evaluate_simple_predicate(simple_request, graph)

        except Exception as e:
            return SimplePredicateResponse(
                matching_nodes=[],
                count=0,
                projections=None,
                evaluation_time_ms=0.0,
                errors=[f"Legacy conversion failed: {e}"],
            )

    def convert_fol_filter_request(
        self, request: FOLFilterRequest, graph: nx.Graph
    ) -> CrossSpaceFilterResult:
        if request.expression:
            response = self.evaluate_cross_space_predicate(
                CrossSpacePredicateRequest(expression=request.expression), graph
            )
        elif request.template_key:
            response = self.evaluate_template_predicate(
                TemplatePredicateRequest(template_key=request.template_key), graph
            )
        elif request.neighborhood_config:
            response = self.evaluate_neighborhood_predicate(
                request.neighborhood_config, graph
            )
        else:
            return CrossSpaceFilterResult(
                matching_nodes=set(),
                expression="",
                description="Invalid FOL request",
                stats=EvaluationStats(),
                validation_result={
                    "valid": False,
                    "errors": ["No valid FOL configuration"],
                },
            )

        return CrossSpaceFilterResult(
            matching_nodes=set(response.matching_nodes),
            expression=response.expression,
            description=response.description,
            stats=EvaluationStats(
                total_nodes_evaluated=response.evaluation_stats.get(
                    "total_evaluated", 0
                ),
                cache_hits=response.evaluation_stats.get("cache_hits", 0),
                cache_misses=response.evaluation_stats.get("cache_misses", 0),
                evaluation_time_ms=response.evaluation_stats.get(
                    "evaluation_time_ms", 0
                ),
                nodes_matched=response.evaluation_stats.get("nodes_matched", 0),
            ),
            validation_result=response.validation_result,
        )

    def _build_neighborhood_predicate_expression(
        self, request: NeighborhoodPredicateRequest
    ) -> str:
        quantifier_map = {
            "ALL": "forall",
            "SOME": "exists",
            "EXACTLY": f"EXACTLY({request.quantifier_count or 0})",
            "AT_LEAST": f"AT_LEAST({request.quantifier_count or 0})",
            "AT_MOST": f"AT_MOST({request.quantifier_count or 0})",
        }

        quantifier_str = quantifier_map.get(request.quantifier, "forall")

        relation_map = {
            "neighbors": f"neighbors({request.target_variable})",
            "k_hop": f"k_hop_neighbors({request.target_variable}, {request.k_parameter or 2})",
            "connected_components": f"connected_components({request.target_variable})",
        }

        relation_str = relation_map.get(
            request.relation, f"neighbors({request.target_variable})"
        )

        constraint = self._build_constraint_from_predicate(request.constraint_predicate)

        return f"{quantifier_str} y ∈ {relation_str}: {constraint}"

    def _build_constraint_from_predicate(self, predicate_dict: dict[str, Any]) -> str:
        if predicate_dict["type"] == "attribute":
            attr = predicate_dict["attribute"]
            op = predicate_dict["operator"]
            value = predicate_dict["value"]

            if isinstance(value, str):
                value = f"'{value}'"
            elif isinstance(value, list):
                value = str(value)

            return f"y.{attr} {op} {value}"

        elif predicate_dict["type"] == "topology":
            attr = predicate_dict["attribute"]
            op = predicate_dict["operator"]
            value = predicate_dict["value"]

            return f"{attr}(y) {op} {value}"

        return "true"

    def _evaluate_neighborhood_constraint_on_nodes(
        self,
        starting_nodes: set[str],
        request: NeighborhoodPredicateRequest,
        graph: nx.Graph,
    ) -> set[str]:
        matching_nodes = set()

        for node in starting_nodes:
            if self._evaluate_neighborhood_for_node(node, request, graph):
                matching_nodes.add(node)

        return matching_nodes

    def _evaluate_neighborhood_for_node(
        self, node: str, request: NeighborhoodPredicateRequest, graph: nx.Graph
    ) -> bool:
        if node not in graph.nodes():
            return False

        neighbors = self._get_neighborhood(
            node, request.relation, request.k_parameter, graph
        )
        if not neighbors:
            return request.quantifier in ["ALL", "AT_MOST"]

        satisfied_neighbors = []
        for neighbor in neighbors:
            if self._evaluate_constraint_on_node(
                neighbor, request.constraint_predicate, graph
            ):
                satisfied_neighbors.append(neighbor)

        return self._check_quantifier_condition(
            request.quantifier,
            request.quantifier_count,
            len(satisfied_neighbors),
            len(neighbors),
        )

    def _get_neighborhood(
        self, node: str, relation: str, k_parameter: int | None, graph: nx.Graph
    ) -> list[str]:
        if relation == "neighbors":
            return list(graph.neighbors(node))
        elif relation == "k_hop" and k_parameter:
            visited = set()
            current_level = {node}
            for _ in range(k_parameter):
                next_level = set()
                for n in current_level:
                    for neighbor in graph.neighbors(n):
                        if neighbor not in visited and neighbor != node:
                            next_level.add(neighbor)
                            visited.add(neighbor)
                current_level = next_level
            return list(visited)
        elif relation == "connected_components":
            component = nx.node_connected_component(graph, node)
            return [n for n in component if n != node]
        else:
            return []

    def _evaluate_constraint_on_node(
        self, node: str, constraint_predicate: dict[str, Any], graph: nx.Graph
    ) -> bool:
        node_data = graph.nodes[node]

        if constraint_predicate["type"] == "attribute":
            attr = constraint_predicate["attribute"]
            op = constraint_predicate["operator"]
            value = constraint_predicate["value"]

            if attr not in node_data:
                return False

            node_value = node_data[attr]

            if op == "=":
                return node_value == value
            elif op == "!=":
                return node_value != value
            elif op == ">":
                return float(node_value) > float(value)
            elif op == ">=":
                return float(node_value) >= float(value)
            elif op == "<":
                return float(node_value) < float(value)
            elif op == "<=":
                return float(node_value) <= float(value)
            elif op == "in":
                return node_value in value
            else:
                return False

        elif constraint_predicate["type"] == "topology":
            attr = constraint_predicate["attribute"]
            op = constraint_predicate["operator"]
            value = float(constraint_predicate["value"])

            if attr == "degree":
                node_value = float(graph.degree(node))
            else:
                return False

            if op == "=":
                return node_value == value
            elif op == ">":
                return node_value > value
            elif op == ">=":
                return node_value >= value
            elif op == "<":
                return node_value < value
            elif op == "<=":
                return node_value <= value
            else:
                return False

        return False

    def _check_quantifier_condition(
        self,
        quantifier: str,
        quantifier_count: int | None,
        satisfied_count: int,
        total_count: int,
    ) -> bool:
        if quantifier == "ALL":
            return satisfied_count == total_count
        elif quantifier == "SOME":
            return satisfied_count > 0
        elif quantifier == "EXACTLY" and quantifier_count is not None:
            return satisfied_count == quantifier_count
        elif quantifier == "AT_LEAST" and quantifier_count is not None:
            return satisfied_count >= quantifier_count
        elif quantifier == "AT_MOST" and quantifier_count is not None:
            return satisfied_count <= quantifier_count
        else:
            return False
