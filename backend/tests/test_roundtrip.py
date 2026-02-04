from __future__ import annotations

import networkx as nx

from fol import Evaluator, parse
from fol.learning.learner import ExplanationLearner


def _ast_matching_nodes(graph: nx.Graph, fol_expression: str) -> set[str]:
    ast = parse(fol_expression)
    evaluator = Evaluator()
    result = evaluator.evaluate(graph, ast)
    return set(result.nodes)


def _build_typed_graph() -> nx.Graph:
    G = nx.Graph()
    for i in range(1, 6):
        G.add_node(f"A{i}", type="alpha", score=i * 10, active=True)
    for i in range(1, 4):
        G.add_node(f"B{i}", type="beta", score=i * 5, active=False)
    for i in range(1, 3):
        G.add_node(f"C{i}", type="gamma", score=80 + i, active=True)

    G.add_edge("A1", "B1", edge_type="link")
    G.add_edge("A2", "B1", edge_type="link")
    G.add_edge("A2", "B2", edge_type="link")
    G.add_edge("A3", "B2", edge_type="link")
    G.add_edge("A3", "B3", edge_type="link")
    G.add_edge("A4", "B3", edge_type="link")
    G.add_edge("A5", "C1", edge_type="link")
    G.add_edge("A5", "C2", edge_type="link")
    G.add_edge("B1", "C1", edge_type="bridge")
    G.add_edge("B2", "C2", edge_type="bridge")
    return G


class TestLearnEvaluateRoundtrip:
    def test_conjunctive_expressions_are_parseable(self):
        graph = _build_typed_graph()
        selected = ["A3", "A4", "A5", "C1", "C2"]
        learner = ExplanationLearner(beam_width=5, max_clause_len=3, top_k=3)
        result = learner.learn_explanations(graph, selected)

        for clause in result.clauses:
            ast = parse(clause.fol_expression)
            assert ast is not None, f"Failed to parse: {clause.fol_expression}"

    def test_conjunctive_matching_nodes_are_consistent(self):
        graph = _build_typed_graph()
        selected = ["A3", "A4", "A5", "C1", "C2"]
        learner = ExplanationLearner(beam_width=5, max_clause_len=3, top_k=3)
        result = learner.learn_explanations(graph, selected)

        for clause in result.clauses:
            ast_matches = _ast_matching_nodes(graph, clause.fol_expression)
            learned_matches = set(clause.matching_nodes)
            assert ast_matches == learned_matches, (
                f"Mismatch for '{clause.fol_expression}': "
                f"AST={sorted(ast_matches)}, learned={sorted(learned_matches)}"
            )

    def test_disjunctive_expressions_are_parseable(self):
        graph = _build_typed_graph()
        selected = ["A1", "A2", "C1", "C2"]
        learner = ExplanationLearner(beam_width=5, max_clause_len=3, top_k=3)
        result = learner.learn_disjunctive_predicate(graph, selected, max_clauses=3)

        for clause in result.clauses:
            ast = parse(clause.fol_expression)
            assert ast is not None, f"Failed to parse clause: {clause.fol_expression}"

        if result.combined_expression not in ("⊤", "⊥"):
            ast = parse(result.combined_expression)
            assert (
                ast is not None
            ), f"Failed to parse combined: {result.combined_expression}"

    def test_disjunctive_matching_nodes_are_consistent(self):
        graph = _build_typed_graph()
        selected = ["A1", "A2", "C1", "C2"]
        learner = ExplanationLearner(beam_width=5, max_clause_len=3, top_k=3)
        result = learner.learn_disjunctive_predicate(graph, selected, max_clauses=3)

        for clause in result.clauses:
            ast_matches = _ast_matching_nodes(graph, clause.fol_expression)
            learned_matches = set(clause.matching_nodes)
            assert ast_matches == learned_matches, (
                f"Mismatch for '{clause.fol_expression}': "
                f"AST={sorted(ast_matches)}, learned={sorted(learned_matches)}"
            )

    def test_contrastive_expressions_are_parseable(self):
        graph = _build_typed_graph()
        selected = ["A3", "A4", "A5"]
        contrast = ["B1", "B2", "B3"]
        learner = ExplanationLearner(beam_width=5, max_clause_len=3, top_k=3)
        result = learner.learn_explanations(graph, selected, contrast_nodes=contrast)

        for clause in result.clauses:
            ast = parse(clause.fol_expression)
            assert ast is not None, f"Failed to parse: {clause.fol_expression}"


class TestNeighborhoodFOLRoundtrip:
    def test_exists_roundtrip(self):
        G = nx.Graph()
        G.add_edges_from([("A", "B"), ("A", "C"), ("B", "D")])
        G.nodes["B"]["active"] = True
        G.nodes["C"]["active"] = False
        G.nodes["D"]["active"] = True

        ast_matches = _ast_matching_nodes(G, "∃y ∈ neighbors(x) : active(y)")
        assert "A" in ast_matches
        assert "D" in ast_matches

    def test_forall_roundtrip(self):
        G = nx.Graph()
        G.add_edges_from([("A", "B"), ("A", "C"), ("D", "B")])
        G.nodes["B"]["active"] = True
        G.nodes["C"]["active"] = True

        ast_matches = _ast_matching_nodes(G, "∀y ∈ neighbors(x) : active(y)")
        assert "A" in ast_matches

    def test_forall_vacuous_truth(self):
        G = nx.Graph()
        G.add_node("isolated")
        G.add_edges_from([("A", "B")])
        G.nodes["B"]["active"] = True

        ast_matches = _ast_matching_nodes(G, "∀y ∈ neighbors(x) : active(y)")
        assert "isolated" in ast_matches

    def test_at_least_roundtrip(self):
        G = nx.Graph()
        G.add_edges_from([("A", "B"), ("A", "C"), ("A", "D"), ("E", "B")])
        G.nodes["B"]["hot"] = True
        G.nodes["C"]["hot"] = True
        G.nodes["D"]["hot"] = False

        ast_matches = _ast_matching_nodes(G, "at_least(2) y ∈ neighbors(x) : hot(y)")
        assert "A" in ast_matches
        assert "E" not in ast_matches

    def test_typed_path_roundtrip(self):
        G = nx.Graph()
        G.add_node("X", type="source")
        G.add_node("M", type="hub")
        G.add_node("T1", type="target", active=True)
        G.add_node("T2", type="target", active=False)
        G.add_edge("X", "M", edge_type="uses")
        G.add_edge("M", "T1", edge_type="targets")
        G.add_edge("M", "T2", edge_type="targets")

        ast_matches = _ast_matching_nodes(G, "∃y ∈ N_{uses.targets}(x) : active(y)")
        assert "X" in ast_matches


class TestComparisonPredicateRoundtrip:
    def test_numeric_comparison(self):
        G = nx.Graph()
        G.add_node("high", score=100)
        G.add_node("low", score=10)

        assert _ast_matching_nodes(G, "score(x) >= 50") == {"high"}
        assert _ast_matching_nodes(G, "score(x) < 50") == {"low"}

    def test_string_comparison(self):
        G = nx.Graph()
        G.add_node("A", category="alpha")
        G.add_node("B", category="beta")

        assert _ast_matching_nodes(G, 'category(x) = "alpha"') == {"A"}

    def test_topology_metric(self):
        G = nx.Graph()
        G.add_edges_from([("hub", "1"), ("hub", "2"), ("hub", "3"), ("leaf", "1")])

        matches = _ast_matching_nodes(G, "degree(x) >= 3")
        assert "hub" in matches
        assert "leaf" not in matches

    def test_array_membership_lifting(self):
        G = nx.Graph()
        G.add_node("D1", biological_processes=["cell_migration", "apoptosis"])
        G.add_node("D2", biological_processes=["angiogenesis"])
        G.add_node("D3", biological_processes=["cell_migration", "angiogenesis"])

        matches = _ast_matching_nodes(G, 'biological_processes(x) = "cell_migration"')
        assert matches == {"D1", "D3"}

    def test_type_comparison_format(self):
        G = nx.Graph()
        G.add_node("P1", type="protein", active=True)
        G.add_node("P2", type="protein", active=False)
        G.add_node("E1", type="enzyme", active=True)

        matches = _ast_matching_nodes(G, 'type(x) = "protein"')
        assert matches == {"P1", "P2"}
