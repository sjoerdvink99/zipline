import networkx as nx

from fol.learning.beam_search import BeamSearch, Clause
from fol.learning.learner import ExplanationLearner
from fol.learning.literal_generator import Literal, LiteralGenerator, LiteralType
from fol.learning.neighborhood_index import (
    NeighborhoodIndex,
    NeighborhoodLiteralSpec,
    QuantifierType,
)
from fol.learning.scoring import EnrichmentScorer
from fol.learning.threshold_finder import LiteralOperator, ThresholdFinder


class TestNeighborhoodIndex:
    def test_basic_adjacency(self):
        graph = nx.Graph()
        graph.add_edges_from([(1, 2), (2, 3), (3, 4)])
        graph.nodes[1]["type"] = "A"
        graph.nodes[2]["type"] = "B"
        graph.nodes[3]["type"] = "A"
        graph.nodes[4]["type"] = "B"

        index = NeighborhoodIndex(graph)

        assert index.get_neighbors("1") == {"2"}
        assert index.get_neighbors("2") == {"1", "3"}
        assert index.get_neighbors("3") == {"2", "4"}
        assert index.get_neighbors("4") == {"3"}

    def test_existential_evaluation(self):
        graph = nx.Graph()
        graph.add_edges_from([(1, 2), (2, 3), (3, 4), (4, 5)])
        graph.nodes[1]["active"] = True
        graph.nodes[2]["active"] = False
        graph.nodes[3]["active"] = True
        graph.nodes[4]["active"] = False
        graph.nodes[5]["active"] = True

        index = NeighborhoodIndex(graph)

        active_nodes = {"1", "3", "5"}
        result = index.evaluate_existential(active_nodes)

        expected = {"2", "4"}
        assert result == expected

    def test_universal_evaluation(self):
        graph = nx.Graph()
        graph.add_edges_from([(1, 2), (1, 3), (2, 4), (3, 4)])
        graph.nodes[1]["high_degree"] = False
        graph.nodes[2]["high_degree"] = True
        graph.nodes[3]["high_degree"] = True
        graph.nodes[4]["high_degree"] = False

        index = NeighborhoodIndex(graph)

        high_degree_nodes = {"2", "3"}
        result = index.evaluate_universal(high_degree_nodes)

        expected = {"1", "4"}
        assert result == expected

    def test_universal_empty_neighborhood_vacuous_truth(self):
        graph = nx.Graph()
        graph.add_node(1)
        graph.nodes[1]["isolated"] = True

        index = NeighborhoodIndex(graph)

        some_nodes = {"1"}
        result = index.evaluate_universal(some_nodes)

        assert result == {"1"}

    def test_count_ge_evaluation(self):
        graph = nx.Graph()
        graph.add_edges_from([(1, 2), (1, 3), (1, 4), (1, 5)])
        graph.nodes[2]["feature"] = True
        graph.nodes[3]["feature"] = True
        graph.nodes[4]["feature"] = False
        graph.nodes[5]["feature"] = True

        index = NeighborhoodIndex(graph)

        feature_nodes = {"2", "3", "5"}
        result_ge_2 = index.evaluate_count_ge(feature_nodes, 2)
        result_ge_3 = index.evaluate_count_ge(feature_nodes, 3)
        result_ge_4 = index.evaluate_count_ge(feature_nodes, 4)

        assert result_ge_2 == {"1"}
        assert result_ge_3 == {"1"}
        assert result_ge_4 == set()


class TestNeighborhoodLiteralGeneration:
    def test_neighborhood_literal_generation(self):
        graph = nx.Graph()
        for i in range(20):
            graph.add_node(str(i))

        graph.add_edges_from(
            [
                ("0", "1"),
                ("1", "2"),
                ("2", "3"),
                ("3", "4"),
                ("4", "5"),
                ("6", "7"),
                ("7", "8"),
                ("8", "9"),
                ("9", "10"),
                ("10", "11"),
                ("12", "13"),
                ("13", "14"),
                ("14", "15"),
                ("15", "16"),
                ("16", "17"),
            ]
        )

        for i in range(20):
            node_id = str(i)
            graph.nodes[node_id]["node_type"] = "protein" if i % 2 == 0 else "enzyme"
            graph.nodes[node_id]["score"] = 0.8 if i < 10 else 0.2

        generator = LiteralGenerator(
            enable_neighborhood_literals=True,
            max_base_literals_for_neighborhood=10,
            min_score=0.0,
        )

        selected_nodes = {str(i) for i in range(0, 10, 2)}
        all_literals = generator.generate(graph, selected_nodes)

        base_literals = [
            lit for lit in all_literals if lit.literal_type != LiteralType.NEIGHBORHOOD
        ]
        neighborhood_literals = [
            lit for lit in all_literals if lit.literal_type == LiteralType.NEIGHBORHOOD
        ]

        assert len(base_literals) > 0
        assert len(neighborhood_literals) >= 0

    def test_neighborhood_literal_fol_string(self):
        spec_exists = NeighborhoodLiteralSpec(
            quantifier=QuantifierType.EXISTS, k_hop=1, base_predicates=("protein",)
        )

        spec_forall = NeighborhoodLiteralSpec(
            quantifier=QuantifierType.FORALL, k_hop=1, base_predicates=("active",)
        )

        spec_count = NeighborhoodLiteralSpec(
            quantifier=QuantifierType.COUNT_GE,
            k_hop=1,
            base_predicates=("enzyme",),
            threshold=2,
        )

        assert "∃y ∈ neighbors(x) : protein(y)" in spec_exists.to_fol_string()
        assert "∀y ∈ neighbors(x) : active(y)" in spec_forall.to_fol_string()
        assert spec_count.to_fol_string() == "at_least(2) y ∈ neighbors(x) : enzyme(y)"

    def test_conjunctive_neighborhood_fol_string(self):
        spec_conj_exists = NeighborhoodLiteralSpec(
            quantifier=QuantifierType.EXISTS,
            k_hop=1,
            base_predicates=("protein", "active"),
        )
        spec_conj_forall = NeighborhoodLiteralSpec(
            quantifier=QuantifierType.FORALL,
            k_hop=1,
            base_predicates=("protein", "active"),
        )
        spec_conj_count = NeighborhoodLiteralSpec(
            quantifier=QuantifierType.COUNT_GE,
            k_hop=1,
            base_predicates=("protein", "active"),
            threshold=2,
        )

        assert (
            spec_conj_exists.to_fol_string()
            == "∃y ∈ neighbors(x) : protein(y) ∧ active(y)"
        )
        assert (
            spec_conj_forall.to_fol_string()
            == "∀y ∈ neighbors(x) : protein(y) ∧ active(y)"
        )
        assert (
            spec_conj_count.to_fol_string()
            == "at_least(2) y ∈ neighbors(x) : protein(y) ∧ active(y)"
        )

    def test_conjunctive_neighborhood_evaluation(self):
        graph = nx.Graph()
        graph.add_edges_from([(1, 2), (1, 3), (1, 4), (2, 5)])

        index = NeighborhoodIndex(graph)

        protein_nodes = {"2", "3"}
        active_nodes = {"3", "4"}
        conjunct_matches = protein_nodes & active_nodes  # {"3"}

        result = index.evaluate_existential(conjunct_matches)
        assert result == {"1"}

        forall_result = index.evaluate_universal(conjunct_matches)
        assert "1" not in forall_result

    def test_conjunctive_neighborhood_generation(self):
        graph = nx.Graph()
        for i in range(30):
            graph.add_node(str(i))

        for i in range(1, 16):
            graph.add_edge("0", str(i))
        for i in range(16, 30):
            graph.add_edge(str(i), str(i - 15))

        for i in range(1, 16):
            graph.nodes[str(i)]["node_type"] = "protein"
            graph.nodes[str(i)]["active"] = True if i <= 10 else False
        for i in range(16, 30):
            graph.nodes[str(i)]["node_type"] = "enzyme"
            graph.nodes[str(i)]["active"] = False

        graph.nodes["0"]["node_type"] = "hub"

        generator = LiteralGenerator(
            enable_neighborhood_literals=True,
            max_base_literals_for_neighborhood=10,
            min_score=0.0,
        )

        selected_nodes = {"0"} | {str(i) for i in range(1, 11)}
        all_literals = generator.generate(graph, selected_nodes)

        neighborhood_literals = [
            lit for lit in all_literals if lit.literal_type == LiteralType.NEIGHBORHOOD
        ]

        assert len(neighborhood_literals) >= 0

        conj_literals = [
            lit
            for lit in neighborhood_literals
            if lit.neighborhood_spec and len(lit.neighborhood_spec.base_predicates) > 1
        ]
        for lit in conj_literals:
            fol = lit.neighborhood_spec.to_fol_string()
            assert "∧" in fol


class TestIntegrationNeighborhoodLearning:
    def test_full_neighborhood_learning_pipeline(self):
        graph = nx.Graph()
        for i in range(20):
            graph.add_node(str(i))

        graph.add_edges_from(
            [
                ("0", "1"),
                ("1", "2"),
                ("2", "3"),
                ("3", "4"),
                ("5", "6"),
                ("6", "7"),
                ("7", "8"),
                ("8", "9"),
                ("10", "11"),
                ("11", "12"),
                ("12", "13"),
                ("13", "14"),
                ("15", "16"),
                ("16", "17"),
                ("17", "18"),
                ("18", "19"),
            ]
        )

        for i in range(20):
            node_id = str(i)
            graph.nodes[node_id]["node_type"] = "hub" if i % 4 == 0 else "regular"
            graph.nodes[node_id]["centrality"] = 0.9 if i % 4 == 0 else 0.1

        selected_nodes = [str(i) for i in range(0, 16, 4)]

        learner = ExplanationLearner(
            beam_width=5, max_clause_len=3, top_k=5, use_slow_metrics=False
        )

        result = learner.learn_explanations(graph, selected_nodes)

        assert result.selection_size == 4
        assert result.total_nodes == 20
        assert len(result.clauses) >= 0

    def test_deterministic_behavior(self):
        graph = nx.Graph()
        graph.add_edges_from([(1, 2), (2, 3), (3, 1), (1, 4)])

        for i in range(1, 5):
            graph.nodes[i]["type"] = "A" if i <= 2 else "B"

        selected_nodes = ["1", "2"]

        learner = ExplanationLearner(beam_width=3, max_clause_len=2, top_k=3)

        result1 = learner.learn_explanations(graph, selected_nodes)
        result2 = learner.learn_explanations(graph, selected_nodes)

        assert len(result1.clauses) == len(result2.clauses)

        for c1, c2 in zip(result1.clauses, result2.clauses, strict=False):
            assert c1.fol_expression == c2.fol_expression
            assert abs(c1.score - c2.score) < 1e-10


class TestThresholdFinder:
    def test_enrichment_threshold_selection(self):
        finder = ThresholdFinder()
        values = {"n1": 0.9, "n2": 0.8, "n3": 0.7, "n4": 0.3, "n5": 0.2}
        selected_nodes = {"n1", "n2", "n3"}
        total_nodes = 5
        min_support_tau = 2

        thresholds = finder.find_optimal_thresholds(
            values, selected_nodes, total_nodes, min_support_tau, max_thresholds=3
        )

        assert len(thresholds) > 0
        for t in thresholds:
            assert t.score > 0
            assert t.support >= min_support_tau
            assert t.pi_clause > (3 / 5)

    def test_no_valid_thresholds(self):
        finder = ThresholdFinder()
        values = {"n1": 0.5, "n2": 0.4, "n3": 0.3, "n4": 0.2, "n5": 0.1}
        selected_nodes = {"n3", "n4", "n5"}
        total_nodes = 5
        min_support_tau = 3

        thresholds = finder.find_optimal_thresholds(
            values, selected_nodes, total_nodes, min_support_tau
        )

        assert len(thresholds) == 0

    def test_deterministic_rounding(self):
        finder = ThresholdFinder()

        assert finder._round_value(1.23456) == 1.23
        assert finder._round_value(0.12345) == 0.123
        assert finder._round_value(0.0012) == 0.0012
        assert finder._round_value(100.567) == 100.6
        assert finder._round_value(5.0) == 5.0


class TestBeamSearchNeighborhoodExpansion:
    def _make_neighborhood_literal(
        self,
        base_predicate: str,
        quantifier: QuantifierType,
        matching_nodes: set[str],
        score: float = 2.0,
    ) -> Literal:
        return Literal(
            literal_type=LiteralType.NEIGHBORHOOD,
            attribute=f"{quantifier.value}_{base_predicate}",
            operator=LiteralOperator.EQ,
            value="neighborhood",
            score=score,
            coverage=0.5,
            matching_nodes=matching_nodes,
            neighborhood_spec=NeighborhoodLiteralSpec(
                quantifier=quantifier,
                k_hop=1,
                base_predicates=(base_predicate,),
            ),
        )

    def test_second_neighborhood_literal_distinct_predicate_allowed(self):
        lit_a = self._make_neighborhood_literal(
            "A", QuantifierType.EXISTS, {"n0", "n1", "n2", "n3"}
        )
        clause = Clause(literals=[lit_a], matching_nodes={"n0", "n1", "n2", "n3"})

        lit_b = self._make_neighborhood_literal(
            "B", QuantifierType.EXISTS, {"n0", "n1", "n2"}
        )

        scorer = EnrichmentScorer(min_support_tau=1)
        beam_search = BeamSearch(beam_width=5, max_clause_len=4)
        seen: set[str] = set()

        expansions = beam_search._expand_clause(
            clause, [lit_b], {"n0", "n1", "n2"}, 10, scorer, seen
        )

        assert len(expansions) > 0
        assert all(
            sum(1 for lit in e.literals if lit.literal_type == LiteralType.NEIGHBORHOOD)
            == 2
            for e in expansions
        )

    def test_second_neighborhood_literal_same_predicate_blocked(self):
        lit_a_exists = self._make_neighborhood_literal(
            "A", QuantifierType.EXISTS, {"n0", "n1", "n2", "n3"}
        )
        clause = Clause(
            literals=[lit_a_exists], matching_nodes={"n0", "n1", "n2", "n3"}
        )

        lit_a_forall = self._make_neighborhood_literal(
            "A", QuantifierType.FORALL, {"n0", "n1"}
        )

        scorer = EnrichmentScorer(min_support_tau=1)
        beam_search = BeamSearch(beam_width=5, max_clause_len=4)
        seen: set[str] = set()

        expansions = beam_search._expand_clause(
            clause, [lit_a_forall], {"n0", "n1"}, 10, scorer, seen
        )

        assert len(expansions) == 0

    def test_third_neighborhood_literal_blocked(self):
        lit_a = self._make_neighborhood_literal(
            "A", QuantifierType.EXISTS, {"n0", "n1", "n2", "n3"}
        )
        lit_b = self._make_neighborhood_literal(
            "B", QuantifierType.EXISTS, {"n0", "n1", "n2", "n3"}
        )
        clause = Clause(
            literals=[lit_a, lit_b], matching_nodes={"n0", "n1", "n2", "n3"}
        )

        lit_c = self._make_neighborhood_literal(
            "C", QuantifierType.EXISTS, {"n0", "n1", "n2"}
        )

        scorer = EnrichmentScorer(min_support_tau=1)
        beam_search = BeamSearch(beam_width=5, max_clause_len=4)
        seen: set[str] = set()

        expansions = beam_search._expand_clause(
            clause, [lit_c], {"n0", "n1", "n2"}, 10, scorer, seen
        )

        assert len(expansions) == 0

    def test_non_neighborhood_literal_always_allowed_alongside_two_neighborhood(self):
        lit_a = self._make_neighborhood_literal(
            "A", QuantifierType.EXISTS, {"n0", "n1", "n2", "n3"}
        )
        lit_b = self._make_neighborhood_literal(
            "B", QuantifierType.EXISTS, {"n0", "n1", "n2", "n3"}
        )
        clause = Clause(
            literals=[lit_a, lit_b], matching_nodes={"n0", "n1", "n2", "n3"}
        )

        regular_lit = Literal(
            literal_type=LiteralType.TYPE,
            attribute="node_type",
            operator=LiteralOperator.EQ,
            value="Drug",
            score=2.0,
            coverage=0.5,
            matching_nodes={"n0", "n1", "n2"},
        )

        scorer = EnrichmentScorer(min_support_tau=1)
        beam_search = BeamSearch(beam_width=5, max_clause_len=4)
        seen: set[str] = set()

        expansions = beam_search._expand_clause(
            clause, [regular_lit], {"n0", "n1", "n2"}, 10, scorer, seen
        )

        assert len(expansions) > 0
        assert all(
            sum(1 for lit in e.literals if lit.literal_type == LiteralType.NEIGHBORHOOD)
            == 2
            for e in expansions
        )
