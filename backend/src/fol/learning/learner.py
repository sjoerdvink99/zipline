from __future__ import annotations

import logging
import math
import time
from dataclasses import dataclass, field
from typing import Any

import networkx as nx

from fol.learning.beam_search import BeamSearch, Clause
from fol.learning.literal_generator import Literal, LiteralGenerator
from fol.learning.scoring import EnrichmentScorer
from fol.schema import get_edge_schema

logger = logging.getLogger(__name__)


@dataclass
class ExplanatoryClause:
    fol_expression: str
    p: int
    n: int
    support: int
    pi: float
    pi_clause: float
    score: float
    coverage: float
    matching_nodes: list[str]
    literals: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "fol_expression": self.fol_expression,
            "p": self.p,
            "n": self.n,
            "support": self.support,
            "pi": self.pi,
            "pi_clause": self.pi_clause,
            "score": self.score,
            "coverage": self.coverage,
            "matching_nodes": self.matching_nodes,
            "literals": self.literals,
        }


@dataclass
class ExplanationResult:
    clauses: list[ExplanatoryClause]
    learning_time_ms: float
    selection_size: int
    total_nodes: int
    contrast_size: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "clauses": [c.to_dict() for c in self.clauses],
            "learning_time_ms": self.learning_time_ms,
            "selection_size": self.selection_size,
            "total_nodes": self.total_nodes,
            "contrast_size": self.contrast_size,
        }


@dataclass
class DisjunctiveExplanationResult:
    predicate_type: str
    clauses: list[ExplanatoryClause]
    combined_expression: str
    total_coverage: float
    global_enrichment: float
    learning_time_ms: float
    selection_size: int
    total_nodes: int
    marginal_gains: list[float] = field(default_factory=list)
    contrast_size: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "predicate_type": self.predicate_type,
            "clauses": [c.to_dict() for c in self.clauses],
            "combined_expression": self.combined_expression,
            "total_coverage": self.total_coverage,
            "global_enrichment": self.global_enrichment,
            "learning_time_ms": self.learning_time_ms,
            "selection_size": self.selection_size,
            "total_nodes": self.total_nodes,
            "marginal_gains": self.marginal_gains,
            "contrast_size": self.contrast_size,
        }


class ExplanationLearner:
    def __init__(
        self,
        beam_width: int = 8,
        max_clause_len: int = 4,
        top_k: int = 5,
        min_improvement: float = 1e-6,
        max_evaluations: int = 15000,
        use_slow_metrics: bool = False,
    ):
        self.beam_width = beam_width
        self.max_clause_len = max_clause_len
        self.top_k = top_k
        self.min_improvement = min_improvement
        self.max_evaluations = max_evaluations
        self.use_slow_metrics = use_slow_metrics

    def learn_explanations(
        self,
        graph: nx.Graph,
        selected_nodes: list[str],
        contrast_nodes: list[str] | None = None,
    ) -> ExplanationResult:
        logger.info(
            f"Starting explanation learning for {len(selected_nodes)} selected nodes"
        )
        start_time = time.time()

        valid_selected = [n for n in selected_nodes if n in graph.nodes()]
        if not valid_selected:
            logger.warning("No valid selected nodes found in graph")
            return ExplanationResult(
                clauses=[],
                learning_time_ms=0.0,
                selection_size=0,
                total_nodes=len(graph.nodes()),
            )

        selected_set = set(valid_selected)
        full_graph_nodes = len(graph.nodes())
        P = len(selected_set)

        contrast_set: set[str] = set()
        contrast_universe: frozenset[str] | None = None
        if contrast_nodes is not None:
            valid_contrast = [n for n in contrast_nodes if n in graph.nodes()]
            contrast_set = set(valid_contrast)
            contrast_universe = frozenset(selected_set | contrast_set)
            logger.info(
                f"Contrastive mode: {P} positive nodes vs {len(contrast_set)} contrast nodes (universe={len(contrast_universe)})"
            )

        effective_total = (
            len(contrast_universe)
            if contrast_universe is not None
            else full_graph_nodes
        )

        logger.info(
            f"Learning setup: {P} selected nodes, {effective_total} effective total nodes (π={P / effective_total:.4f})"
        )

        if P == effective_total:
            logger.info("All universe nodes selected — no enrichment possible")
            return ExplanationResult(
                clauses=[],
                learning_time_ms=0.0,
                selection_size=P,
                total_nodes=full_graph_nodes,
                contrast_size=len(contrast_set) if contrast_nodes is not None else None,
            )

        base_min_support_tau = EnrichmentScorer.compute_min_support_tau(effective_total)
        adaptive_min_support = max(5, min(base_min_support_tau, P + 2))

        logger.info(f"Base minimum support threshold: {base_min_support_tau}")
        logger.info(f"Adaptive minimum support threshold: {adaptive_min_support}")

        scorer = EnrichmentScorer(adaptive_min_support)

        adaptive_min_score = 1.5 if P >= 10 else max(0.3, 1.5 * (P / 10.0))
        adaptive_min_precision = 0.05 if P >= 10 else max(0.02, 0.05 * (P / 10.0))

        logger.info(
            f"Adaptive quality thresholds: min_score={adaptive_min_score:.2f}, min_precision={adaptive_min_precision:.3f}"
        )

        edge_schema = get_edge_schema(graph)

        literal_generator = LiteralGenerator(
            use_slow_metrics=self.use_slow_metrics,
            min_score=adaptive_min_score,
            max_literals_per_attribute=3,
            enable_neighborhood_literals=True,
            max_base_literals_for_neighborhood=10,
            edge_schema=edge_schema,
            enable_typed_2hop=True,
        )

        beam_search = BeamSearch(
            beam_width=self.beam_width,
            max_clause_len=self.max_clause_len,
            min_improvement=self.min_improvement,
            max_evaluations=self.max_evaluations,
            min_precision=adaptive_min_precision,
        )

        logger.info("Starting beam search for candidate clauses")
        candidate_clauses = beam_search.search(
            graph, selected_set, scorer, literal_generator, universe=contrast_universe
        )

        logger.info(
            f"Beam search completed, found {len(candidate_clauses)} candidate clauses"
        )

        structural_generator = LiteralGenerator(
            use_slow_metrics=self.use_slow_metrics,
            min_score=adaptive_min_score,
            max_literals_per_attribute=3,
            enable_neighborhood_literals=False,
            edge_schema=edge_schema,
            enable_typed_2hop=False,
        )
        structural_beam = BeamSearch(
            beam_width=self.beam_width,
            max_clause_len=self.max_clause_len,
            min_improvement=self.min_improvement,
            max_evaluations=self.max_evaluations // 2,
            min_precision=adaptive_min_precision,
        )
        structural_candidates: list[Clause] = structural_beam.search(
            graph,
            selected_set,
            scorer,
            structural_generator,
            universe=contrast_universe,
        )

        logger.info(
            f"Structural search completed, found {len(structural_candidates)} attribute+topology clauses"
        )

        n_structural_slots = max(1, self.top_k // 3) if structural_candidates else 0
        n_neighborhood_slots = self.top_k - n_structural_slots
        candidate_clauses = (
            candidate_clauses[:n_neighborhood_slots]
            + structural_candidates[:n_structural_slots]
        )

        logger.info(
            f"Combined: {n_neighborhood_slots} neighborhood + {n_structural_slots} structural clauses"
        )

        explanatory_clauses = []
        for i, clause in enumerate(candidate_clauses[: self.top_k]):
            if clause.score and clause.score.is_valid:
                literals_data = [self._literal_to_dict(lit) for lit in clause.literals]
                explanatory_clauses.append(
                    ExplanatoryClause(
                        fol_expression=clause.fol_expression,
                        p=clause.score.p,
                        n=clause.score.n,
                        support=clause.score.support,
                        pi=clause.score.pi,
                        pi_clause=clause.score.pi_clause,
                        score=clause.score.score,
                        coverage=clause.score.coverage,
                        matching_nodes=sorted(clause.matching_nodes),
                        literals=literals_data,
                    )
                )
                logger.info(
                    f"Added explanatory clause {i + 1}: {clause.fol_expression} (score={clause.score.score:.3f}, precision={clause.score.pi_clause:.3f})"
                )

        if not explanatory_clauses and candidate_clauses:
            logger.info("No valid clauses found, attempting best-effort fallback")
            best_candidate = max(
                candidate_clauses,
                key=lambda c: c.score.score if c.score else float("-inf"),
            )

            if best_candidate.score and best_candidate.score.support >= 1:
                logger.info(
                    f"Best-effort clause: {best_candidate.fol_expression} (score={best_candidate.score.score:.3f}, support={best_candidate.score.support})"
                )
                literals_data = [
                    self._literal_to_dict(lit) for lit in best_candidate.literals
                ]
                explanatory_clauses.append(
                    ExplanatoryClause(
                        fol_expression=best_candidate.fol_expression,
                        p=best_candidate.score.p,
                        n=best_candidate.score.n,
                        support=best_candidate.score.support,
                        pi=best_candidate.score.pi,
                        pi_clause=best_candidate.score.pi_clause,
                        score=best_candidate.score.score,
                        coverage=best_candidate.score.coverage,
                        matching_nodes=sorted(best_candidate.matching_nodes),
                        literals=literals_data,
                    )
                )

        if not explanatory_clauses:
            logger.warning(
                "No candidate clauses found, creating last-resort descriptive predicate"
            )
            node_types: set[str] = set()
            type_attr_key = "type"
            for node in selected_set:
                node_data = graph.nodes[node]
                for attr in ["node_type", "type", "label"]:
                    if attr in node_data:
                        node_types.add(str(node_data[attr]))
                        type_attr_key = attr
                        break

            if node_types and len(node_types) == 1:
                node_type = list(node_types)[0]
                candidates = (
                    contrast_universe
                    if contrast_universe is not None
                    else set(graph.nodes())
                )
                matching_nodes = set()
                for node_id in candidates:
                    node_data = graph.nodes[node_id]
                    if node_data.get(type_attr_key) == node_type:
                        matching_nodes.add(str(node_id))

                if matching_nodes:
                    p = len(matching_nodes & {str(n) for n in selected_set})
                    n = len(matching_nodes) - p
                    support = p + n
                    pi = len(selected_set) / effective_total
                    pi_clause = p / support if support > 0 else 0

                    explanatory_clauses.append(
                        ExplanatoryClause(
                            fol_expression=f'{type_attr_key}(x) = "{node_type}"',
                            p=p,
                            n=n,
                            support=support,
                            pi=pi,
                            pi_clause=pi_clause,
                            score=max(0.1, support * (pi_clause - pi))
                            if pi_clause > pi
                            else 0.1,
                            coverage=p / len(selected_set)
                            if len(selected_set) > 0
                            else 0,
                            matching_nodes=sorted(matching_nodes),
                            literals=[],
                        )
                    )
                else:
                    logger.warning(
                        f"Creating minimal predicate for {len(selected_set)} selected nodes"
                    )
                    explanatory_clauses.append(
                        ExplanatoryClause(
                            fol_expression="selected(x)",
                            p=len(selected_set),
                            n=0,
                            support=len(selected_set),
                            pi=len(selected_set) / effective_total,
                            pi_clause=1.0,
                            score=0.1,
                            coverage=1.0,
                            matching_nodes=sorted(str(n) for n in selected_set),
                            literals=[],
                        )
                    )

        elapsed = (time.time() - start_time) * 1000
        logger.info(
            f"Explanation learning completed in {elapsed:.1f}ms with {len(explanatory_clauses)} final clauses"
        )

        return ExplanationResult(
            clauses=explanatory_clauses,
            learning_time_ms=elapsed,
            selection_size=P,
            total_nodes=full_graph_nodes,
            contrast_size=len(contrast_set) if contrast_nodes is not None else None,
        )

    def learn_disjunctive_predicate(
        self,
        graph: nx.Graph,
        selected_nodes: list[str],
        max_clauses: int = 3,
        min_remaining_positive_fraction: float = 0.05,
        contrast_nodes: list[str] | None = None,
    ) -> DisjunctiveExplanationResult:
        logger.info(
            f"Starting disjunctive predicate learning: {len(selected_nodes)} nodes, max_clauses={max_clauses}"
        )

        start_time = time.time()

        valid_selected = [n for n in selected_nodes if n in graph.nodes()]
        invalid_count = len(selected_nodes) - len(valid_selected)
        if invalid_count > 0:
            logger.warning(f"Found {invalid_count} invalid node IDs in selection")

        if not valid_selected:
            logger.error(
                "No valid selected nodes found in graph - returning empty result"
            )
            return DisjunctiveExplanationResult(
                predicate_type="disjunction",
                clauses=[],
                combined_expression="⊥",
                total_coverage=0.0,
                global_enrichment=0.0,
                learning_time_ms=0.0,
                selection_size=0,
                total_nodes=len(graph.nodes()),
            )

        original_selected_set = set(valid_selected)
        full_graph_nodes = len(graph.nodes())
        P_original = len(original_selected_set)

        contrast_set: set[str] = set()
        if contrast_nodes is not None:
            valid_contrast = [n for n in contrast_nodes if n in graph.nodes()]
            contrast_set = set(valid_contrast)
            logger.info(
                f"Contrastive mode: {P_original} positive vs {len(contrast_set)} contrast nodes"
            )

        effective_total = (
            P_original + len(contrast_set) if contrast_set else full_graph_nodes
        )

        logger.info(
            f"Disjunctive setup: {P_original} selected, {effective_total} effective total (π={P_original / effective_total:.4f})"
        )

        if P_original == effective_total:
            logger.info("All universe nodes selected - no enrichment possible")
            return DisjunctiveExplanationResult(
                predicate_type="disjunction",
                clauses=[],
                combined_expression="⊤",
                total_coverage=1.0,
                global_enrichment=0.0,
                learning_time_ms=0.0,
                selection_size=P_original,
                total_nodes=full_graph_nodes,
                contrast_size=len(contrast_set) if contrast_nodes is not None else None,
            )

        pi_global = P_original / effective_total
        base_min_support_tau = EnrichmentScorer.compute_min_support_tau(effective_total)
        adaptive_min_support = max(5, min(base_min_support_tau, P_original + 2))
        min_remaining_positive = max(
            1, int(min_remaining_positive_fraction * P_original)
        )

        logger.info(
            f"Disjunctive params: π={pi_global:.4f}, min_support={adaptive_min_support}, min_remaining={min_remaining_positive}"
        )

        global_scorer = EnrichmentScorer(adaptive_min_support)
        disjunctive_edge_schema = get_edge_schema(graph)

        learned_clauses: list[ExplanatoryClause] = []
        marginal_gains_list: list[float] = []
        remaining_positives = original_selected_set.copy()
        all_covered_positives: set[str] = set()
        existing_matches: set[str] = set()

        top_k_candidates = max(5, self.top_k)

        for clause_num in range(max_clauses):
            logger.info(
                f"Clause {clause_num + 1} iteration: {len(remaining_positives)} remaining positives"
            )

            if len(remaining_positives) < min_remaining_positive:
                logger.info(
                    f"Stopping: {len(remaining_positives)} remaining < min required {min_remaining_positive}"
                )
                break

            clause_universe = (
                frozenset(remaining_positives | contrast_set) if contrast_set else None
            )

            clause_start_time = time.time()
            candidates_result = self._learn_single_clause(
                graph,
                list(remaining_positives),
                original_selected_set,
                effective_total,
                adaptive_min_support,
                clause_num + 1,
                top_k=top_k_candidates,
                universe=clause_universe,
                edge_schema=disjunctive_edge_schema,
            )
            clause_learning_time = (time.time() - clause_start_time) * 1000
            logger.info(f"Clause learning completed in {clause_learning_time:.2f}ms")

            if not candidates_result.clauses:
                logger.warning(f"No valid clause found at iteration {clause_num + 1}")
                break

            logger.info(
                f"Evaluating {len(candidates_result.clauses)} candidates by marginal gain"
            )
            best_clause, best_mg = self._select_by_marginal_gain(
                candidates_result.clauses,
                existing_matches,
                original_selected_set,
                effective_total,
                global_scorer,
            )

            logger.info(f"Best clause by marginal gain: {best_clause.fol_expression}")
            logger.info(f"  Marginal gain: {best_mg:.6f}")

            if best_mg <= 0.0:
                logger.warning(
                    f"No candidate improves combined disjunction at iteration {clause_num + 1}"
                )
                break

            learned_clauses.append(best_clause)
            marginal_gains_list.append(best_mg)
            logger.info(f"Added clause {clause_num + 1}: {best_clause.fol_expression}")

            existing_matches |= set(best_clause.matching_nodes)

            clause_covered_positives = (
                set(best_clause.matching_nodes) & remaining_positives
            )

            all_covered_positives.update(clause_covered_positives)
            remaining_positives -= clause_covered_positives

            logger.info(
                f"Clause coverage: {len(clause_covered_positives)} new positives, "
                f"{len(all_covered_positives) / P_original:.4f} cumulative, "
                f"{len(remaining_positives)} remaining"
            )

            if not remaining_positives:
                logger.info("Complete coverage achieved")
                break

        logger.info(f"Disjunctive learning completed: {len(learned_clauses)} clauses")

        if not learned_clauses:
            logger.warning("No clauses learned")
            return DisjunctiveExplanationResult(
                predicate_type="disjunction",
                clauses=[],
                combined_expression="⊥",
                total_coverage=0.0,
                global_enrichment=0.0,
                learning_time_ms=(time.time() - start_time) * 1000,
                selection_size=P_original,
                total_nodes=full_graph_nodes,
                contrast_size=len(contrast_set) if contrast_nodes is not None else None,
            )

        combined_expression = self._build_combined_expression(learned_clauses)
        total_coverage = (
            len(all_covered_positives) / P_original if P_original > 0 else 0.0
        )

        all_matching_nodes: set[str] = set()
        for clause in learned_clauses:
            all_matching_nodes.update(clause.matching_nodes)

        pi_combined = (
            len(all_matching_nodes & original_selected_set) / len(all_matching_nodes)
            if all_matching_nodes
            else 0.0
        )
        global_enrichment = pi_combined - pi_global if pi_combined > pi_global else 0.0

        elapsed = (time.time() - start_time) * 1000

        logger.info(
            f"Disjunctive result: {len(learned_clauses)} clauses, coverage={total_coverage:.4f}, "
            f"enrichment={global_enrichment:.4f}, elapsed={elapsed:.1f}ms"
        )

        return DisjunctiveExplanationResult(
            predicate_type="disjunction",
            clauses=learned_clauses,
            combined_expression=combined_expression,
            total_coverage=total_coverage,
            global_enrichment=global_enrichment,
            learning_time_ms=elapsed,
            selection_size=P_original,
            total_nodes=full_graph_nodes,
            marginal_gains=marginal_gains_list,
            contrast_size=len(contrast_set) if contrast_nodes is not None else None,
        )

    def _select_by_marginal_gain(
        self,
        candidates: list[ExplanatoryClause],
        existing_matches: set[str],
        selected_nodes: set[str],
        total_nodes: int,
        scorer: EnrichmentScorer,
    ) -> tuple[ExplanatoryClause, float]:
        best_clause = candidates[0]
        best_gain = float("-inf")
        for candidate in candidates:
            gain = scorer.marginal_gain(
                set(candidate.matching_nodes),
                existing_matches,
                selected_nodes,
                total_nodes,
            )
            logger.debug(
                f"  Candidate '{candidate.fol_expression}': marginal_gain={gain:.6f}"
            )
            if gain > best_gain:
                best_gain = gain
                best_clause = candidate
        return best_clause, best_gain

    def _learn_single_clause(
        self,
        graph: nx.Graph,
        current_positives: list[str],
        original_selected_set: set[str],
        total_nodes: int,
        min_support_tau: int,
        clause_number: int = 1,
        top_k: int = 1,
        universe: frozenset | None = None,
        edge_schema: dict | None = None,
    ) -> ExplanationResult:
        logger.info(
            f"Single clause learning {clause_number}: {len(current_positives)} positives, "
            f"min_support={min_support_tau}"
        )

        P_current = len(current_positives)
        P_original = len(original_selected_set)

        adaptive_min_score = (
            1.5 if P_original >= 10 else max(0.3, 1.5 * (P_original / 10.0))
        )
        adaptive_min_precision = (
            0.05 if P_original >= 10 else max(0.02, 0.05 * (P_original / 10.0))
        )

        scorer = EnrichmentScorer(min_support_tau)

        literal_generator = LiteralGenerator(
            use_slow_metrics=self.use_slow_metrics,
            min_score=adaptive_min_score,
            max_literals_per_attribute=3,
            enable_neighborhood_literals=True,
            max_base_literals_for_neighborhood=10,
            edge_schema=edge_schema,
            enable_typed_2hop=True,
        )

        beam_search = BeamSearch(
            beam_width=self.beam_width,
            max_clause_len=self.max_clause_len,
            min_improvement=self.min_improvement,
            max_evaluations=self.max_evaluations,
            min_precision=adaptive_min_precision,
        )

        current_selected_set = set(current_positives)

        candidate_clauses = beam_search.search(
            graph, current_selected_set, scorer, literal_generator, universe=universe
        )

        logger.info(
            f"Clause {clause_number} beam search: {len(candidate_clauses)} candidates"
        )

        if not candidate_clauses:
            logger.warning(f"No candidate clauses generated for clause {clause_number}")
            return ExplanationResult(
                clauses=[],
                learning_time_ms=0.0,
                selection_size=P_current,
                total_nodes=total_nodes,
            )

        explanatory_clauses = []
        for _i, clause in enumerate(candidate_clauses[:top_k]):
            if clause.score and clause.score.is_valid:
                literals_data = [self._literal_to_dict(lit) for lit in clause.literals]

                clause_matches = set(clause.matching_nodes)
                p_original = len(clause_matches & original_selected_set)
                coverage_against_original = (
                    p_original / P_original if P_original > 0 else 0.0
                )

                explanatory_clause = ExplanatoryClause(
                    fol_expression=clause.fol_expression,
                    p=clause.score.p,
                    n=clause.score.n,
                    support=clause.score.support,
                    pi=P_original / total_nodes,
                    pi_clause=clause.score.pi_clause,
                    score=clause.score.score,
                    coverage=coverage_against_original,
                    matching_nodes=sorted(clause.matching_nodes),
                    literals=literals_data,
                )
                explanatory_clauses.append(explanatory_clause)
            else:
                logger.warning(f"Invalid clause score at clause {clause_number}")

        return ExplanationResult(
            clauses=explanatory_clauses,
            learning_time_ms=0.0,
            selection_size=P_current,
            total_nodes=total_nodes,
        )

    def _build_combined_expression(self, clauses: list[ExplanatoryClause]) -> str:
        if not clauses:
            return "⊥"

        if len(clauses) == 1:
            return clauses[0].fol_expression

        return " ∨ ".join(f"({clause.fol_expression})" for clause in clauses)

    def _literal_to_dict(self, literal: Literal) -> dict[str, Any]:
        try:
            value = literal.value

            if value is None or (
                isinstance(value, float) and (math.isnan(value) or math.isinf(value))
            ):
                value = ""

            result = {
                "type": getattr(
                    literal.literal_type, "value", str(literal.literal_type)
                ),
                "attribute": getattr(literal, "attribute", ""),
                "operator": getattr(literal.operator, "value", str(literal.operator)),
                "value": value,
                "score": getattr(literal, "score", 0.0),
                "coverage": getattr(literal, "coverage", 0.0),
            }

            if (
                hasattr(literal, "neighborhood_spec")
                and literal.neighborhood_spec is not None
            ):
                spec = literal.neighborhood_spec

                try:
                    quantifier_name = ""
                    if hasattr(spec, "quantifier") and hasattr(spec.quantifier, "name"):
                        quantifier_name = spec.quantifier.name.lower()
                    elif hasattr(spec, "quantifier"):
                        quantifier_name = str(spec.quantifier).lower()

                    k_hops = getattr(spec, "k_hop", getattr(spec, "k_hops", 1))
                    count = getattr(spec, "threshold", getattr(spec, "count", None))

                    base_predicates = getattr(spec, "base_predicates", ("",))
                    base_predicate_str = " ∧ ".join(base_predicates)
                    if hasattr(spec, "base_literal") and spec.base_literal:
                        base_literal_attr = getattr(spec.base_literal, "attribute", "")
                        base_literal_val = getattr(spec.base_literal, "value", "")
                    else:
                        base_literal_attr = base_predicate_str
                        base_literal_val = ""

                    result["neighborhood_spec"] = {
                        "quantifier": quantifier_name,
                        "k_hops": k_hops,
                        "count": count,
                        "base_literal_attribute": base_literal_attr,
                        "base_literal_value": base_literal_val,
                        "path_str": ".".join(s.edge_type for s in spec.path)
                        if spec.path
                        else None,
                    }

                except AttributeError as e:
                    logger.warning(f"Error processing neighborhood spec: {e}")
                    result["neighborhood_spec"] = {
                        "quantifier": "unknown",
                        "k_hops": 1,
                        "count": None,
                        "base_literal_attribute": "",
                        "base_literal_value": "",
                    }

            return result

        except Exception as e:
            logger.error(f"Error converting literal to dict: {e}")
            return {
                "type": "unknown",
                "attribute": str(getattr(literal, "attribute", "")),
                "operator": "=",
                "value": "",
                "score": 0.0,
                "coverage": 0.0,
            }
