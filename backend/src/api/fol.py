from __future__ import annotations

import networkx as nx
from fastapi import APIRouter, Depends

from core.dependencies import get_active_graph
from models import (
    ApplyRequest,
    ApplyResponse,
    AttributePredicate,
    DescribeRequest,
    DescribeResponse,
    InferredAttributePredicateModel,
    InferredTopologyPredicateModel,
    InferSelectionRequest,
    InferSelectionResponse,
    LiftedPredicatesResponse,
    TopologyPredicate,
)
from services.evaluator import (
    PredicateService,
    get_lifted_predicates,
    infer_predicates_from_selection,
)

router = APIRouter(prefix="/api/predicates", tags=["predicates"])


def get_predicate_service() -> PredicateService:
    return PredicateService()


@router.post("/evaluate-fol")
async def evaluate_fol(
    request: dict,
    graph: nx.Graph = Depends(get_active_graph),
    service: PredicateService = Depends(get_predicate_service),
) -> dict:
    expression = request.get("expression", "")
    project_variables = request.get("project_variables")

    result = service.evaluate_expression(graph, expression, project_variables)

    return {
        "matching_nodes": result.matching_nodes,
        "count": len(result.matching_nodes),
        "projections": result.projections,
        "evaluation_time_ms": result.evaluation_time_ms,
        "errors": result.errors,
    }


@router.post("/describe", response_model=DescribeResponse)
async def describe_selection(
    request: DescribeRequest,
    graph: nx.Graph = Depends(get_active_graph),
) -> DescribeResponse:
    if not request.selected_nodes:
        return DescribeResponse(
            selection_size=0,
            total_nodes=graph.number_of_nodes(),
            attribute_predicates=[],
            topology_predicates=[],
        )

    result = infer_predicates_from_selection(
        graph,
        request.selected_nodes,
        request.min_coverage,
        request.min_selectivity,
    )

    attr_preds = [
        AttributePredicate(
            attribute=p["attribute"],
            value=p["value"],
            fol_expression=p["fol_expression"],
            coverage=p["coverage"],
            selectivity=p["selectivity"],
            quality_score=p["quality_score"],
            matching_nodes=p["matching_nodes"],
        )
        for p in result["attribute"]
    ]

    topo_preds = [
        TopologyPredicate(
            metric=p["metric"],
            operator=p["operator"],
            threshold=p["threshold"],
            fol_expression=p["fol_expression"],
            coverage=p["coverage"],
            selectivity=p["selectivity"],
            quality_score=p["quality_score"],
            matching_nodes=p["matching_nodes"],
        )
        for p in result["topology"]
    ]

    return DescribeResponse(
        selection_size=len(request.selected_nodes),
        total_nodes=graph.number_of_nodes(),
        attribute_predicates=attr_preds,
        topology_predicates=topo_preds,
    )


@router.get("/lifted", response_model=LiftedPredicatesResponse)
async def get_lifted(
    graph: nx.Graph = Depends(get_active_graph),
) -> LiftedPredicatesResponse:
    predicates = get_lifted_predicates(graph)
    return LiftedPredicatesResponse(predicates=predicates)


@router.post("/apply", response_model=ApplyResponse)
async def apply_predicates(
    request: ApplyRequest,
    graph: nx.Graph = Depends(get_active_graph),
    service: PredicateService = Depends(get_predicate_service),
) -> ApplyResponse:
    if not request.predicates:
        return ApplyResponse(matching_node_ids=[], count=0)

    expressions: list[str] = []

    for pred in request.predicates:
        attr = pred.get("attribute", "")
        operator = pred.get("operator", "=")
        value = pred.get("value", "")
        is_structural = pred.get("is_structural", False)

        if is_structural:
            if operator in (">=", ">", "<=", "<"):
                expr = f"{attr}(x) {operator} {value}"
            else:
                expr = f"{attr}(x) = {value}"
        else:
            if isinstance(value, str):
                expr = f'{attr}(x) = "{value}"'
            else:
                expr = f"{attr}(x) {operator} {value}"

        expressions.append(expr)

    if request.combine_op == "or":
        full_expr = " ∨ ".join(f"({e})" for e in expressions)
    else:
        full_expr = " ∧ ".join(f"({e})" for e in expressions)

    result = service.evaluate_expression(graph, full_expr)

    matching = result.matching_nodes
    if request.node_type_filter:
        matching = [
            n
            for n in matching
            if graph.nodes[n].get("type") == request.node_type_filter
            or graph.nodes[n].get("node_type") == request.node_type_filter
        ]

    return ApplyResponse(
        matching_node_ids=matching,
        count=len(matching),
    )


@router.post("/infer-selection-predicates", response_model=InferSelectionResponse)
async def infer_selection_predicates(
    request: InferSelectionRequest,
    graph: nx.Graph = Depends(get_active_graph),
) -> InferSelectionResponse:
    if not request.selected_nodes:
        return InferSelectionResponse(
            attribute_predicates=[],
            topology_predicates=[],
            selection_size=0,
            total_predicates=0,
        )

    result = infer_predicates_from_selection(
        graph,
        request.selected_nodes,
        request.min_coverage,
        request.min_selectivity,
    )

    attr_preds = [
        InferredAttributePredicateModel(
            space="attribute",
            attribute=p["attribute"],
            operator="=",
            value=p["value"],
            fol_expression=p["fol_expression"],
            coverage=p["coverage"],
            selectivity=p["selectivity"],
            quality_score=p["quality_score"],
            matching_nodes=p["matching_nodes"],
        )
        for p in result.get("attribute", [])[: request.max_predicates_per_type]
    ]

    topo_preds = [
        InferredTopologyPredicateModel(
            space="topology",
            metric=p["metric"],
            operator=p["operator"],
            threshold=p["threshold"],
            fol_expression=p["fol_expression"],
            coverage=p["coverage"],
            selectivity=p["selectivity"],
            quality_score=p["quality_score"],
            matching_nodes=p["matching_nodes"],
        )
        for p in result.get("topology", [])[: request.max_predicates_per_type]
    ]

    return InferSelectionResponse(
        attribute_predicates=attr_preds,
        topology_predicates=topo_preds,
        selection_size=len(request.selected_nodes),
        total_predicates=len(attr_preds) + len(topo_preds),
    )
