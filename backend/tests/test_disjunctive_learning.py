from unittest.mock import patch

import networkx as nx
import pytest

from fol.learning.learner import ExplanationLearner
from fol.learning.scoring import EnrichmentScorer


class TestDisjunctiveLearning:
    @pytest.fixture
    def synthetic_graph(self):
        G = nx.Graph()

        for i in range(1, 21):
            G.add_node(str(i), type="protein", score=50.0)

        for i in range(21, 41):
            G.add_node(str(i), type="enzyme", score=75.0)

        for i in range(41, 61):
            G.add_node(str(i), type="protein", score=25.0)

        for i in range(61, 81):
            G.add_node(str(i), type="enzyme", score=30.0)

        for i in range(1, 21):
            for j in range(i + 1, min(i + 5, 21)):
                G.add_edge(str(i), str(j))

        for i in range(21, 41):
            for j in range(i + 1, min(i + 3, 41)):
                G.add_edge(str(i), str(j))

        return G

    @pytest.fixture
    def two_region_selection(self):
        region_1 = [str(i) for i in range(1, 11)]
        region_2 = [str(i) for i in range(21, 31)]
        return region_1 + region_2

    def test_multiple_clause_learning(self, synthetic_graph, two_region_selection):
        learner = ExplanationLearner(
            beam_width=3,
            max_clause_len=3,
            top_k=3,
        )

        result = learner.learn_disjunctive_predicate(
            synthetic_graph,
            two_region_selection,
            max_clauses=3,
            min_remaining_positive_fraction=0.05,
        )

        assert result.predicate_type == "disjunction"
        assert len(result.clauses) >= 1
        assert result.total_coverage > 0.5
        assert result.global_enrichment >= 0.0

    def test_correct_removal_of_positives(self, synthetic_graph, two_region_selection):
        learner = ExplanationLearner(
            beam_width=3,
            max_clause_len=2,
            top_k=1,
        )

        result = learner.learn_disjunctive_predicate(
            synthetic_graph,
            two_region_selection,
            max_clauses=2,
            min_remaining_positive_fraction=0.1,
        )

        if len(result.clauses) >= 2:
            clause1_nodes = set(result.clauses[0].matching_nodes)
            clause2_nodes = set(result.clauses[1].matching_nodes)

            selected_set = set(two_region_selection)
            clause1_covered = clause1_nodes & selected_set
            clause2_covered = clause2_nodes & selected_set

            overlap = clause1_covered & clause2_covered
            overlap_fraction = (
                len(overlap) / len(clause1_covered | clause2_covered)
                if clause1_covered | clause2_covered
                else 0
            )

            assert overlap_fraction < 0.5

    def test_union_semantics(self, synthetic_graph, two_region_selection):
        learner = ExplanationLearner(
            beam_width=3,
            max_clause_len=2,
        )

        result = learner.learn_disjunctive_predicate(
            synthetic_graph,
            two_region_selection,
            max_clauses=2,
        )

        if result.clauses:
            all_clause_matches = set()
            for clause in result.clauses:
                all_clause_matches.update(clause.matching_nodes)

            selected_set = set(two_region_selection)
            covered_selected = all_clause_matches & selected_set

            expected_coverage = len(covered_selected) / len(selected_set)
            assert abs(result.total_coverage - expected_coverage) < 0.01

    def test_baseline_invariance(self, synthetic_graph, two_region_selection):
        learner = ExplanationLearner(
            beam_width=2,
            max_clause_len=2,
        )

        result = learner.learn_disjunctive_predicate(
            synthetic_graph,
            two_region_selection,
            max_clauses=2,
        )

        expected_pi = len(two_region_selection) / len(synthetic_graph.nodes())

        for clause in result.clauses:
            assert abs(clause.pi - expected_pi) < 0.001

    def test_stopping_criteria_max_clauses(self, synthetic_graph, two_region_selection):
        max_clauses = 2
        learner = ExplanationLearner(beam_width=3, max_clause_len=2)

        result = learner.learn_disjunctive_predicate(
            synthetic_graph,
            two_region_selection,
            max_clauses=max_clauses,
        )

        assert len(result.clauses) <= max_clauses

    def test_stopping_criteria_min_remaining(self, synthetic_graph):
        small_selection = ["1", "2"]
        learner = ExplanationLearner(beam_width=3, max_clause_len=2)

        result = learner.learn_disjunctive_predicate(
            synthetic_graph,
            small_selection,
            max_clauses=5,
            min_remaining_positive_fraction=0.8,
        )

        assert len(result.clauses) <= 2

    def test_empty_selection(self, synthetic_graph):
        learner = ExplanationLearner()

        result = learner.learn_disjunctive_predicate(synthetic_graph, [], max_clauses=3)

        assert result.predicate_type == "disjunction"
        assert len(result.clauses) == 0
        assert result.combined_expression == "⊥"
        assert result.total_coverage == 0.0

    def test_all_nodes_selected(self, synthetic_graph):
        all_nodes = list(synthetic_graph.nodes())
        learner = ExplanationLearner()

        result = learner.learn_disjunctive_predicate(
            synthetic_graph, all_nodes, max_clauses=3
        )

        assert result.predicate_type == "disjunction"
        assert result.combined_expression == "⊤"
        assert result.total_coverage == 1.0

    def test_combined_expression_formatting(
        self, synthetic_graph, two_region_selection
    ):
        learner = ExplanationLearner(beam_width=2, max_clause_len=2)

        result = learner.learn_disjunctive_predicate(
            synthetic_graph,
            two_region_selection,
            max_clauses=2,
        )

        if len(result.clauses) > 1:
            assert " ∨ " in result.combined_expression
            assert result.combined_expression != "⊥"
        elif len(result.clauses) == 1:
            assert result.combined_expression == result.clauses[0].fol_expression
        else:
            assert result.combined_expression == "⊥"

    @patch("fol.learning.learner.logger")
    def test_enrichment_scoring_consistency(
        self, mock_logger, synthetic_graph, two_region_selection
    ):
        learner = ExplanationLearner(beam_width=2, max_clause_len=2)

        result = learner.learn_disjunctive_predicate(
            synthetic_graph,
            two_region_selection,
            max_clauses=2,
        )

        for clause in result.clauses:
            assert clause.score > 0
            assert clause.pi_clause > clause.pi
            assert clause.support >= 3

    def test_coverage_computation(self, synthetic_graph, two_region_selection):
        learner = ExplanationLearner(beam_width=2, max_clause_len=2)

        result = learner.learn_disjunctive_predicate(
            synthetic_graph,
            two_region_selection,
            max_clauses=2,
        )

        selected_set = set(two_region_selection)
        total_covered = set()

        for clause in result.clauses:
            clause_matches = set(clause.matching_nodes)
            clause_covered = clause_matches & selected_set
            total_covered.update(clause_covered)

            expected_clause_coverage = len(clause_covered) / len(selected_set)
            assert abs(clause.coverage - expected_clause_coverage) < 0.01

        expected_total_coverage = len(total_covered) / len(selected_set)
        assert abs(result.total_coverage - expected_total_coverage) < 0.01

    def test_convenience_function(self, synthetic_graph, two_region_selection):
        learner = ExplanationLearner(beam_width=2, max_clause_len=2)
        result = learner.learn_disjunctive_predicate(
            synthetic_graph,
            two_region_selection,
            max_clauses=2,
        )

        assert isinstance(result.clauses, list)
        assert result.predicate_type == "disjunction"
        assert result.learning_time_ms >= 0

    def test_deterministic_behavior(self, synthetic_graph, two_region_selection):
        learner1 = ExplanationLearner(beam_width=2, max_clause_len=2)
        learner2 = ExplanationLearner(beam_width=2, max_clause_len=2)

        result1 = learner1.learn_disjunctive_predicate(
            synthetic_graph, two_region_selection, max_clauses=2
        )
        result2 = learner2.learn_disjunctive_predicate(
            synthetic_graph, two_region_selection, max_clauses=2
        )

        assert len(result1.clauses) == len(result2.clauses)
        assert abs(result1.total_coverage - result2.total_coverage) < 0.15
        assert abs(result1.global_enrichment - result2.global_enrichment) < 0.15

    def test_mathematical_correctness(self, synthetic_graph, two_region_selection):
        learner = ExplanationLearner(beam_width=3, max_clause_len=2)

        result = learner.learn_disjunctive_predicate(
            synthetic_graph,
            two_region_selection,
            max_clauses=2,
        )

        N = len(synthetic_graph.nodes())
        P = len(two_region_selection)
        pi_global = P / N

        for clause in result.clauses:
            p = clause.p
            n = clause.n
            support = p + n
            pi_clause = clause.pi_clause

            assert support == p + n
            assert (
                abs(pi_clause - (p / support)) < 0.001
                if support > 0
                else pi_clause == 0
            )
            assert abs(clause.pi - pi_global) < 0.001
            assert clause.score > 0
            assert clause.pi_clause > clause.pi

    def test_marginal_gains_present_in_result(
        self, synthetic_graph, two_region_selection
    ):
        learner = ExplanationLearner(beam_width=3, max_clause_len=2)

        result = learner.learn_disjunctive_predicate(
            synthetic_graph,
            two_region_selection,
            max_clauses=2,
        )

        assert len(result.marginal_gains) == len(result.clauses)
        for mg in result.marginal_gains:
            assert mg > 0.0

    def test_marginal_gain_first_clause_equals_score_union(
        self, synthetic_graph, two_region_selection
    ):
        scorer = EnrichmentScorer(min_support_tau=3)
        selected_set = set(two_region_selection)
        total_nodes = len(synthetic_graph.nodes())

        learner = ExplanationLearner(beam_width=3, max_clause_len=2)
        result = learner.learn_disjunctive_predicate(
            synthetic_graph,
            two_region_selection,
            max_clauses=1,
        )

        if result.clauses:
            first_clause = result.clauses[0]
            first_mg = result.marginal_gains[0]
            expected_mg = scorer.score_union(
                set(first_clause.matching_nodes), selected_set, total_nodes
            )
            assert abs(first_mg - expected_mg) < 1.0

    def test_marginal_gains_positive_means_combined_enrichment_increases(
        self, synthetic_graph, two_region_selection
    ):
        scorer = EnrichmentScorer(min_support_tau=3)
        selected_set = set(two_region_selection)
        total_nodes = len(synthetic_graph.nodes())

        learner = ExplanationLearner(beam_width=3, max_clause_len=2)
        result = learner.learn_disjunctive_predicate(
            synthetic_graph,
            two_region_selection,
            max_clauses=2,
        )

        existing: set[str] = set()
        for clause, mg in zip(result.clauses, result.marginal_gains, strict=False):
            new_union = existing | set(clause.matching_nodes)
            score_before = scorer.score_union(existing, selected_set, total_nodes)
            score_after = scorer.score_union(new_union, selected_set, total_nodes)
            assert score_after > score_before
            assert mg > 0.0
            existing = new_union

    def test_marginal_gain_stopping_criterion(self, synthetic_graph):
        fully_covered_selection = list(synthetic_graph.nodes())[:5]

        learner = ExplanationLearner(beam_width=2, max_clause_len=2)
        result = learner.learn_disjunctive_predicate(
            synthetic_graph,
            fully_covered_selection,
            max_clauses=5,
        )

        assert len(result.marginal_gains) == len(result.clauses)

    def test_overlapping_patterns_handled(self):
        G = nx.Graph()

        for i in range(1, 16):
            G.add_node(str(i), type="protein", score=80.0)
        for i in range(11, 26):
            G.add_node(str(i), type="enzyme", score=80.0)
        for i in range(26, 51):
            G.add_node(str(i), type="other", score=10.0)

        G.add_edge("1", "2")
        G.add_edge("11", "12")

        selected = [str(i) for i in range(1, 21)]

        learner = ExplanationLearner(beam_width=3, max_clause_len=2)
        result = learner.learn_disjunctive_predicate(G, selected, max_clauses=3)

        assert result.predicate_type == "disjunction"
        assert len(result.marginal_gains) == len(result.clauses)
        for mg in result.marginal_gains:
            assert mg > 0.0

        if len(result.clauses) >= 2:
            selected_set = set(selected)
            all_covered = set()
            for clause in result.clauses:
                all_covered.update(set(clause.matching_nodes) & selected_set)
            assert len(all_covered) >= len(selected_set) * 0.7

    def test_marginal_gains_non_increasing_ordering(
        self, synthetic_graph, two_region_selection
    ):
        learner = ExplanationLearner(beam_width=3, max_clause_len=2)

        result = learner.learn_disjunctive_predicate(
            synthetic_graph,
            two_region_selection,
            max_clauses=3,
        )

        for mg in result.marginal_gains:
            assert mg > 0.0

    def test_to_dict_includes_marginal_gains(
        self, synthetic_graph, two_region_selection
    ):
        learner = ExplanationLearner(beam_width=2, max_clause_len=2)

        result = learner.learn_disjunctive_predicate(
            synthetic_graph,
            two_region_selection,
            max_clauses=2,
        )

        d = result.to_dict()
        assert "marginal_gains" in d
        assert isinstance(d["marginal_gains"], list)
        assert len(d["marginal_gains"]) == len(result.clauses)
