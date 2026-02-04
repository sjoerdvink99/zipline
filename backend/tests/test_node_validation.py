from unittest.mock import MagicMock

import networkx as nx
import pytest

from api.learning import quick_learn_explanations
from api.topology import find_paths_between_nodes
from core.dataset_manager import DatasetManager
from models.graph_models import PathFindingRequest
from utils.node_validation import (
    NodeValidationResult,
    validate_and_map_node_ids,
    validate_single_node_id,
)


class TestNodeValidation:
    """Test cases for node ID validation and mapping."""

    @pytest.fixture
    def simple_graph(self):
        """Create a simple test graph with both numeric and semantic IDs."""
        G = nx.Graph()
        # Add nodes with numeric IDs but include semantic ID attributes
        G.add_node("1", id="protein_123", name="Node A", original_id="semantic_1")
        G.add_node("2", id="enzyme_456", name="Node B", semantic_id="semantic_2")
        G.add_node("18099", original_id="malware_789", name="Node C")
        G.add_node("18100", label="gene_999", name="Node D")

        # Add some edges
        G.add_edge("1", "2")
        G.add_edge("2", "18099")
        G.add_edge("18099", "18100")

        return G

    def test_all_valid_nodes(self, simple_graph):
        """Test validation when all node IDs are valid."""
        node_ids = ["1", "2", "18099"]
        result = validate_and_map_node_ids(simple_graph, node_ids, "test")

        assert result.success
        assert len(result.valid_nodes) == 3
        assert len(result.invalid_nodes) == 0
        assert not result.had_mappings
        assert result.valid_nodes == node_ids

    def test_no_node_ids(self, simple_graph):
        """Test validation with empty node list."""
        result = validate_and_map_node_ids(simple_graph, [], "test")

        assert not result.success
        assert len(result.valid_nodes) == 0
        assert len(result.invalid_nodes) == 0

    def test_all_invalid_nodes_no_mapping(self, simple_graph):
        """Test validation with invalid nodes that can't be mapped."""
        node_ids = ["nonexistent_1", "nonexistent_2"]
        result = validate_and_map_node_ids(simple_graph, node_ids, "test")

        assert not result.success
        assert len(result.valid_nodes) == 0
        assert len(result.invalid_nodes) == 2
        assert not result.had_mappings

    def test_semantic_to_numeric_mapping(self, simple_graph):
        """Test mapping from semantic IDs to numeric IDs."""
        # Use semantic IDs that should map to numeric graph node IDs
        node_ids = ["protein_123", "enzyme_456", "malware_789"]
        result = validate_and_map_node_ids(simple_graph, node_ids, "test")

        assert result.success
        assert len(result.valid_nodes) == 3
        assert len(result.invalid_nodes) == 0
        assert result.had_mappings
        assert result.mapping_count == 3

        # Validate that the mapping worked correctly
        assert "1" in result.valid_nodes  # protein_123 → 1
        assert "2" in result.valid_nodes  # enzyme_456 → 2
        assert "18099" in result.valid_nodes  # malware_789 → 18099

    def test_mixed_valid_and_mappable(self, simple_graph):
        """Test mix of directly valid nodes and nodes requiring mapping."""
        node_ids = ["1", "enzyme_456", "18099", "nonexistent"]
        result = validate_and_map_node_ids(simple_graph, node_ids, "test")

        assert result.success
        assert (
            len(result.valid_nodes) == 3
        )  # "1", "2" (mapped from enzyme_456), "18099"
        assert len(result.invalid_nodes) == 1  # "nonexistent"
        assert result.had_mappings
        assert result.mapping_count == 1

        assert "1" in result.valid_nodes
        assert "2" in result.valid_nodes  # mapped from enzyme_456
        assert "18099" in result.valid_nodes
        assert "nonexistent" in result.invalid_nodes

    def test_single_node_validation_valid(self, simple_graph):
        """Test single node validation with valid node."""
        result = validate_single_node_id(simple_graph, "1", "test")
        assert result == "1"

    def test_single_node_validation_mappable(self, simple_graph):
        """Test single node validation with mappable semantic ID."""
        result = validate_single_node_id(simple_graph, "protein_123", "test")
        assert result == "1"

    def test_single_node_validation_invalid(self, simple_graph):
        """Test single node validation with invalid node."""
        result = validate_single_node_id(simple_graph, "nonexistent", "test")
        assert result is None

    def test_attribute_priority_mapping(self, simple_graph):
        """Test that attribute priority works correctly for mapping."""
        # Create node with multiple potential mapping attributes
        G = nx.Graph()
        G.add_node(
            "numeric_id",
            id="should_map_this",
            original_id="not_this",
            semantic_id="or_this",
            name="definitely_not_this",
        )

        result = validate_and_map_node_ids(G, ["should_map_this"], "test")
        assert result.success
        assert "numeric_id" in result.valid_nodes
        assert result.had_mappings

    def test_node_validation_result_properties(self):
        """Test NodeValidationResult properties."""
        result = NodeValidationResult(
            valid_nodes=["1", "2"],
            invalid_nodes=["3"],
            mappings_applied={"semantic_1": "1"},
        )

        assert result.success
        assert result.mapping_count == 1
        assert result.had_mappings

        empty_result = NodeValidationResult([], ["1", "2"])
        assert not empty_result.success
        assert empty_result.mapping_count == 0
        assert not empty_result.had_mappings


class TestAPINodeValidationIntegration:
    @pytest.fixture
    def test_graph(self):
        G = nx.Graph()

        G.add_node("1", id="protein_A", name="Protein Alpha", original_id="prot_001")
        G.add_node("2", id="protein_B", name="Protein Beta", semantic_id="prot_002")
        G.add_node("18099", original_id="malware_X", name="Malware Node")
        G.add_node("18100", label="gene_Y", name="Gene Node")

        G.add_edge("1", "2")
        G.add_edge("2", "18099")
        G.add_edge("18099", "18100")
        G.add_edge("1", "18100")

        G.nodes["1"]["node_type"] = "protein"
        G.nodes["1"]["score"] = 85.5
        G.nodes["2"]["node_type"] = "protein"
        G.nodes["2"]["score"] = 92.1
        G.nodes["18099"]["node_type"] = "malware"
        G.nodes["18099"]["risk_level"] = "high"
        G.nodes["18100"]["node_type"] = "gene"
        G.nodes["18100"]["expression"] = 1.2

        return G

    @pytest.fixture
    def mock_dataset_manager(self, test_graph):
        dm = MagicMock(spec=DatasetManager)
        dm.active = test_graph
        dm.has_dataset.return_value = True
        dm.get_graph.return_value = test_graph
        return dm

    @pytest.mark.asyncio
    async def test_path_finding_with_valid_nodes(
        self, test_graph, mock_dataset_manager
    ):
        request = PathFindingRequest(
            source_node="1",
            target_node="18099",
            algorithm="shortest",
            max_paths=5,
            max_path_length=10,
        )

        response = await find_paths_between_nodes(request, mock_dataset_manager)

        assert response.success
        assert len(response.paths) > 0
        assert "1" in response.path_nodes
        assert "18099" in response.path_nodes

    @pytest.mark.asyncio
    async def test_path_finding_with_semantic_mapping(
        self, test_graph, mock_dataset_manager
    ):
        request = PathFindingRequest(
            source_node="protein_A",
            target_node="malware_X",
            algorithm="shortest",
            max_paths=5,
            max_path_length=10,
        )

        response = await find_paths_between_nodes(request, mock_dataset_manager)

        assert response.success
        assert len(response.paths) > 0
        assert "1" in response.path_nodes
        assert "18099" in response.path_nodes

    @pytest.mark.asyncio
    async def test_path_finding_with_invalid_source(
        self, test_graph, mock_dataset_manager
    ):
        request = PathFindingRequest(
            source_node="nonexistent_source",
            target_node="1",
            algorithm="shortest",
            max_paths=5,
            max_path_length=10,
        )

        response = await find_paths_between_nodes(request, mock_dataset_manager)

        assert not response.success
        assert len(response.paths) == 0
        assert len(response.errors) > 0
        assert "Source node" in response.errors[0]
        assert "not found in graph" in response.errors[0]

    @pytest.mark.asyncio
    async def test_path_finding_with_invalid_target(
        self, test_graph, mock_dataset_manager
    ):
        request = PathFindingRequest(
            source_node="1",
            target_node="nonexistent_target",
            algorithm="shortest",
            max_paths=5,
            max_path_length=10,
        )

        response = await find_paths_between_nodes(request, mock_dataset_manager)

        assert not response.success
        assert len(response.paths) == 0
        assert len(response.errors) > 0
        assert "Target node" in response.errors[0]
        assert "not found in graph" in response.errors[0]

    @pytest.mark.asyncio
    async def test_learning_with_valid_nodes(self, test_graph):
        request = {"selected_nodes": ["1", "2"]}

        response = await quick_learn_explanations(request, test_graph)

        assert "predicates" in response
        assert response["selection_size"] == 2

    @pytest.mark.asyncio
    async def test_learning_with_semantic_mapping(self, test_graph):
        request = {"selected_nodes": ["protein_A", "protein_B"]}

        response = await quick_learn_explanations(request, test_graph)

        assert "predicates" in response
        assert response["selection_size"] == 2

    @pytest.mark.asyncio
    async def test_learning_with_all_invalid_nodes(self, test_graph):
        request = {"selected_nodes": ["nonexistent_1", "nonexistent_2"]}

        response = await quick_learn_explanations(request, test_graph)

        assert response["selection_size"] == 0
        assert len(response["predicates"]) == 0

    @pytest.mark.asyncio
    async def test_learning_with_mixed_valid_invalid(self, test_graph):
        request = {"selected_nodes": ["1", "protein_B", "nonexistent"]}

        response = await quick_learn_explanations(request, test_graph)

        assert "predicates" in response
        assert response["selection_size"] == 2


def test_validation_error_messages():
    G = nx.Graph()
    G.add_node("valid_node")

    result = validate_and_map_node_ids(G, ["invalid_1", "invalid_2"], "test context")
    assert not result.success
    assert len(result.invalid_nodes) == 2

    G.add_node("numeric_id", original_id="semantic_id")
    result = validate_and_map_node_ids(G, ["semantic_id"], "test context")
    assert result.success
    assert result.had_mappings
