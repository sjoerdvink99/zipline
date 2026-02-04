from __future__ import annotations

import logging
from dataclasses import dataclass, field

import networkx as nx

from fol.learning.literal_generator import Literal, LiteralGenerator, LiteralType
from fol.learning.scoring import EnrichmentScore, EnrichmentScorer

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class Clause:
    literals: list[Literal] = field(default_factory=list)
    matching_nodes: set[str] = field(default_factory=set)
    score: EnrichmentScore | None = None

    @property
    def fol_expression(self) -> str:
        if not self.literals:
            return "⊤"
        if len(self.literals) == 1:
            return self.literals[0].fol_string
        return " ∧ ".join(lit.fol_string for lit in self.literals)

    def copy(self) -> Clause:
        return Clause(
            literals=self.literals.copy(),
            matching_nodes=self.matching_nodes.copy(),
            score=self.score,
        )

    def signature(self) -> str:
        if not self.literals:
            return "⊤"
        return " ∧ ".join(sorted(lit.fol_string for lit in self.literals))


class BeamSearch:
    def __init__(
        self,
        beam_width: int = 5,
        max_clause_len: int = 4,
        min_improvement: float = 1.0,
        max_evaluations: int = 5000,
        min_precision: float = 0.1,
    ):
        self.beam_width = beam_width
        self.max_clause_len = max_clause_len
        self.min_improvement = min_improvement
        self.max_evaluations = max_evaluations
        self.min_precision = min_precision
        self._evaluations = 0

    def search(
        self,
        graph: nx.Graph,
        selected_nodes: set[str],
        scorer: EnrichmentScorer,
        literal_generator: LiteralGenerator,
        universe: frozenset | None = None,
    ) -> list[Clause]:
        logger.info(
            f"Starting beam search: width={self.beam_width}, max_len={self.max_clause_len}, precision_threshold={self.min_precision}"
        )

        self._evaluations = 0
        effective_total = len(universe) if universe is not None else len(graph.nodes())
        all_literals = literal_generator.generate(
            graph, selected_nodes, scorer=scorer, universe=universe
        )

        if not all_literals:
            logger.warning("No literals generated, returning empty clause list")
            return []

        logger.info(f"Beam search starting with {len(all_literals)} candidate literals")

        all_clauses: list[Clause] = []
        seen_signatures: set[str] = set()

        for literal in all_literals:
            if self._evaluations >= self.max_evaluations:
                logger.info(
                    f"Evaluation limit reached ({self.max_evaluations}) during single-literal generation"
                )
                break

            clause = Clause(literals=[literal], matching_nodes=literal.matching_nodes)
            clause.score = scorer.score_clause(
                clause.matching_nodes, selected_nodes, effective_total
            )

            if self._is_clause_valid(clause, seen_signatures):
                all_clauses.append(clause)
                seen_signatures.add(clause.signature())

            self._evaluations += 1

        _sorted_init = sorted(
            [c for c in all_clauses if c.score and c.score.is_valid],
            key=lambda c: c.score.score if c.score else 0.0,
            reverse=True,
        )
        beam: list[Clause] = []
        _beam_matchsets: list[frozenset] = []
        for _c in _sorted_init:
            _ext = frozenset(_c.matching_nodes)
            if any(self._jaccard(_ext, _s) > 0.7 for _s in _beam_matchsets):
                continue
            beam.append(_c)
            _beam_matchsets.append(_ext)
            if len(beam) >= self.beam_width:
                break

        logger.info(f"Initial beam: {len(beam)} valid single-literal clauses")

        for depth in range(1, self.max_clause_len):
            if not beam or self._evaluations >= self.max_evaluations:
                break

            logger.info(f"Expanding to depth {depth + 1}, beam size: {len(beam)}")
            candidates = []

            for clause in beam:
                expansions = self._expand_clause(
                    clause,
                    all_literals,
                    selected_nodes,
                    effective_total,
                    scorer,
                    seen_signatures,
                )
                candidates.extend(expansions)

                if self._evaluations >= self.max_evaluations:
                    logger.info(
                        f"Evaluation limit reached during depth {depth + 1} expansion"
                    )
                    break

            if not candidates:
                logger.info(f"No valid expansions at depth {depth + 1}, terminating")
                break

            valid_candidates = [c for c in candidates if c.score and c.score.is_valid]
            logger.info(f"{len(valid_candidates)} valid clauses at depth {depth + 1}")

            if valid_candidates:
                all_clauses.extend(valid_candidates)

                best_current = max(
                    valid_candidates, key=lambda c: c.score.score if c.score else 0.0
                )
                best_current_score = (
                    best_current.score.score if best_current.score else 0.0
                )
                best_beam = max(beam, key=lambda c: c.score.score if c.score else 0.0)
                best_beam_score = best_beam.score.score if best_beam.score else 0.0

                improvement = best_current_score - best_beam_score
                logger.info(
                    f"Improvement at depth {depth + 1}: {improvement:.6f} (threshold: {self.min_improvement})"
                )

                if depth >= 2 and improvement < self.min_improvement:
                    logger.info(
                        f"Improvement {improvement:.6f} < {self.min_improvement}, terminating"
                    )
                    break

            beam = sorted(
                valid_candidates,
                key=lambda c: c.score.score if c.score else 0.0,
                reverse=True,
            )[: self.beam_width]

        logger.info(
            f"Beam search complete: {len(all_clauses)} total clauses, {self._evaluations} evaluations"
        )

        final_clauses = self._deduplicate_and_rank(all_clauses)
        logger.info(f"Final: {len(final_clauses)} unique clauses after deduplication")

        return final_clauses

    def _expand_clause(
        self,
        clause: Clause,
        all_literals: list[Literal],
        selected_nodes: set[str],
        total_nodes: int,
        scorer: EnrichmentScorer,
        seen_signatures: set[str],
    ) -> list[Clause]:
        expansions = []
        used_attributes = {self._literal_key(lit) for lit in clause.literals}
        untyped_predicate_sets = {
            frozenset(lit.neighborhood_spec.base_predicates)
            for lit in clause.literals
            if lit.literal_type == LiteralType.NEIGHBORHOOD
            and lit.neighborhood_spec
            and not lit.neighborhood_spec.is_typed()
        }
        typed_path_keys = {
            (
                tuple(lit.neighborhood_spec.path or ()),
                frozenset(lit.neighborhood_spec.base_predicates),
            )
            for lit in clause.literals
            if lit.literal_type == LiteralType.NEIGHBORHOOD
            and lit.neighborhood_spec
            and lit.neighborhood_spec.is_typed()
        }

        for literal in all_literals:
            if self._evaluations >= self.max_evaluations:
                break

            if self._literal_key(literal) in used_attributes:
                continue

            if self._would_create_redundant_threshold(clause, literal):
                continue

            if literal.literal_type == LiteralType.NEIGHBORHOOD:
                total_neighborhood_count = sum(
                    1
                    for lit in clause.literals
                    if lit.literal_type == LiteralType.NEIGHBORHOOD
                )
                if total_neighborhood_count >= 2:
                    continue
                spec = literal.neighborhood_spec
                if spec and not spec.is_typed():
                    new_pred_set = frozenset(spec.base_predicates)
                    if any(
                        new_pred_set & existing for existing in untyped_predicate_sets
                    ):
                        continue
                elif spec and spec.is_typed():
                    key = (tuple(spec.path or ()), frozenset(spec.base_predicates))
                    if key in typed_path_keys:
                        continue

            new_matching = clause.matching_nodes & literal.matching_nodes
            if len(new_matching) == 0:
                continue
            if new_matching == clause.matching_nodes:
                continue

            new_clause = clause.copy()
            new_clause.literals.append(literal)
            new_clause.matching_nodes = new_matching

            new_clause.score = scorer.score_clause(
                new_clause.matching_nodes, selected_nodes, total_nodes
            )

            if self._is_clause_valid(new_clause, seen_signatures):
                expansions.append(new_clause)
                seen_signatures.add(new_clause.signature())

            self._evaluations += 1

        return expansions

    def _is_clause_valid(self, clause: Clause, seen_signatures: set[str]) -> bool:
        if not clause.score or not clause.score.is_valid:
            return False

        if clause.signature() in seen_signatures:
            return False

        if clause.score.pi_clause < self.min_precision:
            return False

        if len(clause.literals) == 1:
            return clause.score.score > 0.01

        return True

    def _deduplicate_and_rank(self, clauses: list[Clause]) -> list[Clause]:
        valid_clauses = []
        signatures: set[str] = set()

        for clause in clauses:
            if not clause.score or not clause.score.is_valid:
                continue

            signature = clause.signature()
            if signature in signatures:
                continue

            signatures.add(signature)
            valid_clauses.append(clause)

        valid_clauses.sort(
            key=lambda c: (-c.score.score, len(c.literals), -c.score.pi_clause)
            if c.score
            else (0.0, len(c.literals), 0.0)
        )

        diversified_clauses = []
        accepted_matchsets: list[frozenset] = []

        for clause in valid_clauses:
            ext = frozenset(clause.matching_nodes)
            if any(self._jaccard(ext, seen) > 0.85 for seen in accepted_matchsets):
                continue

            diversified_clauses.append(clause)
            accepted_matchsets.append(ext)
            if len(diversified_clauses) >= 20:
                break

        return diversified_clauses

    @staticmethod
    def _jaccard(a: frozenset, b: frozenset) -> float:
        union_size = len(a | b)
        return len(a & b) / union_size if union_size > 0 else 1.0

    def _literal_key(self, literal: Literal) -> str:
        if (
            literal.literal_type == LiteralType.NEIGHBORHOOD
            and literal.neighborhood_spec
        ):
            spec = literal.neighborhood_spec
            sorted_preds = "_".join(sorted(spec.base_predicates))
            if spec.is_typed():
                path_str = ".".join(s.edge_type for s in (spec.path or ()))
                return f"nbhd_{spec.quantifier.value}_path_{path_str}_{sorted_preds}"
            return f"nbhd_{spec.quantifier.value}_k{spec.k_hop}_{sorted_preds}"
        return f"{literal.attribute}_{literal.operator.value}_{literal.value}"

    def _would_create_redundant_threshold(
        self, clause: Clause, new_literal: Literal
    ) -> bool:
        for existing_lit in clause.literals:
            if (
                existing_lit.attribute == new_literal.attribute
                and existing_lit.literal_type == new_literal.literal_type
                and existing_lit.literal_type.value in ["attribute_numeric", "topology"]
            ):
                existing_op = existing_lit.operator.value
                new_op = new_literal.operator.value
                existing_val = existing_lit.value
                new_val = new_literal.value

                if (
                    (existing_op == ">=" and new_op == ">" and existing_val == new_val)
                    or (
                        existing_op == ">"
                        and new_op == ">="
                        and existing_val == new_val
                    )
                    or (
                        existing_op == "<="
                        and new_op == "<"
                        and existing_val == new_val
                    )
                    or (
                        existing_op == "<"
                        and new_op == "<="
                        and existing_val == new_val
                    )
                ):
                    return True

        return False
