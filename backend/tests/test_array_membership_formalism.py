"""
Tests for array membership operations based on formalism Section 3.3.

Covers:
- Array membership syntax with 'in' operator
- Combined array membership and type constraints
- Real-world cybersecurity examples from formalism
- Cross-space array membership with quantifiers
"""

import pytest
import networkx as nx

from src.services.compiler.fol_parser import FOLPredicateParser
from src.services.compiler.fol_ast import (
    AtomicPredicate,
    ComparisonOperator,
    CompoundPredicate,
    LogicalConnective,
    QuantifiedPredicate,
    Quantifier,
    Relation,
    Variable,
)


class TestArrayMembershipSyntax:
    """Test Section 3.3: Array Membership Operations - Basic Syntax"""

    @pytest.fixture
    def parser(self):
        return FOLPredicateParser()

    @pytest.fixture
    def array_graph(self):
        """Graph with array attributes matching formalism examples"""
        G = nx.Graph()

        # Cybersecurity techniques with platform arrays
        G.add_node("tech_t1055_011",
                  node_type="technique",
                  mitre_id="T1055.011",
                  platforms=["Windows"],
                  tactics=["defense_evasion", "privilege_escalation"])

        G.add_node("tech_multiplatform",
                  node_type="technique",
                  mitre_id="T1059",
                  platforms=["Linux", "Windows", "macOS"],
                  tactics=["execution"])

        G.add_node("tech_linux_only",
                  node_type="technique",
                  mitre_id="T1068",
                  platforms=["Linux"],
                  tactics=["privilege_escalation", "persistence"])

        # Threat actors with aliases arrays
        G.add_node("thrip_actor",
                  node_type="threat_actor",
                  aliases=["Thrip", "APT40", "Leviathan"],
                  target_sectors=["healthcare", "government"])

        G.add_node("apt29_actor",
                  node_type="threat_actor",
                  aliases=["APT29", "Cozy Bear", "The Dukes"],
                  target_sectors=["government", "technology"])

        # Malware with capability arrays
        G.add_node("banking_malware",
                  node_type="malware",
                  capabilities=["credential_theft", "screen_capture", "keylogging"],
                  target_types=["financial_institutions"])

        # Create relationships for cross-space testing
        G.add_edge("tech_t1055_011", "thrip_actor")
        G.add_edge("tech_multiplatform", "apt29_actor")
        G.add_edge("tech_linux_only", "thrip_actor")

        return G

    def test_platforms_array_membership_formalism_examples(self, parser, array_graph):
        """Test exact examples from formalism Section 3.3"""
        # x.platforms in "Linux" - Check if "Linux" is in the platforms array
        predicate = parser.parse('x.platforms in "Linux"')
        result = predicate.evaluate_nodes(array_graph)

        expected = {"tech_multiplatform", "tech_linux_only"}
        assert result == expected

        # x.platforms in "Windows"
        predicate = parser.parse('x.platforms in "Windows"')
        result = predicate.evaluate_nodes(array_graph)

        expected = {"tech_t1055_011", "tech_multiplatform"}
        assert result == expected

    def test_mathematical_element_symbol_support(self, parser, array_graph):
        """Test that ∈ mathematical symbol works as alias for 'in' operator"""
        # Test with ∈ symbol (mathematical element-of)
        predicate_element_symbol = parser.parse('x.platforms ∈ "Linux"')
        result_element_symbol = predicate_element_symbol.evaluate_nodes(array_graph)

        # Test with standard 'in' keyword for comparison
        predicate_in_keyword = parser.parse('x.platforms in "Linux"')
        result_in_keyword = predicate_in_keyword.evaluate_nodes(array_graph)

        # Results should be identical
        assert result_element_symbol == result_in_keyword
        expected = {"tech_multiplatform", "tech_linux_only"}
        assert result_element_symbol == expected

        # Test with Windows platform as well
        predicate_windows = parser.parse('x.platforms ∈ "Windows"')
        result_windows = predicate_windows.evaluate_nodes(array_graph)
        expected_windows = {"tech_t1055_011", "tech_multiplatform"}
        assert result_windows == expected_windows

    def test_aliases_array_membership_formalism_examples(self, parser, array_graph):
        """Test alias array membership from formalism"""
        # x.aliases in "Thrip" - Check if "Thrip" is in the aliases array
        predicate = parser.parse('x.aliases in "Thrip"')
        result = predicate.evaluate_nodes(array_graph)

        assert result == {"thrip_actor"}

        # x.aliases in "APT29"
        predicate = parser.parse('x.aliases in "APT29"')
        result = predicate.evaluate_nodes(array_graph)

        assert result == {"apt29_actor"}

    def test_tactics_array_membership(self, parser, array_graph):
        """Test tactics array membership"""
        # x.tactics in "persistence" - Check if "persistence" is in tactics array
        predicate = parser.parse('x.tactics in "persistence"')
        result = predicate.evaluate_nodes(array_graph)

        expected = {"tech_linux_only"}  # Only tech_linux_only has "persistence"
        assert result == expected

    def test_array_membership_with_node_type_constraints(self, parser, array_graph):
        """Test formalism examples combining arrays with node type constraints"""
        # x.platforms in "Linux" ∧ x.node_type = "technique" (Linux techniques)
        predicate = parser.parse('x.platforms in "Linux" ∧ x.node_type = "technique"')
        result = predicate.evaluate_nodes(array_graph)

        expected = {"tech_multiplatform", "tech_linux_only"}
        assert result == expected

        # x.aliases in "Thrip" ∧ x.node_type = "threat_actor" (Thrip threat actor)
        predicate = parser.parse('x.aliases in "Thrip" ∧ x.node_type = "threat_actor"')
        result = predicate.evaluate_nodes(array_graph)

        assert result == {"thrip_actor"}

    def test_array_membership_negative_cases(self, parser, array_graph):
        """Test array membership when values are not present"""
        # Non-existent platform
        predicate = parser.parse('x.platforms in "iOS"')
        result = predicate.evaluate_nodes(array_graph)
        assert result == set()

        # Non-existent alias
        predicate = parser.parse('x.aliases in "NonExistent"')
        result = predicate.evaluate_nodes(array_graph)
        assert result == set()

    def test_multiple_array_constraints(self, parser, array_graph):
        """Test multiple array membership constraints"""
        # Techniques that support both Windows and have defense_evasion tactic
        predicate = parser.parse('x.platforms in "Windows" ∧ x.tactics in "defense_evasion"')
        result = predicate.evaluate_nodes(array_graph)

        assert result == {"tech_t1055_011"}

    def test_array_membership_with_disjunction(self, parser, array_graph):
        """Test array membership with OR operations"""
        # Nodes with either Linux platform OR persistence tactic
        predicate = parser.parse('x.platforms in "Linux" ∨ x.tactics in "persistence"')
        result = predicate.evaluate_nodes(array_graph)

        # tech_multiplatform: Linux platform ✓
        # tech_linux_only: Linux platform ✓ AND persistence tactic ✓
        # tech_t1055_011: Windows only, no persistence
        expected = {"tech_multiplatform", "tech_linux_only"}
        assert result == expected


class TestArrayMembershipWithQuantifiers:
    """Test Section 4.4: Real-world example combining arrays and quantifiers"""

    @pytest.fixture
    def parser(self):
        return FOLPredicateParser()

    @pytest.fixture
    def cross_space_array_graph(self):
        """Graph for testing formalism Section 4.4 real-world example"""
        G = nx.Graph()

        # Linux techniques
        G.add_node("linux_tech1",
                  node_type="technique",
                  platforms=["Linux"],
                  mitre_id="T1068")

        G.add_node("linux_tech2",
                  node_type="technique",
                  platforms=["Linux", "Unix"],
                  mitre_id="T1055")

        G.add_node("windows_tech",
                  node_type="technique",
                  platforms=["Windows"],
                  mitre_id="T1059")

        # Threat actors
        G.add_node("thrip_actor",
                  node_type="threat_actor",
                  aliases=["Thrip", "APT40"])

        G.add_node("other_actor",
                  node_type="threat_actor",
                  aliases=["OtherAPT"])

        # Create the relationships from formalism example
        G.add_edge("linux_tech1", "thrip_actor")  # Linux technique connected to Thrip
        G.add_edge("linux_tech2", "other_actor")  # Linux technique connected to other
        G.add_edge("windows_tech", "thrip_actor")  # Windows technique connected to Thrip

        return G

    def test_formalism_section_4_4_exact_example(self, parser, cross_space_array_graph):
        """Test exact real-world example from formalism Section 4.4"""
        # x.platforms in "Linux" ∧ ∃ y ∈ neighbors(x) : y.node_type = "threat_actor" ∧ y.aliases in "Thrip"
        predicate = parser.parse(
            'x.platforms in "Linux" ∧ ∃ y ∈ neighbors(x): '
            'y.node_type = "threat_actor" ∧ y.aliases in "Thrip"'
        )

        result = predicate.evaluate_nodes(cross_space_array_graph)

        # Result: Linux techniques connected to the Thrip threat actor group
        assert result == {"linux_tech1"}

        # Verify interpretation: "Linux techniques connected to the Thrip threat actor group"
        # linux_tech1: Linux platform AND connected to Thrip actor ✓
        # linux_tech2: Linux platform BUT connected to other actor ✗
        # windows_tech: Not Linux platform ✗

    def test_array_membership_existential_variations(self, parser, cross_space_array_graph):
        """Test variations of the formalism example"""
        # All techniques connected to threat actors with "Thrip" alias
        predicate = parser.parse('∃ y ∈ neighbors(x): y.aliases in "Thrip"')
        result = predicate.evaluate_nodes(cross_space_array_graph)

        expected = {"linux_tech1", "windows_tech"}
        assert result == expected

        # All Linux techniques (regardless of connections)
        predicate = parser.parse('x.platforms in "Linux"')
        result = predicate.evaluate_nodes(cross_space_array_graph)

        expected = {"linux_tech1", "linux_tech2"}
        assert result == expected

    def test_array_membership_universal_quantifiers(self, parser, cross_space_array_graph):
        """Test array membership with universal quantifiers"""
        # Techniques where ALL neighbors are threat actors with specific aliases
        predicate = parser.parse(
            '∀ y ∈ neighbors(x): y.node_type = "threat_actor" ∧ y.aliases in "Thrip"'
        )
        result = predicate.evaluate_nodes(cross_space_array_graph)

        # Only linux_tech1 and windows_tech have all neighbors as Thrip actors
        expected = {"linux_tech1", "windows_tech"}
        assert result == expected

    def test_array_membership_counting_quantifiers(self, parser, cross_space_array_graph):
        """Test array membership with counting quantifiers"""
        # Add more connections for counting tests
        G = cross_space_array_graph
        G.add_node("thrip_actor2", node_type="threat_actor", aliases=["Thrip"])
        G.add_edge("linux_tech1", "thrip_actor2")

        # Techniques with exactly 2 Thrip-aliased neighbors
        predicate = parser.parse(
            'EXACTLY(2) y ∈ neighbors(x): y.aliases in "Thrip"'
        )
        result = predicate.evaluate_nodes(G)

        assert result == {"linux_tech1"}  # Has exactly 2 Thrip neighbors

        # Techniques with at least 1 Thrip-aliased neighbor
        predicate = parser.parse(
            'AT_LEAST(1) y ∈ neighbors(x): y.aliases in "Thrip"'
        )
        result = predicate.evaluate_nodes(G)

        expected = {"linux_tech1", "windows_tech"}
        assert result == expected


class TestArrayMembershipEdgeCases:
    """Test edge cases and error conditions for array membership"""

    @pytest.fixture
    def parser(self):
        return FOLPredicateParser()

    @pytest.fixture
    def edge_case_graph(self):
        """Graph with edge cases for array testing"""
        G = nx.Graph()

        # Node with empty array
        G.add_node("empty_arrays", platforms=[], aliases=[])

        # Node with single-item arrays
        G.add_node("single_items", platforms=["Linux"], aliases=["OnlyAlias"])

        # Node with missing array attributes
        G.add_node("missing_attrs", node_type="technique")

        # Node with non-array attributes (should not match array operations)
        G.add_node("non_arrays", platform="Linux", alias="SingleString")

        return G

    def test_empty_array_membership(self, parser, edge_case_graph):
        """Test membership testing on empty arrays"""
        predicate = parser.parse('x.platforms in "Linux"')
        result = predicate.evaluate_nodes(edge_case_graph)

        # Empty array should not contain "Linux"
        expected = {"single_items"}  # Only the node with ["Linux"]
        assert result == expected

    def test_missing_array_attribute(self, parser, edge_case_graph):
        """Test behavior when array attribute is missing"""
        predicate = parser.parse('x.platforms in "Linux"')
        result = predicate.evaluate_nodes(edge_case_graph)

        # Nodes without platforms attribute should not match
        assert "missing_attrs" not in result

    def test_non_array_attribute_fallback(self, parser, edge_case_graph):
        """Test behavior when attribute is not an array"""
        # The implementation should handle non-array attributes gracefully
        predicate = parser.parse('x.platform in "Linux"')  # Note: platform not platforms
        result = predicate.evaluate_nodes(edge_case_graph)

        # Should handle string attribute with IN operation
        assert "non_arrays" in result  # "Linux" in "Linux" should be true

    def test_array_membership_case_sensitivity(self, parser):
        """Test case sensitivity in array membership"""
        G = nx.Graph()
        G.add_node("n1", platforms=["Linux", "windows"])

        # Exact case match
        predicate = parser.parse('x.platforms in "Linux"')
        result = predicate.evaluate_nodes(G)
        assert result == {"n1"}

        # Different case should not match
        predicate = parser.parse('x.platforms in "LINUX"')
        result = predicate.evaluate_nodes(G)
        assert result == set()

    def test_array_membership_special_characters(self, parser):
        """Test array membership with special characters"""
        G = nx.Graph()
        G.add_node("n1",
                  aliases=["APT-40", "Thrip@Group", "Actor.1"],
                  techniques=["T1055.011", "T1059.001"])

        # Test hyphenated values
        predicate = parser.parse('x.aliases in "APT-40"')
        result = predicate.evaluate_nodes(G)
        assert result == {"n1"}

        # Test dot notation values
        predicate = parser.parse('x.techniques in "T1055.011"')
        result = predicate.evaluate_nodes(G)
        assert result == {"n1"}

    def test_array_membership_numeric_values(self, parser):
        """Test array membership with numeric values in arrays"""
        G = nx.Graph()
        G.add_node("n1", port_numbers=[80, 443, 8080], versions=[1.0, 2.5, 3.14])

        # Test integer membership
        predicate = parser.parse('x.port_numbers in 443')
        result = predicate.evaluate_nodes(G)
        assert result == {"n1"}

        # Test float membership
        predicate = parser.parse('x.versions in 2.5')
        result = predicate.evaluate_nodes(G)
        assert result == {"n1"}

    def test_complex_array_membership_combinations(self, parser):
        """Test complex combinations of array membership predicates"""
        G = nx.Graph()

        G.add_node("versatile_technique",
                  node_type="technique",
                  platforms=["Linux", "Windows", "macOS"],
                  tactics=["persistence", "defense_evasion", "privilege_escalation"],
                  data_sources=["process_monitoring", "file_monitoring"])

        G.add_node("limited_technique",
                  node_type="technique",
                  platforms=["Windows"],
                  tactics=["execution"],
                  data_sources=["process_monitoring"])

        # Complex predicate: multi-platform techniques with multiple tactics
        predicate = parser.parse(
            'x.platforms in "Linux" ∧ x.platforms in "Windows" ∧ '
            'x.tactics in "persistence" ∧ x.tactics in "defense_evasion"'
        )
        result = predicate.evaluate_nodes(G)

        assert result == {"versatile_technique"}

    def test_array_membership_projection_semantics(self, parser):
        """Test that array membership works correctly with projection"""
        G = nx.Graph()

        G.add_node("center", node_type="technique")
        G.add_node("actor1", node_type="threat_actor", aliases=["Thrip", "APT40"])
        G.add_node("actor2", node_type="threat_actor", aliases=["Cozy Bear"])
        G.add_edge("center", "actor1")
        G.add_edge("center", "actor2")

        # Test projection with array membership constraint
        predicate = parser.parse('∃ y ∈ neighbors(x): y.aliases in "Thrip"')

        cross_space = predicate
        result_obj = cross_space.evaluate_nodes_with_projection(G, project_variables={"y"})

        assert result_obj.matching_nodes == {"center"}

        if result_obj.projections:
            projection = result_obj.projections[0]
            assert "y" in projection.projected_variables
            assert "actor1" in projection.projected_variables["y"]
            assert "actor2" not in projection.projected_variables["y"]  # Doesn't have Thrip alias
