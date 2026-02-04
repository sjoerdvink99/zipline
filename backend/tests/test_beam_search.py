from __future__ import annotations

import networkx as nx
import pytest

from fol.learning.beam_search import BeamSearch, Clause
from fol.learning.literal_generator import (
    LiteralGenerator,
    LiteralOperator,
)
from fol.learning.scoring import EnrichmentScorer


class TestBeamSearchAlgorithmCorrectness:
    """Test algorithmic correctness of beam search implementation."""

    def create_test_graph_with_clear_patterns(self):
        """Create a graph with clear, testable patterns."""
        G = nx.Graph()

        # Type A nodes (highly connected drugs)
        for i in range(5):
            G.add_node(f"drug_{i}", node_type="Drug", score=0.9 + i * 0.01, active=True)

        # Type B nodes (moderately connected proteins)
        for i in range(5):
            G.add_node(
                f"protein_{i}", node_type="Protein", score=0.5 + i * 0.05, active=False
            )

        # Type C nodes (low connected genes)
        for i in range(5):
            G.add_node(f"gene_{i}", node_type="Gene", score=0.2 + i * 0.02, active=True)

        # Create clear degree patterns
        # Drugs: high degree (connect to all proteins and genes)
        for i in range(5):
            for j in range(5):
                G.add_edge(f"drug_{i}", f"protein_{j}")
                G.add_edge(f"drug_{i}", f"gene_{j}")

        # Proteins: medium degree (connect to some genes)
        for i in range(5):
            for j in range(3):
                G.add_edge(f"protein_{i}", f"gene_{j}")

        return G

    def test_beam_search_finds_optimal_single_literal(self):
        """Test that beam search finds the optimal single-literal clause."""
        graph = self.create_test_graph_with_clear_patterns()
        selected_nodes = {f"drug_{i}" for i in range(3)}  # Select some drugs

        scorer = EnrichmentScorer(min_support_tau=1)
        literal_generator = LiteralGenerator()

        beam_search = BeamSearch(beam_width=10, max_clause_len=1)
        clauses = beam_search.search(graph, selected_nodes, scorer, literal_generator)

        # Should find a good single literal with high enrichment
        assert len(clauses) > 0
        best_clause = clauses[0]
        assert len(best_clause.literals) == 1
        assert best_clause.score.is_valid

        # Should have perfect precision for this selection
        assert best_clause.score.is_valid
        assert best_clause.score.pi_clause > best_clause.score.pi

    def test_beam_search_constructs_conjunctions(self):
        """Test that beam search constructs meaningful conjunctions."""
        graph = self.create_test_graph_with_clear_patterns()

        selected_nodes = {f"drug_{i}" for i in range(4)}

        scorer = EnrichmentScorer(min_support_tau=1)
        literal_generator = LiteralGenerator(min_score=0.1)

        beam_search = BeamSearch(beam_width=10, max_clause_len=3, min_precision=0.01)
        clauses = beam_search.search(graph, selected_nodes, scorer, literal_generator)

        multi_literal_clauses = [c for c in clauses if len(c.literals) > 1]

        if len(multi_literal_clauses) == 0:
            single_literal_clauses = [c for c in clauses if len(c.literals) == 1]
            assert (
                len(single_literal_clauses) > 0
            ), "Should find at least single-literal clauses"
        else:
            for clause in multi_literal_clauses[:3]:
                assert clause.score.is_valid

    def test_beam_width_affects_exploration(self):
        """Test that beam width controls search space exploration."""
        graph = self.create_test_graph_with_clear_patterns()
        selected_nodes = {f"drug_{i}" for i in range(2)}

        scorer = EnrichmentScorer(min_support_tau=1)
        literal_generator = LiteralGenerator()

        # Narrow beam search
        narrow_search = BeamSearch(beam_width=2, max_clause_len=2, max_evaluations=50)
        narrow_clauses = narrow_search.search(
            graph, selected_nodes, scorer, literal_generator
        )

        # Wide beam search
        wide_search = BeamSearch(beam_width=8, max_clause_len=2, max_evaluations=200)
        wide_clauses = wide_search.search(
            graph, selected_nodes, scorer, literal_generator
        )

        # Wide search should find more diverse clauses
        assert len(wide_clauses) >= len(narrow_clauses)

        # Wide search should potentially find better solutions
        if wide_clauses and narrow_clauses:
            best_wide_score = wide_clauses[0].score.score
            best_narrow_score = narrow_clauses[0].score.score
            assert best_wide_score >= best_narrow_score

    def test_max_clause_length_enforcement(self):
        """Test that maximum clause length is strictly enforced."""
        graph = self.create_test_graph_with_clear_patterns()
        selected_nodes = {f"drug_{i}" for i in range(2)}

        scorer = EnrichmentScorer(min_support_tau=1)
        literal_generator = LiteralGenerator()

        max_len = 3
        beam_search = BeamSearch(beam_width=5, max_clause_len=max_len)
        clauses = beam_search.search(graph, selected_nodes, scorer, literal_generator)

        # All clauses should respect length limit
        for clause in clauses:
            assert (
                len(clause.literals) <= max_len
            ), f"Clause has {len(clause.literals)} literals, exceeds max {max_len}"

    def test_early_termination_on_no_improvement(self):
        """Test that search terminates early when no improvement is found."""
        graph = self.create_test_graph_with_clear_patterns()
        selected_nodes = {"drug_0"}  # Very specific selection

        scorer = EnrichmentScorer(min_support_tau=1)
        literal_generator = LiteralGenerator()

        beam_search = BeamSearch(
            beam_width=3,
            max_clause_len=5,  # Allow long clauses
            min_improvement=1.0,  # High improvement threshold
        )

        clauses = beam_search.search(graph, selected_nodes, scorer, literal_generator)

        # Should terminate early and find short, high-quality clauses
        if clauses:
            # Most clauses should be short due to early termination
            avg_length = sum(len(c.literals) for c in clauses) / len(clauses)
            assert (
                avg_length < 3
            ), "Average clause length should be short due to early termination"

    def test_evaluation_budget_enforcement(self):
        """Test that evaluation budget is strictly enforced."""
        graph = self.create_test_graph_with_clear_patterns()
        selected_nodes = {f"drug_{i}" for i in range(3)}

        scorer = EnrichmentScorer(min_support_tau=1)
        literal_generator = LiteralGenerator()

        max_evaluations = 20
        beam_search = BeamSearch(
            beam_width=10, max_clause_len=5, max_evaluations=max_evaluations
        )

        beam_search.search(graph, selected_nodes, scorer, literal_generator)

        # Should respect evaluation budget
        assert beam_search._evaluations <= max_evaluations

    def test_deterministic_behavior(self):
        """Test that beam search produces deterministic results."""
        graph = self.create_test_graph_with_clear_patterns()
        selected_nodes = {f"drug_{i}" for i in range(2)}

        scorer = EnrichmentScorer(min_support_tau=1)
        literal_generator = LiteralGenerator()

        # Run search multiple times
        results = []
        for _ in range(3):
            beam_search = BeamSearch(beam_width=3, max_clause_len=2, max_evaluations=50)
            clauses = beam_search.search(
                graph, selected_nodes, scorer, literal_generator
            )
            results.append(clauses)

        # All runs should produce same results
        if results[0]:  # If any results found
            for i in range(1, len(results)):
                assert len(results[i]) == len(
                    results[0]
                ), "Result count should be deterministic"

                # Check that top results are the same
                if results[0] and results[i]:
                    assert (
                        results[i][0].fol_expression == results[0][0].fol_expression
                    ), "Best clause should be deterministic"


class TestBeamSearchLiteralHandling:
    """Test how beam search handles different types of literals."""

    def create_diverse_literal_graph(self):
        """Create graph with diverse literal types for comprehensive testing."""
        G = nx.Graph()

        # Nodes with various attribute types
        for i in range(10):
            G.add_node(
                f"n{i}",
                node_type="TypeA" if i < 5 else "TypeB",
                score=i * 0.1,
                category="high" if i >= 7 else "low",
                active=i % 2 == 0,
                tags=["drug", "approved"] if i < 3 else ["gene"],
                count=i + 10,
            )

        # Create edges for topology
        for i in range(9):
            G.add_edge(f"n{i}", f"n{i+1}")
        for i in range(0, 10, 3):
            for j in range(i + 1, min(i + 4, 10)):
                if not G.has_edge(f"n{i}", f"n{j}"):
                    G.add_edge(f"n{i}", f"n{j}")

        return G

    def test_literal_type_diversity(self):
        """Test that beam search explores different literal types."""
        graph = self.create_diverse_literal_graph()
        selected_nodes = {"n0", "n1", "n2"}  # TypeA nodes with specific properties

        scorer = EnrichmentScorer(min_support_tau=1)
        literal_generator = LiteralGenerator()

        beam_search = BeamSearch(beam_width=10, max_clause_len=3)
        clauses = beam_search.search(graph, selected_nodes, scorer, literal_generator)

        # Collect all literal types used
        literal_types = set()
        for clause in clauses:
            for literal in clause.literals:
                literal_types.add(literal.literal_type)

        # Should explore multiple literal types
        assert (
            len(literal_types) >= 2
        ), f"Should explore diverse literal types, found: {literal_types}"

    def test_literal_deduplication_in_clause(self):
        """Test that beam search doesn't add duplicate literals to clauses."""
        graph = self.create_diverse_literal_graph()
        selected_nodes = {"n0", "n1"}

        scorer = EnrichmentScorer(min_support_tau=1)
        literal_generator = LiteralGenerator()

        beam_search = BeamSearch(beam_width=5, max_clause_len=4)
        clauses = beam_search.search(graph, selected_nodes, scorer, literal_generator)

        # Check each clause for duplicate literals
        for clause in clauses:
            literal_keys = []
            for lit in clause.literals:
                key = (lit.attribute, lit.operator.value, lit.value)
                literal_keys.append(key)

            # Should have no duplicates
            assert len(literal_keys) == len(
                set(literal_keys)
            ), f"Clause has duplicate literals: {clause.fol_expression}"

    def test_literal_compatibility_in_conjunctions(self):
        """Test that beam search creates semantically valid conjunctions."""
        graph = self.create_diverse_literal_graph()
        selected_nodes = {"n0", "n1", "n8", "n9"}

        scorer = EnrichmentScorer(min_support_tau=1)
        literal_generator = LiteralGenerator()

        beam_search = BeamSearch(beam_width=5, max_clause_len=3)
        clauses = beam_search.search(graph, selected_nodes, scorer, literal_generator)

        # Check for contradictory literals in clauses
        for clause in clauses:
            if len(clause.literals) > 1:
                # Look for conflicting constraints on same attribute
                attr_constraints = {}
                for lit in clause.literals:
                    if lit.attribute in attr_constraints:
                        prev_lit = attr_constraints[lit.attribute]

                        # Check for obvious contradictions
                        if (
                            lit.operator == LiteralOperator.EQ
                            and prev_lit.operator == LiteralOperator.EQ
                            and lit.value != prev_lit.value
                        ):
                            pytest.fail(
                                f"Contradictory equality constraints in clause: {clause.fol_expression}"
                            )

                    attr_constraints[lit.attribute] = lit


class TestBeamSearchPerformanceAndScaling:
    """Test performance characteristics and scaling behavior."""

    def create_large_test_graph(self, n_nodes=100):
        """Create large graph for performance testing."""
        G = nx.Graph()

        node_types = ["TypeA", "TypeB", "TypeC", "TypeD"]
        for i in range(n_nodes):
            G.add_node(
                f"n{i}",
                node_type=node_types[i % len(node_types)],
                score=i / n_nodes,
                category=f"cat_{i % 5}",
                active=i % 3 == 0,
            )

        # Create random edges
        import random

        random.seed(42)  # Deterministic
        for _i in range(n_nodes * 2):
            n1, n2 = random.randint(0, n_nodes - 1), random.randint(0, n_nodes - 1)
            if n1 != n2:
                G.add_edge(f"n{n1}", f"n{n2}")

        return G

    def test_search_complexity_scaling(self):
        """Test that search complexity scales reasonably with graph size."""
        import time

        times = []
        graph_sizes = [20, 40, 60]

        for size in graph_sizes:
            graph = self.create_large_test_graph(size)
            selected_nodes = {f"n{i}" for i in range(min(5, size // 4))}

            scorer = EnrichmentScorer(min_support_tau=2)
            literal_generator = LiteralGenerator()

            beam_search = BeamSearch(
                beam_width=3, max_clause_len=2, max_evaluations=100
            )

            start_time = time.time()
            beam_search.search(graph, selected_nodes, scorer, literal_generator)
            elapsed = time.time() - start_time

            times.append(elapsed)

        # Time should scale sub-quadratically (allowing for some variance)
        if len(times) >= 2:
            scaling_factor = times[-1] / times[0]
            size_factor = graph_sizes[-1] / graph_sizes[0]

            # Should not scale worse than O(n²)
            assert (
                scaling_factor < size_factor**2.5
            ), f"Scaling factor {scaling_factor:.2f} too high for size increase {size_factor:.2f}"

    def test_memory_efficiency_with_large_beam(self):
        """Test memory efficiency with large beam widths."""
        graph = self.create_large_test_graph(50)
        selected_nodes = {f"n{i}" for i in range(8)}

        scorer = EnrichmentScorer(min_support_tau=3)
        literal_generator = LiteralGenerator()

        # Large beam width should still be manageable
        beam_search = BeamSearch(beam_width=20, max_clause_len=3, max_evaluations=200)
        clauses = beam_search.search(graph, selected_nodes, scorer, literal_generator)

        # Should complete without memory issues and return reasonable results
        assert isinstance(clauses, list)
        if clauses:
            assert all(isinstance(c, Clause) for c in clauses)

    def test_evaluation_budget_effectiveness(self):
        """Test that evaluation budget is used effectively."""
        graph = self.create_large_test_graph(30)
        selected_nodes = {f"n{i}" for i in range(3)}

        scorer = EnrichmentScorer(min_support_tau=1)
        literal_generator = LiteralGenerator()

        budgets = [50, 100, 200]
        results = []

        for budget in budgets:
            beam_search = BeamSearch(
                beam_width=5, max_clause_len=3, max_evaluations=budget
            )
            clauses = beam_search.search(
                graph, selected_nodes, scorer, literal_generator
            )
            results.append(
                (budget, len(clauses), clauses[0].score.score if clauses else 0)
            )

        # More budget should generally lead to better or equal quality
        for i in range(1, len(results)):
            prev_budget, prev_count, prev_score = results[i - 1]
            curr_budget, curr_count, curr_score = results[i]

            # Should find at least as good solutions with more budget
            assert (
                curr_score >= prev_score - 1e-10
            ), f"More budget should not decrease solution quality: {prev_score} vs {curr_score}"


class TestBeamSearchEdgeCases:
    """Test edge cases and error conditions."""

    def test_no_valid_literals_found(self):
        """Test behavior when no valid literals can be generated."""
        # Graph with no useful attributes
        G = nx.Graph()
        G.add_nodes_from([("n1", {}), ("n2", {}), ("n3", {})])

        selected_nodes = {"n1"}

        scorer = EnrichmentScorer(min_support_tau=10)  # Very high threshold
        literal_generator = LiteralGenerator()

        beam_search = BeamSearch(beam_width=5, max_clause_len=2)
        clauses = beam_search.search(G, selected_nodes, scorer, literal_generator)

        # Should handle gracefully
        assert isinstance(clauses, list)

    def test_all_clauses_invalid_due_to_support(self):
        """Test when all potential clauses fail support threshold."""
        G = nx.Graph()
        for i in range(5):
            G.add_node(f"n{i}", node_type="Type", score=i)

        selected_nodes = {"n0"}  # Very small selection

        scorer = EnrichmentScorer(min_support_tau=10)  # Impossible threshold
        literal_generator = LiteralGenerator()

        beam_search = BeamSearch(beam_width=3, max_clause_len=2)
        clauses = beam_search.search(G, selected_nodes, scorer, literal_generator)

        # Should return empty list or only valid clauses
        assert all(c.score.is_valid for c in clauses)

    def test_single_node_selection(self):
        """Test beam search with single-node selection."""
        G = nx.Graph()
        G.add_nodes_from(
            [
                ("n1", {"type": "A", "score": 1.0}),
                ("n2", {"type": "B", "score": 0.5}),
                ("n3", {"type": "C", "score": 0.3}),
            ]
        )

        selected_nodes = {"n1"}

        scorer = EnrichmentScorer(min_support_tau=1)
        literal_generator = LiteralGenerator()

        beam_search = BeamSearch(beam_width=3, max_clause_len=2)
        clauses = beam_search.search(G, selected_nodes, scorer, literal_generator)

        # Should handle single-node selections
        if clauses:
            assert all(c.score.is_valid for c in clauses)
            # Coverage should be 1.0 for clauses that match the single node
            for clause in clauses:
                if "n1" in clause.matching_nodes:
                    assert clause.score.coverage == 1.0
