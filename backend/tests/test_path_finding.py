import networkx as nx
import pytest

from services.path_finder import PathFinder


class TestPathFinder:
    @pytest.fixture
    def simple_graph(self):
        G = nx.Graph()
        G.add_edges_from(
            [("A", "B"), ("B", "C"), ("C", "D"), ("D", "E"), ("A", "F"), ("F", "E")]
        )
        return G

    @pytest.fixture
    def disconnected_graph(self):
        G = nx.Graph()
        G.add_edges_from([("A", "B"), ("C", "D")])
        return G

    @pytest.fixture
    def complete_graph(self):
        return nx.complete_graph(5)

    def test_shortest_path_basic(self, simple_graph):
        finder = PathFinder(simple_graph)
        result = finder.find_paths_between_nodes("A", "E", algorithm="shortest")

        assert result.has_paths
        assert len(result.paths) == 1
        assert result.paths[0] in [["A", "B", "C", "D", "E"], ["A", "F", "E"]]
        assert result.anchor_nodes == ["A", "E"]
        assert result.algorithm_used == "shortest"
        assert "A" in result.path_nodes
        assert "E" in result.path_nodes

    def test_k_shortest_paths(self, simple_graph):
        finder = PathFinder(simple_graph)
        result = finder.find_paths_between_nodes(
            "A", "E", algorithm="k_shortest", max_paths=3
        )

        assert result.has_paths
        assert len(result.paths) >= 1
        assert len(result.paths) <= 3
        assert all("A" == path[0] and "E" == path[-1] for path in result.paths)
        assert result.algorithm_used == "k_shortest"

    def test_all_simple_paths(self, simple_graph):
        finder = PathFinder(simple_graph)
        result = finder.find_paths_between_nodes(
            "A", "E", algorithm="all_simple", max_path_length=6
        )

        assert result.has_paths
        assert all("A" == path[0] and "E" == path[-1] for path in result.paths)
        assert all(len(path) <= 7 for path in result.paths)  # max_path_length + 1
        assert result.algorithm_used == "all_simple"

    def test_disconnected_nodes(self, disconnected_graph):
        finder = PathFinder(disconnected_graph)
        result = finder.find_paths_between_nodes("A", "C", algorithm="shortest")

        assert not result.has_paths
        assert len(result.paths) == 0
        assert len(result.path_nodes) == 0
        assert len(result.path_edges) == 0
        assert result.anchor_nodes == ["A", "C"]

    def test_same_source_target_error(self, simple_graph):
        finder = PathFinder(simple_graph)

        with pytest.raises(
            ValueError, match="Source and target nodes cannot be the same"
        ):
            finder.find_paths_between_nodes("A", "A")

    def test_nonexistent_source_node(self, simple_graph):
        finder = PathFinder(simple_graph)

        with pytest.raises(ValueError, match="Source node 'X' not found in graph"):
            finder.find_paths_between_nodes("X", "A")

    def test_nonexistent_target_node(self, simple_graph):
        finder = PathFinder(simple_graph)

        with pytest.raises(ValueError, match="Target node 'X' not found in graph"):
            finder.find_paths_between_nodes("A", "X")

    def test_path_length_constraint(self, simple_graph):
        finder = PathFinder(simple_graph)
        result = finder.find_paths_between_nodes(
            "A", "E", algorithm="k_shortest", max_path_length=2
        )

        valid_paths = []
        for path in result.paths:
            if len(path) <= 3:  # max_path_length + 1
                valid_paths.append(path)

        assert all(len(path) <= 3 for path in result.paths)

    def test_max_paths_limit(self, complete_graph):
        finder = PathFinder(complete_graph)
        result = finder.find_paths_between_nodes(
            0, 4, algorithm="k_shortest", max_paths=3
        )

        assert len(result.paths) <= 3

    def test_path_edges_generation(self, simple_graph):
        finder = PathFinder(simple_graph)
        result = finder.find_paths_between_nodes("A", "C", algorithm="shortest")

        assert result.has_paths
        expected_edges = [("A", "B"), ("B", "C")]
        assert all(edge in result.path_edges for edge in expected_edges)

    def test_unique_path_nodes(self, simple_graph):
        finder = PathFinder(simple_graph)
        result = finder.find_paths_between_nodes(
            "A", "E", algorithm="k_shortest", max_paths=5
        )

        all_nodes_from_paths = set()
        for path in result.paths:
            all_nodes_from_paths.update(path)

        assert result.path_nodes == all_nodes_from_paths
        assert result.unique_node_count == len(all_nodes_from_paths)

    def test_computation_time_recorded(self, simple_graph):
        finder = PathFinder(simple_graph)
        result = finder.find_paths_between_nodes("A", "E")

        assert result.total_computation_time_ms >= 0
        assert isinstance(result.total_computation_time_ms, float)

    def test_invalid_algorithm(self, simple_graph):
        finder = PathFinder(simple_graph)

        with pytest.raises(ValueError, match="Unknown algorithm: invalid"):
            finder.find_paths_between_nodes("A", "E", algorithm="invalid")

    def test_self_loop_graph(self):
        G = nx.Graph()
        G.add_edges_from([("A", "B"), ("B", "B")])  # Self-loop
        finder = PathFinder(G)
        result = finder.find_paths_between_nodes("A", "B")

        assert result.has_paths
        assert result.paths[0] == ["A", "B"]

    def test_single_node_graph(self):
        G = nx.Graph()
        G.add_node("A")
        finder = PathFinder(G)

        with pytest.raises(ValueError):
            finder.find_paths_between_nodes("A", "B")

    def test_empty_graph(self):
        G = nx.Graph()
        finder = PathFinder(G)

        with pytest.raises(ValueError):
            finder.find_paths_between_nodes("A", "B")


class TestPathFindingIntegration:
    def test_drug_repurposing_scenario(self):
        G = nx.Graph()
        G.add_edges_from(
            [
                ("Drug_A", "Target_1"),
                ("Target_1", "Pathway_1"),
                ("Pathway_1", "Biomarker_1"),
                ("Biomarker_1", "Disease_X"),
                ("Drug_A", "Target_2"),
                ("Target_2", "Disease_X"),
            ]
        )

        finder = PathFinder(G)
        result = finder.find_paths_between_nodes(
            "Drug_A", "Disease_X", algorithm="k_shortest"
        )

        assert result.has_paths
        assert len(result.paths) >= 1
        assert "Drug_A" in result.path_nodes
        assert "Disease_X" in result.path_nodes

        mechanism_nodes = result.path_nodes - {"Drug_A", "Disease_X"}
        assert len(mechanism_nodes) > 0

    def test_power_grid_scenario(self):
        G = nx.Graph()
        G.add_edges_from(
            [
                ("Gen_1", "Bus_A"),
                ("Bus_A", "Line_1"),
                ("Line_1", "Bus_B"),
                ("Bus_B", "Load_1"),
                ("Gen_1", "Bus_C"),
                ("Bus_C", "Line_2"),
                ("Line_2", "Load_1"),
            ]
        )

        finder = PathFinder(G)
        result = finder.find_paths_between_nodes(
            "Gen_1", "Load_1", algorithm="all_simple", max_path_length=8
        )

        assert result.has_paths
        transmission_elements = result.path_nodes - {"Gen_1", "Load_1"}
        assert len(transmission_elements) > 0

    def test_cybersecurity_scenario(self):
        G = nx.Graph()
        G.add_edges_from(
            [
                ("Platform_Windows", "Vuln_CVE123"),
                ("Vuln_CVE123", "Technique_T1055"),
                ("Technique_T1055", "Group_APT29"),
                ("Platform_Windows", "Vuln_CVE456"),
                ("Vuln_CVE456", "Group_APT29"),
            ]
        )

        finder = PathFinder(G)
        result = finder.find_paths_between_nodes(
            "Platform_Windows", "Group_APT29", algorithm="k_shortest"
        )

        assert result.has_paths
        attack_path_elements = result.path_nodes - {"Platform_Windows", "Group_APT29"}
        assert len(attack_path_elements) > 0
