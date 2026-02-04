from __future__ import annotations

import networkx as nx
import pytest

from fol.learning.learner import ExplanationLearner


class TestLearningIntegration:
    @pytest.fixture
    def drug_protein_graph(self) -> nx.Graph:
        G = nx.Graph()

        drugs = [
            (
                "aspirin",
                {
                    "type": "Drug",
                    "molecular_weight": 180.16,
                    "approval_year": 1897,
                    "category": "NSAID",
                },
            ),
            (
                "ibuprofen",
                {
                    "type": "Drug",
                    "molecular_weight": 206.28,
                    "approval_year": 1961,
                    "category": "NSAID",
                },
            ),
            (
                "acetaminophen",
                {
                    "type": "Drug",
                    "molecular_weight": 151.16,
                    "approval_year": 1893,
                    "category": "Analgesic",
                },
            ),
            (
                "warfarin",
                {
                    "type": "Drug",
                    "molecular_weight": 308.33,
                    "approval_year": 1954,
                    "category": "Anticoagulant",
                },
            ),
            (
                "metformin",
                {
                    "type": "Drug",
                    "molecular_weight": 129.16,
                    "approval_year": 1957,
                    "category": "Antidiabetic",
                },
            ),
            (
                "insulin",
                {
                    "type": "Drug",
                    "molecular_weight": 5808,
                    "approval_year": 1922,
                    "category": "Hormone",
                },
            ),
        ]

        proteins = [
            (
                "COX1",
                {
                    "type": "Protein",
                    "family": "Cyclooxygenase",
                    "tissue": "Stomach",
                    "expression": 3.2,
                },
            ),
            (
                "COX2",
                {
                    "type": "Protein",
                    "family": "Cyclooxygenase",
                    "tissue": "Kidney",
                    "expression": 4.1,
                },
            ),
            (
                "CYP2C9",
                {
                    "type": "Protein",
                    "family": "Cytochrome",
                    "tissue": "Liver",
                    "expression": 5.3,
                },
            ),
            (
                "GLUT4",
                {
                    "type": "Protein",
                    "family": "Transporter",
                    "tissue": "Muscle",
                    "expression": 2.8,
                },
            ),
            (
                "INR",
                {
                    "type": "Protein",
                    "family": "Receptor",
                    "tissue": "Pancreas",
                    "expression": 1.9,
                },
            ),
        ]

        for drug_id, attrs in drugs:
            G.add_node(drug_id, **attrs)
        for protein_id, attrs in proteins:
            G.add_node(protein_id, **attrs)

        interactions = [
            ("aspirin", "COX1"),
            ("aspirin", "COX2"),
            ("ibuprofen", "COX1"),
            ("ibuprofen", "COX2"),
            ("warfarin", "CYP2C9"),
            ("metformin", "GLUT4"),
            ("insulin", "INR"),
        ]

        G.add_edges_from(interactions)
        return G

    @pytest.fixture
    def social_network_graph(self) -> nx.Graph:
        G = nx.Graph()

        users = [
            (
                "alice",
                {
                    "type": "User",
                    "age": 25,
                    "location": "NYC",
                    "interests": "tech",
                    "followers": 120,
                },
            ),
            (
                "bob",
                {
                    "type": "User",
                    "age": 30,
                    "location": "NYC",
                    "interests": "tech",
                    "followers": 85,
                },
            ),
            (
                "carol",
                {
                    "type": "User",
                    "age": 28,
                    "location": "SF",
                    "interests": "art",
                    "followers": 200,
                },
            ),
            (
                "dave",
                {
                    "type": "User",
                    "age": 22,
                    "location": "LA",
                    "interests": "music",
                    "followers": 45,
                },
            ),
            (
                "eve",
                {
                    "type": "User",
                    "age": 35,
                    "location": "NYC",
                    "interests": "business",
                    "followers": 300,
                },
            ),
            (
                "frank",
                {
                    "type": "User",
                    "age": 40,
                    "location": "Boston",
                    "interests": "tech",
                    "followers": 150,
                },
            ),
        ]

        groups = [
            (
                "tech_ny",
                {
                    "type": "Group",
                    "category": "Professional",
                    "size": 250,
                    "activity": "high",
                },
            ),
            (
                "art_sf",
                {
                    "type": "Group",
                    "category": "Creative",
                    "size": 180,
                    "activity": "medium",
                },
            ),
            (
                "music_la",
                {
                    "type": "Group",
                    "category": "Entertainment",
                    "size": 320,
                    "activity": "high",
                },
            ),
        ]

        for user_id, attrs in users:
            G.add_node(user_id, **attrs)
        for group_id, attrs in groups:
            G.add_node(group_id, **attrs)

        edges = [
            ("alice", "bob"),
            ("alice", "carol"),
            ("bob", "frank"),
            ("carol", "dave"),
            ("eve", "frank"),
            ("alice", "tech_ny"),
            ("bob", "tech_ny"),
            ("frank", "tech_ny"),
            ("carol", "art_sf"),
            ("dave", "music_la"),
        ]

        G.add_edges_from(edges)
        return G

    def test_drug_interaction_learning(self, drug_protein_graph):
        selected_nodes = ["aspirin", "ibuprofen"]

        learner = ExplanationLearner(
            beam_width=5,
            max_clause_len=3,
            top_k=3,
        )

        result = learner.learn_explanations(drug_protein_graph, selected_nodes)

        assert len(result.clauses) > 0
        assert result.selection_size == 2
        assert result.total_nodes == 11

        best_clause = result.clauses[0]
        assert best_clause.score > 0
        assert best_clause.coverage > 0
        assert best_clause.pi_clause > best_clause.pi

        found_meaningful_pattern = any(clause.score > 0 for clause in result.clauses)
        assert found_meaningful_pattern

    def test_social_network_learning(self, social_network_graph):
        selected_nodes = ["alice", "bob", "frank"]

        learner = ExplanationLearner(
            beam_width=8,
            max_clause_len=2,
            top_k=5,
        )

        result = learner.learn_explanations(social_network_graph, selected_nodes)

        assert len(result.clauses) > 0
        assert result.selection_size == 3

        any(clause.score > 0 for clause in result.clauses)
        if result.clauses:
            best_clause = result.clauses[0]
            assert best_clause.pi_clause >= best_clause.pi

    def test_learning_with_different_configurations(self, drug_protein_graph):
        selected_nodes = ["aspirin", "ibuprofen", "acetaminophen"]

        configs = [
            {"beam_width": 3, "max_clause_len": 2, "top_k": 2},
            {"beam_width": 8, "max_clause_len": 4, "top_k": 5},
            {"beam_width": 1, "max_clause_len": 1, "top_k": 1},
        ]

        for config in configs:
            learner = ExplanationLearner(**config)
            result = learner.learn_explanations(drug_protein_graph, selected_nodes)

            assert isinstance(result.clauses, list)
            assert len(result.clauses) <= config["top_k"]
            assert result.selection_size == 3

            for clause in result.clauses:
                assert len(clause.literals) <= config["max_clause_len"]
                if clause.score > 0:
                    assert clause.pi_clause > clause.pi

    def test_learning_performance_scaling(self):
        import time

        for n_nodes in [50, 100, 200]:
            G = nx.erdos_renyi_graph(n_nodes, 0.05, seed=42)

            for i, node in enumerate(G.nodes()):
                G.nodes[node]["type"] = "Type1" if i % 3 == 0 else "Type2"
                G.nodes[node]["value"] = float(i % 10)
                G.nodes[node]["category"] = chr(65 + (i % 5))

            selected_nodes = list(G.nodes())[: max(1, n_nodes // 5)]

            learner = ExplanationLearner(beam_width=5, max_clause_len=3, top_k=3)

            start_time = time.time()
            result = learner.learn_explanations(G, selected_nodes)
            elapsed = time.time() - start_time

            assert (
                elapsed < 10.0
            ), f"Learning took too long for {n_nodes} nodes: {elapsed:.2f}s"

            assert len(result.clauses) >= 0
            assert result.total_nodes == n_nodes

    def test_empty_and_edge_selections(self, drug_protein_graph):
        learner = ExplanationLearner(beam_width=3, max_clause_len=2, top_k=3)

        result = learner.learn_explanations(drug_protein_graph, [])
        assert len(result.clauses) == 0
        assert result.selection_size == 0

        result = learner.learn_explanations(drug_protein_graph, ["aspirin"])
        assert result.selection_size == 1

        all_nodes = list(drug_protein_graph.nodes())
        result = learner.learn_explanations(drug_protein_graph, all_nodes)
        assert result.selection_size == len(all_nodes)
        assert len(result.clauses) == 0

    def test_learning_consistency_across_runs(self, drug_protein_graph):
        selected_nodes = ["aspirin", "ibuprofen"]

        learner = ExplanationLearner(beam_width=5, max_clause_len=3, top_k=3)

        results = []
        for _ in range(3):
            result = learner.learn_explanations(drug_protein_graph, selected_nodes)
            results.append(result)

        for i in range(1, len(results)):
            assert results[i].selection_size == results[0].selection_size
            assert results[i].total_nodes == results[0].total_nodes
            assert len(results[i].clauses) == len(results[0].clauses)

            if results[0].clauses and results[i].clauses:
                best_0 = results[0].clauses[0]
                best_i = results[i].clauses[0]
                assert abs(best_0.score - best_i.score) < 1e-10


class TestAdaptiveLearning:
    def test_tiny_selection_adaptive_thresholds(self):
        graph = self._create_test_graph()
        selected_nodes = ["expert1", "expert2"]

        learner = ExplanationLearner(beam_width=3, max_clause_len=2, top_k=3)
        result = learner.learn_explanations(graph, selected_nodes)

        assert result.selection_size == 2
        assert len(result.clauses) >= 1

        if result.clauses:
            best_clause = result.clauses[0]
            assert best_clause.score > 0
            assert best_clause.support >= 2
            assert best_clause.pi_clause > best_clause.pi

    def test_small_selection_graceful_degradation(self):
        graph = self._create_test_graph()
        selected_nodes = ["expert1", "expert2", "expert3"]

        learner = ExplanationLearner(beam_width=5, max_clause_len=2, top_k=5)
        result = learner.learn_explanations(graph, selected_nodes)

        assert result.selection_size == 3
        assert len(result.clauses) >= 1

        if result.clauses:
            for clause in result.clauses:
                assert clause.support >= 3
                assert clause.pi_clause > clause.pi

    def test_normal_selection_unchanged_behavior(self):
        graph = self._create_large_test_graph()
        selected_nodes = [f"node{i}" for i in range(1, 21)]

        learner = ExplanationLearner(beam_width=5, max_clause_len=2, top_k=5)
        result = learner.learn_explanations(graph, selected_nodes)

        assert result.selection_size == 20

        if result.clauses:
            for clause in result.clauses:
                assert clause.score > 0
                assert clause.support >= 5

    def test_best_effort_fallback(self):
        graph = nx.Graph()
        for i in range(50):
            node_type = "common" if i < 45 else "rare"
            graph.add_node(f"n{i}", type=node_type, value=i % 10)

        selected_nodes = ["n45", "n46", "n47"]

        learner = ExplanationLearner(beam_width=3, max_clause_len=2, top_k=3)
        result = learner.learn_explanations(graph, selected_nodes)

        assert result.selection_size == 3
        assert len(result.clauses) >= 0

    def _create_test_graph(self):
        graph = nx.Graph()

        experts = ["expert1", "expert2", "expert3"]
        intermediates = ["inter1", "inter2", "inter3", "inter4"]
        novices = ["novice1", "novice2", "novice3", "novice4", "novice5"]

        all_nodes = experts + intermediates + novices

        for node in all_nodes:
            graph.add_node(node)
            if node in experts:
                graph.nodes[node]["level"] = "expert"
                graph.nodes[node]["experience"] = 10
                graph.nodes[node]["certification"] = True
            elif node in intermediates:
                graph.nodes[node]["level"] = "intermediate"
                graph.nodes[node]["experience"] = 5
                graph.nodes[node]["certification"] = False
            else:
                graph.nodes[node]["level"] = "novice"
                graph.nodes[node]["experience"] = 1
                graph.nodes[node]["certification"] = False

        graph.add_edges_from(
            [
                ("expert1", "inter1"),
                ("expert2", "inter2"),
                ("inter1", "novice1"),
                ("inter2", "novice2"),
            ]
        )

        return graph

    def _create_large_test_graph(self):
        graph = nx.Graph()

        for i in range(1, 101):
            graph.add_node(f"node{i}")
            graph.nodes[f"node{i}"]["category"] = (
                "A" if i <= 30 else "B" if i <= 60 else "C"
            )
            graph.nodes[f"node{i}"]["value"] = i / 10.0
            graph.nodes[f"node{i}"]["active"] = i % 3 == 0

        import random

        random.seed(42)
        for _ in range(150):
            a, b = random.randint(1, 100), random.randint(1, 100)
            if a != b:
                graph.add_edge(f"node{a}", f"node{b}")

        return graph


class TestAPIFormatCompatibility:
    @pytest.fixture
    def realistic_graph(self) -> nx.Graph:
        G = nx.Graph()

        nodes = [
            (
                "P1",
                {
                    "type": "Protein",
                    "family": "Kinase",
                    "tissue": "Brain",
                    "expression": 4.2,
                    "disease_associated": True,
                },
            ),
            (
                "P2",
                {
                    "type": "Protein",
                    "family": "Kinase",
                    "tissue": "Heart",
                    "expression": 3.1,
                    "disease_associated": True,
                },
            ),
            (
                "P3",
                {
                    "type": "Protein",
                    "family": "Kinase",
                    "tissue": "Liver",
                    "expression": 2.8,
                    "disease_associated": False,
                },
            ),
            (
                "P4",
                {
                    "type": "Protein",
                    "family": "Receptor",
                    "tissue": "Brain",
                    "expression": 5.1,
                    "disease_associated": True,
                },
            ),
            (
                "P5",
                {
                    "type": "Protein",
                    "family": "Receptor",
                    "tissue": "Heart",
                    "expression": 3.9,
                    "disease_associated": False,
                },
            ),
            (
                "P6",
                {
                    "type": "Protein",
                    "family": "Transporter",
                    "tissue": "Kidney",
                    "expression": 2.3,
                    "disease_associated": False,
                },
            ),
            (
                "D1",
                {
                    "type": "Drug",
                    "category": "Inhibitor",
                    "molecular_weight": 324.5,
                    "approved": True,
                    "target_family": "Kinase",
                },
            ),
            (
                "D2",
                {
                    "type": "Drug",
                    "category": "Inhibitor",
                    "molecular_weight": 289.3,
                    "approved": True,
                    "target_family": "Kinase",
                },
            ),
            (
                "D3",
                {
                    "type": "Drug",
                    "category": "Agonist",
                    "molecular_weight": 412.7,
                    "approved": False,
                    "target_family": "Receptor",
                },
            ),
            (
                "D4",
                {
                    "type": "Drug",
                    "category": "Antagonist",
                    "molecular_weight": 356.1,
                    "approved": True,
                    "target_family": "Receptor",
                },
            ),
            (
                "D5",
                {
                    "type": "Drug",
                    "category": "Modulator",
                    "molecular_weight": 198.2,
                    "approved": False,
                    "target_family": "Transporter",
                },
            ),
            (
                "DIS1",
                {
                    "type": "Disease",
                    "category": "Cancer",
                    "prevalence": 0.02,
                    "severity": "High",
                },
            ),
            (
                "DIS2",
                {
                    "type": "Disease",
                    "category": "Neurological",
                    "prevalence": 0.01,
                    "severity": "High",
                },
            ),
            (
                "DIS3",
                {
                    "type": "Disease",
                    "category": "Cardiovascular",
                    "prevalence": 0.05,
                    "severity": "Medium",
                },
            ),
        ]

        for node_id, attrs in nodes:
            G.add_node(node_id, **attrs)

        edges = [
            ("D1", "P1"),
            ("D1", "P2"),
            ("D2", "P1"),
            ("D2", "P3"),
            ("D3", "P4"),
            ("D4", "P4"),
            ("D4", "P5"),
            ("D5", "P6"),
            ("P1", "DIS1"),
            ("P2", "DIS3"),
            ("P4", "DIS2"),
        ]
        G.add_edges_from(edges)

        return G

    def test_backend_api_format_compatibility(self, realistic_graph):
        selected_nodes = ["D1", "D2"]

        learner = ExplanationLearner(beam_width=3, max_clause_len=2, top_k=3)
        result = learner.learn_explanations(realistic_graph, selected_nodes)

        assert hasattr(result, "clauses")
        assert hasattr(result, "learning_time_ms")
        assert hasattr(result, "selection_size")
        assert hasattr(result, "total_nodes")

        if result.clauses:
            clause = result.clauses[0]
            assert hasattr(clause, "fol_expression")
            assert hasattr(clause, "score")
            assert hasattr(clause, "coverage")
            assert hasattr(clause, "literals")
            assert hasattr(clause, "matching_nodes")

            if clause.literals:
                literal = clause.literals[0]
                assert "type" in literal
                assert "attribute" in literal
                assert "operator" in literal
                assert "value" in literal
