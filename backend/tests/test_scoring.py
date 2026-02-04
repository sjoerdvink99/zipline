from __future__ import annotations

import math

from fol.learning.scoring import EnrichmentScorer


class TestEnrichmentScorerMathematicalCorrectness:
    """Test mathematical correctness of enrichment scoring against known values."""

    def test_bernoulli_log_likelihood_ratio_exact(self):
        """Test exact log-likelihood ratio computation against manual calculation."""
        scorer = EnrichmentScorer(min_support_tau=1)

        # Test case: 30% baseline, 60% clause rate, support=100
        total_nodes = 1000
        selected_nodes = {f"s_{i}" for i in range(300)}  # π = 300/1000 = 0.3
        clause_matches = {f"s_{i}" for i in range(60)} | {
            f"u_{i}" for i in range(40)
        }  # 60 selected + 40 unselected = 100 total

        result = scorer.score_clause(clause_matches, selected_nodes, total_nodes)

        # Verify counts
        assert result.p == 60
        assert result.n == 40
        assert result.support == 100
        assert result.pi == 0.3
        assert result.pi_clause == 0.6

        expected_score = 60 * math.log(0.6 / 0.3) + 40 * math.log(0.4 / 0.7)
        assert abs(result.score - expected_score) < 1e-10

        # Coverage = p / |S+| = 60 / 300 = 0.2
        assert abs(result.coverage - 0.2) < 1e-10

    def test_enrichment_boundary_conditions(self):
        """Test scoring at enrichment boundary conditions."""
        scorer = EnrichmentScorer(min_support_tau=5)

        # Case 1: π_clause = π (no enrichment, should be invalid)
        total_nodes = 100
        selected_nodes = {f"s_{i}" for i in range(20)}  # π = 0.2
        clause_matches = {f"s_{i}" for i in range(2)} | {
            f"u_{i}" for i in range(8)
        }  # π_clause = 2/10 = 0.2

        result = scorer.score_clause(clause_matches, selected_nodes, total_nodes)
        assert not result.is_valid
        assert result.score == float("-inf")

        # Case 2: π_clause just barely > π (minimal enrichment)
        clause_matches = {f"s_{i}" for i in range(3)} | {
            f"u_{i}" for i in range(7)
        }  # π_clause = 3/10 = 0.3 > 0.2

        result = scorer.score_clause(clause_matches, selected_nodes, total_nodes)
        assert result.is_valid
        assert result.pi_clause == 0.3
        assert (
            abs(result.score - (3 * math.log(0.3 / 0.2) + 7 * math.log(0.7 / 0.8)))
            < 1e-10
        )

    def test_support_weighted_scoring(self):
        """Test that scoring correctly weights by support."""
        scorer = EnrichmentScorer(min_support_tau=5)

        selected_nodes = {f"s_{i}" for i in range(50)}  # π = 0.5
        total_nodes = 100

        # Clause 1: Low support, high enrichment
        clause1 = {f"s_{i}" for i in range(9)} | {
            "u_1"
        }  # π_clause = 9/10 = 0.9, support = 10
        result1 = scorer.score_clause(clause1, selected_nodes, total_nodes)

        # Clause 2: High support, lower enrichment
        clause2 = {f"s_{i}" for i in range(30)} | {
            f"u_{i}" for i in range(20)
        }  # π_clause = 30/50 = 0.6, support = 50
        result2 = scorer.score_clause(clause2, selected_nodes, total_nodes)

        assert result1.pi_clause == 0.9
        assert result2.pi_clause == 0.6

        assert result1.score > result2.score

    def test_score_monotonicity(self):
        """Test that score increases monotonically with enrichment and support."""
        scorer = EnrichmentScorer(min_support_tau=5)

        selected_nodes = {f"s_{i}" for i in range(20)}  # π = 0.2
        total_nodes = 100

        scores = []
        enrichment_rates = [0.3, 0.4, 0.5, 0.7, 0.9]

        for rate in enrichment_rates:
            # Create clause with fixed support=20 but varying enrichment
            p = int(20 * rate)
            n = 20 - p
            clause_matches = {f"s_{i}" for i in range(p)} | {f"u_{i}" for i in range(n)}

            result = scorer.score_clause(clause_matches, selected_nodes, total_nodes)
            scores.append(result.score)

        # Scores should increase monotonically with enrichment rate
        for i in range(1, len(scores)):
            assert (
                scores[i] > scores[i - 1]
            ), f"Score should increase with enrichment: {scores}"

    def test_coverage_calculation_accuracy(self):
        """Test coverage calculation in various scenarios."""
        scorer = EnrichmentScorer(min_support_tau=1)

        # Scenario 1: Full coverage
        selected_nodes = {"s1", "s2", "s3", "s4", "s5"}
        clause_matches = {"s1", "s2", "s3", "s4", "s5", "u1", "u2"}

        result = scorer.score_clause(clause_matches, selected_nodes, 10)
        assert result.coverage == 1.0

        # Scenario 2: Partial coverage with enrichment
        clause_matches = {
            "s1",
            "s2",
            "s3",
            "s4",
            "u1",
        }  # π_clause = 4/5 = 0.8 > π = 0.5
        result = scorer.score_clause(clause_matches, selected_nodes, 10)
        assert result.coverage == 0.8  # 4 out of 5 selected nodes

        # Scenario 3: No coverage
        clause_matches = {"u1", "u2", "u3"}
        result = scorer.score_clause(clause_matches, selected_nodes, 10)
        assert result.coverage == 0.0


class TestEnrichmentScorerRobustness:
    """Test robustness and edge case handling."""

    def test_minimum_support_enforcement(self):
        """Test strict enforcement of minimum support constraint."""
        min_tau = 10
        scorer = EnrichmentScorer(min_support_tau=min_tau)

        selected_nodes = {f"s_{i}" for i in range(30)}
        total_nodes = 100

        # Test support exactly at threshold
        clause_matches = {f"s_{i}" for i in range(8)} | {"u1", "u2"}  # support = 10
        result = scorer.score_clause(clause_matches, selected_nodes, total_nodes)
        assert result.support == min_tau
        if result.pi_clause > result.pi:
            assert result.is_valid

        # Test support below threshold
        clause_matches = {f"s_{i}" for i in range(7)} | {"u1", "u2"}  # support = 9
        result = scorer.score_clause(clause_matches, selected_nodes, total_nodes)
        assert result.support < min_tau
        assert not result.is_valid
        assert result.score == float("-inf")

    def test_extreme_enrichment_scenarios(self):
        """Test behavior with extreme enrichment ratios."""
        scorer = EnrichmentScorer(min_support_tau=5)

        selected_nodes = {f"s_{i}" for i in range(10)}  # π = 0.1
        total_nodes = 100

        # Perfect enrichment: π_clause = 1.0
        clause_matches = {f"s_{i}" for i in range(10)}  # All selected, no unselected
        result = scorer.score_clause(clause_matches, selected_nodes, total_nodes)

        assert result.pi_clause == 1.0
        assert result.is_valid
        assert abs(result.score - 10 * math.log(1.0 / 0.1)) < 1e-10
        assert not math.isinf(result.score)
        assert not math.isnan(result.score)

    def test_large_scale_numerical_stability(self):
        """Test numerical stability with large graphs."""
        scorer = EnrichmentScorer(min_support_tau=100)

        # Large graph: 100K nodes, 10K selected
        total_nodes = 100000
        selected_nodes = {f"s_{i}" for i in range(10000)}  # π = 0.1

        # Large clause: 5K selected + 5K unselected = 10K support
        clause_matches = {f"s_{i}" for i in range(5000)} | {
            f"u_{i}" for i in range(5000)
        }

        result = scorer.score_clause(clause_matches, selected_nodes, total_nodes)

        assert result.p == 5000
        assert result.n == 5000
        assert result.support == 10000
        assert result.pi == 0.1
        assert result.pi_clause == 0.5
        assert result.is_valid

        expected_score = 5000 * math.log(0.5 / 0.1) + 5000 * math.log(0.5 / 0.9)
        assert abs(result.score - expected_score) < 1e-6
        assert not math.isinf(result.score)
        assert not math.isnan(result.score)

    def test_adaptive_min_support_computation(self):
        """Test adaptive minimum support threshold computation."""
        # Small graphs
        assert EnrichmentScorer.compute_min_support_tau(50) == 5
        assert EnrichmentScorer.compute_min_support_tau(100) == 5

        # Medium graphs
        assert EnrichmentScorer.compute_min_support_tau(1000) == 10
        assert EnrichmentScorer.compute_min_support_tau(2000) == 20

        # Large graphs
        assert EnrichmentScorer.compute_min_support_tau(10000) == 100
        assert EnrichmentScorer.compute_min_support_tau(100000) == 1000

    def test_degenerate_input_handling(self):
        """Test handling of degenerate inputs."""
        scorer = EnrichmentScorer(min_support_tau=5)

        # Empty graphs
        result = scorer.score_clause(set(), set(), 0)
        assert not result.is_valid

        # Empty selection
        result = scorer.score_clause({"n1", "n2"}, set(), 10)
        assert not result.is_valid

        # Empty clause matches
        result = scorer.score_clause(set(), {"s1", "s2"}, 10)
        assert not result.is_valid

        # All nodes selected (π = 1, no enrichment possible)
        all_nodes = {f"n_{i}" for i in range(10)}
        result = scorer.score_clause({"n_0", "n_1"}, all_nodes, 10)
        assert not result.is_valid

    def test_precision_with_floating_point_arithmetic(self):
        """Test precision with challenging floating-point scenarios."""
        scorer = EnrichmentScorer(min_support_tau=3)

        # Test with values that could cause floating-point precision issues
        selected_nodes = {f"s_{i}" for i in range(3)}  # π = 3/7 ≈ 0.428571
        total_nodes = 7

        clause_matches = {"s_0", "s_1", "u_0"}  # π_clause = 2/3 ≈ 0.666667

        result = scorer.score_clause(clause_matches, selected_nodes, total_nodes)

        # Verify precise calculations
        expected_pi = 3.0 / 7.0
        expected_pi_clause = 2.0 / 3.0
        expected_score = 2.0 * math.log(
            expected_pi_clause / expected_pi
        ) + 1.0 * math.log((1.0 - expected_pi_clause) / (1.0 - expected_pi))

        assert abs(result.pi - expected_pi) < 1e-15
        assert abs(result.pi_clause - expected_pi_clause) < 1e-15
        assert abs(result.score - expected_score) < 1e-12


class TestEnrichmentScorerStatisticalProperties:
    """Test statistical properties and theoretical guarantees."""

    def test_score_invariance_under_graph_scaling(self):
        """Test that relative scores are preserved under proportional scaling."""
        min_tau = 5
        scorer = EnrichmentScorer(min_support_tau=min_tau)

        # Original scenario
        selected1 = {f"s_{i}" for i in range(20)}
        total1 = 100
        clause1 = {f"s_{i}" for i in range(12)} | {f"u_{i}" for i in range(8)}

        result1 = scorer.score_clause(clause1, selected1, total1)

        # Scaled scenario (2x)
        selected2 = {f"s_{i}" for i in range(40)}
        total2 = 200
        clause2 = {f"s_{i}" for i in range(24)} | {f"u_{i}" for i in range(16)}

        result2 = scorer.score_clause(clause2, selected2, total2)

        # Same enrichment rates
        assert abs(result1.pi - result2.pi) < 1e-10
        assert abs(result1.pi_clause - result2.pi_clause) < 1e-10

        # Score should scale proportionally
        assert abs(result2.score / result1.score - 2.0) < 1e-10

    def test_information_theoretic_properties(self):
        """Test information-theoretic properties of the scoring function."""
        scorer = EnrichmentScorer(min_support_tau=5)

        {f"s_{i}" for i in range(25)}  # π = 0.25

        # Test that score increases with "surprise" (lower baseline rate)
        scenarios = [
            ({f"s_{i}" for i in range(50)}, 100),
            ({f"s_{i}" for i in range(20)}, 100),
            ({f"s_{i}" for i in range(15)}, 100),
        ]

        clause_matches = {f"s_{i}" for i in range(15)} | {
            f"u_{i}" for i in range(5)
        }  # π_clause = 15/20 = 0.75

        scores = []
        for selected, total in scenarios:
            result = scorer.score_clause(clause_matches, selected, total)
            if result.is_valid:
                scores.append(result.score)

        # Score should increase as baseline rate decreases (more surprising)
        for i in range(1, len(scores)):
            assert (
                scores[i] > scores[i - 1]
            ), "Score should increase as baseline rate decreases"

    def test_statistical_significance_correlation(self):
        """Test correlation between enrichment score and statistical significance."""
        scorer = EnrichmentScorer(min_support_tau=10)

        selected_nodes = {f"s_{i}" for i in range(100)}  # π = 0.1
        total_nodes = 1000

        test_cases = [
            # (p_selected, p_total, expected_relative_score)
            (90, 100, "highest"),  # Very strong enrichment
            (60, 100, "high"),  # Strong enrichment
            (30, 100, "medium"),  # Moderate enrichment
            (15, 100, "low"),  # Weak enrichment
        ]

        scores = []
        for p_sel, p_tot, _ in test_cases:
            n_unsel = p_tot - p_sel
            clause_matches = {f"s_{i}" for i in range(p_sel)} | {
                f"u_{i}" for i in range(n_unsel)
            }

            result = scorer.score_clause(clause_matches, selected_nodes, total_nodes)
            scores.append(result.score)

        # Scores should be ordered by statistical significance
        assert all(
            scores[i] > scores[i + 1] for i in range(len(scores) - 1)
        ), "Scores should decrease as enrichment decreases"


class TestMarginalGainScoring:
    def test_score_union_empty_returns_zero(self):
        scorer = EnrichmentScorer(min_support_tau=5)
        selected = {f"s_{i}" for i in range(10)}
        assert scorer.score_union(set(), selected, 100) == 0.0

    def test_score_union_non_enriched_returns_zero(self):
        scorer = EnrichmentScorer(min_support_tau=3)
        selected = {f"s_{i}" for i in range(20)}
        clause = {f"s_{i}" for i in range(4)} | {f"u_{i}" for i in range(16)}
        assert scorer.score_union(clause, selected, 100) == 0.0

    def test_score_union_enriched_matches_score_clause(self):
        scorer = EnrichmentScorer(min_support_tau=5)
        selected = {f"s_{i}" for i in range(30)}
        union_matches = {f"s_{i}" for i in range(20)} | {f"u_{i}" for i in range(10)}
        score_from_union = scorer.score_union(union_matches, selected, 100)
        score_from_clause = scorer.score_clause(union_matches, selected, 100)
        assert score_from_union > 0.0
        assert abs(score_from_union - score_from_clause.score) < 1e-10

    def test_score_union_ignores_min_support_tau(self):
        scorer = EnrichmentScorer(min_support_tau=100)
        selected = {f"s_{i}" for i in range(30)}
        small_union = {f"s_{i}" for i in range(8)} | {f"u_{i}" for i in range(2)}
        score = scorer.score_union(small_union, selected, 100)
        score_clause = scorer.score_clause(small_union, selected, 100)
        assert score > 0.0
        assert score_clause.score == float("-inf")

    def test_marginal_gain_first_clause_equals_score_union(self):
        scorer = EnrichmentScorer(min_support_tau=5)
        selected = {f"s_{i}" for i in range(30)}
        candidate = {f"s_{i}" for i in range(20)} | {f"u_{i}" for i in range(10)}
        mg = scorer.marginal_gain(candidate, set(), selected, 100)
        assert abs(mg - scorer.score_union(candidate, selected, 100)) < 1e-10

    def test_marginal_gain_complementary_clauses(self):
        scorer = EnrichmentScorer(min_support_tau=3)
        selected = {f"s_{i}" for i in range(20)}
        total = 100

        existing = {f"s_{i}" for i in range(10)} | {f"u_{i}" for i in range(5)}
        complement = {f"s_{i}" for i in range(10, 20)} | {
            f"u_{i}" for i in range(5, 10)
        }
        redundant = {f"s_{i}" for i in range(10)} | {f"u_{i}" for i in range(5)}

        mg_complement = scorer.marginal_gain(complement, existing, selected, total)
        mg_redundant = scorer.marginal_gain(redundant, existing, selected, total)

        assert mg_complement > 0.0
        assert mg_complement > mg_redundant

    def test_marginal_gain_purely_redundant_clause_is_zero(self):
        scorer = EnrichmentScorer(min_support_tau=3)
        selected = {f"s_{i}" for i in range(20)}
        total = 100

        existing = {f"s_{i}" for i in range(15)} | {f"u_{i}" for i in range(5)}
        identical = set(existing)

        mg = scorer.marginal_gain(identical, existing, selected, total)
        assert mg == 0.0

    def test_marginal_gain_adding_negatives_reduces_gain(self):
        scorer = EnrichmentScorer(min_support_tau=3)
        selected = {f"s_{i}" for i in range(20)}
        total = 100

        existing = {f"s_{i}" for i in range(10)} | {f"u_{i}" for i in range(5)}

        good_candidate = {f"s_{i}" for i in range(10, 20)} | {
            f"u_{i}" for i in range(5, 8)
        }
        bad_candidate = {f"s_{i}" for i in range(10, 20)} | {
            f"u_{i}" for i in range(5, 40)
        }

        mg_good = scorer.marginal_gain(good_candidate, existing, selected, total)
        mg_bad = scorer.marginal_gain(bad_candidate, existing, selected, total)

        assert mg_good > mg_bad

    def test_marginal_gain_submodularity(self):
        scorer = EnrichmentScorer(min_support_tau=3)
        selected = {f"s_{i}" for i in range(30)}
        total = 100

        c1 = {f"s_{i}" for i in range(15)} | {f"u_{i}" for i in range(5)}
        c2 = {f"s_{i}" for i in range(10, 25)} | {f"u_{i}" for i in range(3, 8)}

        mg_c2_given_empty = scorer.marginal_gain(c2, set(), selected, total)
        mg_c2_given_c1 = scorer.marginal_gain(c2, c1, selected, total)

        assert mg_c2_given_empty >= mg_c2_given_c1

    def test_score_union_degenerate_total_nodes(self):
        scorer = EnrichmentScorer(min_support_tau=1)
        selected = {"s1"}
        assert scorer.score_union({"s1"}, selected, 0) == 0.0
        assert scorer.score_union({"s1"}, set(), 10) == 0.0
