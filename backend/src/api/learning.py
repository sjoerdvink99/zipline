from __future__ import annotations

import logging

import networkx as nx
from fastapi import APIRouter, Depends

from core.dependencies import get_active_graph
from fol.learning.learner import ExplanationLearner
from models.learning_schemas import (
    ContrastiveExplanationRequest,
    DisjunctiveExplanationRequest,
    DisjunctiveExplanationResponse,
    ExplanationRequest,
    ExplanationResponse,
    ExplanatoryClauseModel,
    LearnedPredicateModel,
    LearnPredicateRequest,
    LearnPredicateResponse,
    LiteralModel,
)
from utils.node_validation import validate_and_map_node_ids

router = APIRouter(prefix="/api/predicates/learn", tags=["learning"])

logger = logging.getLogger(__name__)


@router.post("", response_model=LearnPredicateResponse)
async def learn_predicate_compatibility(
    request: LearnPredicateRequest,
    graph: nx.Graph = Depends(get_active_graph),
) -> LearnPredicateResponse:
    if not request.selected_nodes:
        return LearnPredicateResponse(
            predicates=[],
            best_predicate=None,
            learning_time_ms=0.0,
            selection_size=0,
            total_nodes=graph.number_of_nodes(),
        )

    validation = validate_and_map_node_ids(graph, request.selected_nodes, "learning")
    selected_nodes = validation.valid_nodes
    if validation.had_mappings:
        logger.info(f"Applied node ID mapping: {validation.mapping_count} mappings")

    learner = ExplanationLearner(
        beam_width=request.beam_width or 8,
        max_clause_len=request.max_depth or 4,
        top_k=request.max_predicates or 5,
        use_slow_metrics=False,
    )

    result = learner.learn_explanations(
        graph, selected_nodes, contrast_nodes=request.negative_nodes
    )

    predicates = []
    for clause in result.clauses:
        predicates.append(
            LearnedPredicateModel(
                fol_expression=clause.fol_expression,
                display_expression=clause.fol_expression.replace(
                    " ∧ ", " and "
                ).replace("=", " = "),
                p=clause.p,
                n=clause.n,
                coverage=clause.coverage,
                precision=clause.pi_clause,
                quality_score=clause.score,
                complexity=len(clause.literals),
                matching_nodes=clause.matching_nodes,
                literals=[
                    LiteralModel(
                        type=lit["type"],
                        attribute=lit["attribute"],
                        operator=lit["operator"],
                        value=lit["value"],
                        score=lit["score"],
                        coverage=lit["coverage"],
                        precision=clause.pi_clause,
                    )
                    for lit in clause.literals
                ],
                clauses=[
                    [
                        LiteralModel(
                            type=lit["type"],
                            attribute=lit["attribute"],
                            operator=lit["operator"],
                            value=lit["value"],
                            score=lit["score"],
                            coverage=lit["coverage"],
                            precision=clause.pi_clause,
                        )
                        for lit in clause.literals
                    ]
                ],
                is_disjunction=False,
            )
        )

    best_predicate = predicates[0] if predicates else None

    return LearnPredicateResponse(
        predicates=predicates,
        best_predicate=best_predicate,
        learning_time_ms=result.learning_time_ms,
        selection_size=result.selection_size,
        total_nodes=result.total_nodes,
    )


@router.post("/explanations", response_model=ExplanationResponse)
async def learn_explanations(
    request: ExplanationRequest,
    graph: nx.Graph = Depends(get_active_graph),
) -> ExplanationResponse:
    if not request.selected_nodes:
        return ExplanationResponse(
            clauses=[],
            learning_time_ms=0.0,
            selection_size=0,
            total_nodes=graph.number_of_nodes(),
        )

    learner = ExplanationLearner(
        beam_width=request.beam_width,
        max_clause_len=request.max_clause_len,
        top_k=request.top_k,
        min_improvement=request.min_improvement,
        max_evaluations=request.max_evaluations,
        use_slow_metrics=request.use_slow_metrics,
    )

    result = learner.learn_explanations(
        graph, request.selected_nodes, contrast_nodes=request.contrast_nodes
    )

    clauses = [
        ExplanatoryClauseModel(
            fol_expression=c.fol_expression,
            p=c.p,
            n=c.n,
            support=c.support,
            pi=c.pi,
            pi_clause=c.pi_clause,
            score=c.score,
            coverage=c.coverage,
            matching_nodes=c.matching_nodes,
            literals=[
                LiteralModel(
                    type=lit["type"],
                    attribute=lit["attribute"],
                    operator=lit["operator"],
                    value=lit["value"],
                    score=lit["score"],
                    coverage=lit["coverage"],
                )
                for lit in c.literals
            ],
        )
        for c in result.clauses
    ]

    return ExplanationResponse(
        clauses=clauses,
        learning_time_ms=result.learning_time_ms,
        selection_size=result.selection_size,
        total_nodes=result.total_nodes,
        contrast_size=result.contrast_size,
    )


@router.post("/quick")
async def quick_learn_explanations(
    request: dict,
    graph: nx.Graph = Depends(get_active_graph),
) -> dict:
    selected_nodes = request.get("selected_nodes", [])
    if not selected_nodes:
        return {
            "predicates": [],
            "best_predicate": None,
            "learning_time_ms": 0.0,
            "selection_size": 0,
            "total_nodes": graph.number_of_nodes(),
        }

    validation_result = validate_and_map_node_ids(graph, selected_nodes, "learning")
    selected_nodes = validation_result.valid_nodes

    if validation_result.had_mappings:
        logger.info(
            f"Learning: applied {validation_result.mapping_count} node ID mappings"
        )

    if not selected_nodes and validation_result.invalid_nodes:
        logger.error(
            f"Learning: no valid nodes found from {len(validation_result.invalid_nodes)} provided"
        )

    contrast_nodes = (
        request.get("contrast_nodes") or request.get("negative_nodes") or None
    )

    learner = ExplanationLearner(
        beam_width=5,
        max_clause_len=4,
        top_k=5,
        use_slow_metrics=False,
    )

    result = learner.learn_explanations(
        graph, selected_nodes, contrast_nodes=contrast_nodes
    )

    predicates_data = []
    for clause in result.clauses:
        predicate_data = {
            "fol_expression": clause.fol_expression,
            "display_expression": clause.fol_expression.replace(" ∧ ", " and ").replace(
                "=", " = "
            ),
            "p": clause.p,
            "n": clause.n,
            "coverage": clause.coverage,
            "precision": clause.pi_clause,
            "quality_score": clause.score,
            "complexity": len(clause.literals),
            "matching_nodes": clause.matching_nodes,
            "literals": clause.literals,
            "clauses": [clause.literals],
            "is_disjunction": False,
        }
        predicates_data.append(predicate_data)

    response = {
        "predicates": predicates_data,
        "best_predicate": predicates_data[0] if predicates_data else None,
        "learning_time_ms": result.learning_time_ms,
        "selection_size": result.selection_size,
        "total_nodes": result.total_nodes,
    }
    if result.contrast_size is not None:
        response["contrast_size"] = result.contrast_size

    return response


@router.post("/contrastive", response_model=ExplanationResponse)
async def learn_contrastive_explanations(
    request: ContrastiveExplanationRequest,
    graph: nx.Graph = Depends(get_active_graph),
) -> ExplanationResponse:
    if not request.positive_nodes or not request.negative_nodes:
        return ExplanationResponse(
            clauses=[],
            learning_time_ms=0.0,
            selection_size=0,
            total_nodes=graph.number_of_nodes(),
            contrast_size=0,
        )

    learner = ExplanationLearner(
        beam_width=request.beam_width,
        max_clause_len=request.max_clause_len,
        top_k=request.top_k,
        min_improvement=request.min_improvement,
        max_evaluations=request.max_evaluations,
        use_slow_metrics=request.use_slow_metrics,
    )

    result = learner.learn_explanations(
        graph,
        request.positive_nodes,
        contrast_nodes=request.negative_nodes,
    )

    clauses = [
        ExplanatoryClauseModel(
            fol_expression=c.fol_expression,
            p=c.p,
            n=c.n,
            support=c.support,
            pi=c.pi,
            pi_clause=c.pi_clause,
            score=c.score,
            coverage=c.coverage,
            matching_nodes=c.matching_nodes,
            literals=[
                LiteralModel(
                    type=lit["type"],
                    attribute=lit["attribute"],
                    operator=lit["operator"],
                    value=lit["value"],
                    score=lit["score"],
                    coverage=lit["coverage"],
                )
                for lit in c.literals
            ],
        )
        for c in result.clauses
    ]

    return ExplanationResponse(
        clauses=clauses,
        learning_time_ms=result.learning_time_ms,
        selection_size=result.selection_size,
        total_nodes=result.total_nodes,
        contrast_size=result.contrast_size,
    )


@router.post("/disjunctive", response_model=DisjunctiveExplanationResponse)
async def learn_disjunctive_explanations(
    request: DisjunctiveExplanationRequest,
    graph: nx.Graph = Depends(get_active_graph),
) -> DisjunctiveExplanationResponse:
    if not request.selected_nodes:
        return DisjunctiveExplanationResponse(
            predicate_type="disjunction",
            clauses=[],
            combined_expression="⊥",
            total_coverage=0.0,
            global_enrichment=0.0,
            learning_time_ms=0.0,
            selection_size=0,
            total_nodes=graph.number_of_nodes(),
        )

    learner = ExplanationLearner(
        beam_width=request.beam_width,
        max_clause_len=request.max_clause_len,
        min_improvement=request.min_improvement,
        max_evaluations=request.max_evaluations,
        use_slow_metrics=request.use_slow_metrics,
    )

    result = learner.learn_disjunctive_predicate(
        graph=graph,
        selected_nodes=request.selected_nodes,
        max_clauses=request.max_clauses,
        min_remaining_positive_fraction=request.min_remaining_positive_fraction,
        contrast_nodes=request.contrast_nodes,
    )

    clauses = [
        ExplanatoryClauseModel(
            fol_expression=c.fol_expression,
            p=c.p,
            n=c.n,
            support=c.support,
            pi=c.pi,
            pi_clause=c.pi_clause,
            score=c.score,
            coverage=c.coverage,
            matching_nodes=c.matching_nodes,
            literals=[
                LiteralModel(
                    type=lit["type"],
                    attribute=lit["attribute"],
                    operator=lit["operator"],
                    value=lit["value"],
                    score=lit["score"],
                    coverage=lit["coverage"],
                )
                for lit in c.literals
            ],
        )
        for c in result.clauses
    ]

    return DisjunctiveExplanationResponse(
        predicate_type=result.predicate_type,
        clauses=clauses,
        combined_expression=result.combined_expression,
        total_coverage=result.total_coverage,
        global_enrichment=result.global_enrichment,
        learning_time_ms=result.learning_time_ms,
        selection_size=result.selection_size,
        total_nodes=result.total_nodes,
        marginal_gains=result.marginal_gains,
        contrast_size=result.contrast_size,
    )
