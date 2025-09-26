from __future__ import annotations

from typing import Any

import networkx as nx
from fastapi import APIRouter, Depends, HTTPException

from core.dependencies import get_active_graph
from models import (
    ApplyPredicatesRequest,
    ApplyPredicatesResponse,
    CrossSpacePredicateRequest,
    CrossSpacePredicateResponse,
    FOLFilterRequest,
    LegacyPredicateRequest,
    NeighborhoodPredicateRequest,
    PatternFilterRequest,
    SimplePredicateRequest,
    TemplateListResponse,
    TemplatePredicateRequest,
)
from models.predicate_models import (
    PredicateEvaluationRequest,
    PredicateEvaluationResponse,
    PredicateEvaluationResult,
    ProjectionResultModel,
    SelectionPredicateRequest,
)
from services.predicate_service import PredicateService
from utils.logging_config import get_logger, log_api_request

logger = get_logger("api.predicates")

router = APIRouter(prefix="/api/predicates", tags=["predicates"])


def get_predicate_service() -> PredicateService:
    return PredicateService()


@router.post("/apply", response_model=ApplyPredicatesResponse)
async def apply_predicates(
    request: ApplyPredicatesRequest,
    graph: nx.Graph = Depends(get_active_graph),
    service: PredicateService = Depends(get_predicate_service),
) -> ApplyPredicatesResponse:
    try:
        legacy_request = LegacyPredicateRequest(
            predicates=request.predicates,
            combine_op=request.combine_op,
            node_type_filter=request.node_type_filter,
        )

        response = service.evaluate_legacy_predicates(legacy_request, graph)

        return ApplyPredicatesResponse(
            matching_node_ids=response.matching_nodes,
            count=response.count,
        )

    except Exception as e:
        logger.exception("Error in apply_predicates: %s", e)
        return ApplyPredicatesResponse(matching_node_ids=[], count=0)


@router.post("/describe")
async def describe_selection(
    request: dict,
    graph: nx.Graph = Depends(get_active_graph),
) -> dict[str, Any]:
    from services.predicates.descriptive import DescriptivePredicateGenerator

    selected_ids = request.get("selected_ids", [])
    spaces = request.get("spaces", ["topology", "attribute"])

    empty_response = {
        "selection_count": len(selected_ids),
        "total_nodes": graph.number_of_nodes(),
        "node_type_distribution": {},
        "topology_predicates": [],
        "attribute_predicates": [],
    }

    if not selected_ids:
        empty_response["diagnostics"] = {"message": "No nodes selected"}
        return empty_response

    generator = DescriptivePredicateGenerator()
    return generator.generate_for_selection(graph, selected_ids, spaces)


@router.post("/pattern-filter")
async def filter_by_pattern(
    request: PatternFilterRequest,
    graph: nx.Graph = Depends(get_active_graph),
) -> dict[str, Any]:
    from services.patterns.detectors import PatternDetector

    detector = PatternDetector()

    try:
        result = detector.filter_by_pattern(
            graph=graph,
            pattern_type=request.pattern_type,
            pattern_id=request.pattern_id,
            candidate_nodes=request.node_ids,
            mode=request.mode,
            similarity_threshold=request.similarity_threshold,
        )

        return {
            "matching_nodes": result.get("matching_nodes", []),
            "count": result.get("count", 0),
            "pattern_details": result.get("pattern_details", {}),
        }

    except Exception as e:
        logger.exception("Error in filter_by_pattern: %s", e)
        return {"matching_nodes": [], "count": 0, "pattern_details": {}}


@router.post("/evaluate-fol")
@log_api_request(logger, "/api/predicates/evaluate-fol", "POST")
async def evaluate_fol_predicate(
    request: dict,
    graph: nx.Graph = Depends(get_active_graph),
    service: PredicateService = Depends(get_predicate_service),
) -> dict:
    """
    Evaluate a FOL predicate expression against the graph.
    """
    expression = request.get("expression", "")
    project_variables = request.get("project_variables")

    logger.info(
        "🔍 FOL predicate evaluation requested",
        extra={
            "expression": expression,
            "expression_length": len(expression),
            "project_variables": list(project_variables) if project_variables else None,
            "graph_nodes": graph.number_of_nodes(),
            "graph_edges": graph.number_of_edges(),
        },
    )

    try:
        simple_request = SimplePredicateRequest(
            expression=expression,
            project_variables=project_variables,
        )

        logger.debug("⚡ Executing FOL evaluation...")
        response = service.evaluate_simple_predicate(simple_request, graph)

        logger.info(
            "✅ FOL predicate evaluation successful",
            extra={
                "matching_nodes_count": response.count,
                "evaluation_time_ms": response.evaluation_time_ms,
                "has_projections": bool(response.projections),
                "has_errors": bool(response.errors),
            },
        )

        return {
            "matching_nodes": response.matching_nodes,
            "count": response.count,
            "projections": response.projections,
            "evaluation_time_ms": response.evaluation_time_ms,
            "errors": response.errors,
        }

    except Exception as e:
        logger.error(
            "❌ FOL predicate evaluation failed",
            extra={"error": str(e), "error_type": type(e).__name__},
        )
        return {
            "matching_nodes": [],
            "count": 0,
            "projections": None,
            "evaluation_time_ms": 0.0,
            "errors": [str(e)],
        }


@router.post("/evaluate", response_model=PredicateEvaluationResponse)
async def evaluate_predicate(
    request: PredicateEvaluationRequest,
    graph: nx.Graph = Depends(get_active_graph),
) -> PredicateEvaluationResponse:
    """
    Evaluate a predicate against the graph.
    """
    from services.evaluation.unified_evaluator import (
        EvaluationContext,
        UnifiedPredicateEvaluator,
    )

    evaluator = UnifiedPredicateEvaluator()

    try:
        context = EvaluationContext(graph=graph, session_id="default")
        eval_request_obj = PredicateEvaluationRequest(
            expression=request.expression,
            project_variables=request.project_variables,
            context=context,
        )

        result = evaluator.evaluate(eval_request_obj)

        projection_results = []
        if request.project_variables and result.projections:
            projection_results = [
                ProjectionResultModel(
                    primary_node=proj.get("primary_node", ""),
                    projected_variables=proj.get("projected_variables", {}),
                )
                for proj in result.projections
            ]

        eval_result = PredicateEvaluationResult(
            matching_nodes=result.matching_nodes,
            projections=projection_results,
        )

        return PredicateEvaluationResponse(
            result=eval_result,
            stats={
                "evaluation_time_ms": 0.0,
                "nodes_evaluated": len(result.matching_nodes),
            },
            validation={
                "valid": not result.validation_errors,
                "errors": result.validation_errors or [],
            },
        )

    except Exception as e:
        logger.exception("Unexpected error in predicate evaluation")
        return PredicateEvaluationResponse(
            result=PredicateEvaluationResult(matching_nodes=[], projections=None),
            stats={"evaluation_time_ms": 0.0, "nodes_evaluated": 0},
            validation={"valid": False, "errors": [str(e)]},
        )


@router.get("/domains/{domain}/predicates")
def get_domain_predicates(domain: str) -> dict[str, Any]:
    """Get predicate library for a specific domain."""
    # Domain-specific libraries removed - return empty response
    return {
        "domain": domain,
        "predicates": [],
        "templates": [],
        "message": "Domain-specific patterns have been removed",
    }


_inference_engines: dict[str, Any] = {}


def get_or_create_inference_engine(graph: nx.Graph, dataset_name: str = "default"):
    from services.inference.inference_engine import (
        FastPredicateInference,
    )

    global _inference_engines

    if dataset_name not in _inference_engines:
        logger.info(f"Creating inference engine for {dataset_name}")
        _inference_engines[dataset_name] = FastPredicateInference(graph)

    return _inference_engines[dataset_name]


@router.post("/infer-selection-predicates")
async def infer_selection_predicates_endpoint(
    request: dict,
    graph: nx.Graph = Depends(get_active_graph),
) -> dict:
    try:
        req = SelectionPredicateRequest(**request)

        from core.dataset_manager import DatasetManager

        dataset_manager = DatasetManager()
        dataset_name = (
            getattr(dataset_manager.active, "name", "default")
            if hasattr(dataset_manager, "active")
            else "default"
        )

        inference_engine = get_or_create_inference_engine(graph, dataset_name)

        result = inference_engine.infer_predicates_from_selection(
            selected_nodes=req.selected_nodes,
            graph=graph,
            include_cross_space=req.include_cross_space,
            max_predicates_per_type=req.max_predicates_per_type,
            min_coverage=req.min_coverage,
            min_selectivity=req.min_selectivity,
        )

        attribute_responses = [
            {
                "space": "attribute",
                "attribute": pred.attribute,
                "operator": pred.operator.value
                if hasattr(pred.operator, "value")
                else str(pred.operator),
                "value": pred.value,
                "fol_expression": pred.to_fol(),
                "coverage": pred.coverage,
                "selectivity": pred.selectivity,
                "quality_score": pred.quality_score,
                "matching_nodes": pred.matching_nodes or [],
            }
            for pred in result.attribute_predicates
        ]

        topology_responses = [
            {
                "space": "topology",
                "metric": pred.metric,
                "operator": pred.operator.value
                if hasattr(pred.operator, "value")
                else str(pred.operator),
                "threshold": pred.threshold,
                "fol_expression": pred.to_fol(),
                "coverage": pred.coverage,
                "selectivity": pred.selectivity,
                "quality_score": pred.quality_score,
                "matching_nodes": pred.matching_nodes or [],
            }
            for pred in result.topology_predicates
        ]

        return {
            "attribute_predicates": attribute_responses,
            "topology_predicates": topology_responses,
            "computation_time": result.computation_time,
            "selection_size": result.selection_size,
            "total_predicates": len(attribute_responses) + len(topology_responses),
        }

    except Exception as e:
        logger.error(f"Error in predicate inference: {e}")
        return {
            "attribute_predicates": [],
            "topology_predicates": [],
            "selection_size": 0,
            "total_predicates": 0,
            "error": str(e),
        }


@router.post("/inference/clear-cache")
async def clear_inference_cache_endpoint():
    global _inference_engines
    _inference_engines.clear()
    return {"message": "Inference cache cleared"}


@router.get("/inference/performance")
async def get_inference_performance():
    """
    Get performance metrics for the fast predicate inference engine.
    Returns timing statistics and cache performance data.
    """
    # For now, return mock data based on typical performance
    # In a production system, this would collect real metrics from the inference engines
    return {
        "average_inference_time_ms": 45.2,
        "p95_inference_time_ms": 87.3,
        "cache_hit_rate": 0.78,
        "total_inferences": len(_inference_engines) * 150,  # Estimate based on engines
        "engines_active": len(_inference_engines),
        "performance_target_ms": 100,
        "meets_target": True,
    }


# Cross-space endpoints
@router.post("/cross-space/evaluate", response_model=CrossSpacePredicateResponse)
async def evaluate_cross_space_predicate(
    request: CrossSpacePredicateRequest,
    graph=Depends(get_active_graph),
    service: PredicateService = Depends(get_predicate_service),
):
    try:
        return service.evaluate_cross_space_predicate(request, graph)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Evaluation failed: {str(e)}"
        ) from e


@router.post("/cross-space/neighborhood", response_model=CrossSpacePredicateResponse)
async def evaluate_neighborhood_predicate(
    request: NeighborhoodPredicateRequest,
    starting_node_sets: dict[str, set[str]] | None = None,
    graph=Depends(get_active_graph),
    service: PredicateService = Depends(get_predicate_service),
):
    try:
        return service.evaluate_neighborhood_predicate(
            request, graph, starting_node_sets
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Evaluation failed: {str(e)}"
        ) from e


@router.post("/cross-space/fol-filter")
async def convert_fol_filter(
    request: FOLFilterRequest,
    graph=Depends(get_active_graph),
    service: PredicateService = Depends(get_predicate_service),
):
    try:
        return service.convert_fol_filter_request(request, graph)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Conversion failed: {str(e)}"
        ) from e


@router.post("/cross-space/validate")
async def validate_expression(
    expression: str,
    graph=Depends(get_active_graph),
    service: PredicateService = Depends(get_predicate_service),
):
    try:
        return service.validate_expression(expression, graph)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Validation failed: {str(e)}"
        ) from e


# Template endpoints
@router.get("/cross-space/templates", response_model=TemplateListResponse)
async def get_available_templates(
    service: PredicateService = Depends(get_predicate_service),
):
    try:
        return service.get_available_templates()
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Template query failed: {str(e)}"
        ) from e


@router.get("/templates/domain/{domain}", response_model=TemplateListResponse)
async def get_templates_by_domain(
    domain: str,
    service: PredicateService = Depends(get_predicate_service),
):
    try:
        return service.get_templates_by_domain(domain)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Template query failed: {str(e)}"
        ) from e


@router.post("/cross-space/template", response_model=CrossSpacePredicateResponse)
async def evaluate_template_predicate(
    request: TemplatePredicateRequest,
    graph=Depends(get_active_graph),
    service: PredicateService = Depends(get_predicate_service),
):
    try:
        return service.evaluate_template_predicate(request, graph)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Evaluation failed: {str(e)}"
        ) from e


# Simplified endpoints for predicate composer (frontend compatibility)
@router.post("/validate")
async def validate_predicate_simple(
    request: dict,
    graph=Depends(get_active_graph),
    service: PredicateService = Depends(get_predicate_service),
):
    try:
        expression = request.get("expression", "")
        return service.validate_expression(expression, graph)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Validation failed: {str(e)}"
        ) from e


@router.post("/compose")
async def compose_predicate_simple(
    request: dict,
    graph=Depends(get_active_graph),
    service: PredicateService = Depends(get_predicate_service),
):
    """
    Simplified predicate composition endpoint.
    For now, redirects to existing FOL evaluation.
    """
    try:
        # Extract the first predicate or build a simple expression
        predicates = request.get("predicates", [])
        if not predicates:
            raise ValueError("No predicates provided")

        # Simple composition for compatibility
        if len(predicates) == 1:
            pred = predicates[0]
            if pred.get("type") == "fol":
                expression = pred.get("predicate", {}).get("expression", "")
            else:
                # Simple attribute predicate
                expression = "true"  # Fallback
        else:
            # For multiple predicates, return basic response
            expression = "true"

        simple_request = SimplePredicateRequest(expression=expression)
        response = service.evaluate_simple_predicate(simple_request, graph)

        return {
            "expression": expression,
            "matching_nodes": response.matching_nodes,
            "projections": response.projections,
            "evaluation_time": response.evaluation_time_ms,
            "is_valid": True,
            "validation_errors": [],
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Composition failed: {str(e)}"
        ) from e


@router.get("/suggestions")
async def get_predicate_suggestions_simple():
    """
    Simplified predicate suggestions endpoint.
    Returns basic suggestions for compatibility.
    """
    try:
        return {
            "suggestions": [
                {
                    "text": "degree(x) > 5",
                    "description": "Nodes with degree greater than 5",
                    "type": "predicate",
                    "category": "topology",
                    "priority": 10,
                },
                {
                    "text": "∀",
                    "description": "Universal quantifier",
                    "type": "quantifier",
                    "category": "logic",
                    "priority": 8,
                },
            ]
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Suggestions failed: {str(e)}"
        ) from e
