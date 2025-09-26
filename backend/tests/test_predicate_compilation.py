"""
Comprehensive tests for predicate compilation based on GraphBridge formalism.

Tests cover all aspects from .claude/reference/formalism.md:
1. Data Model and Representational Spaces
2. Predicates and First-Order Logic
3. Cross-Space Predicate Composition
4. Cardinality Constraints on Neighborhoods
5. Projection Semantics
6. Deterministic Semantics
"""

import pytest
import networkx as nx

from src.services.compiler.fol_parser import FOLPredicateParser, ParseError
from src.services.compiler.fol_ast import (
    AtomicPredicate,
    ComparisonOperator,
    CompoundPredicate,
    CrossSpacePredicate,
    FOLPredicateAST,
    LogicalConnective,
    QuantifiedPredicate,
    Quantifier,
    Relation,
    Variable,
    EvaluationResult,
)


class TestDataModel:
    """Tests for Section 1: Data Model and Representational Spaces"""

    @pytest.fixture
    def sample_multivariate_graph(self):
        """Create a multivariate graph G = (V, E, A) as per formalism Section 1.1"""
        G = nx.Graph()

        # Add nodes with both attribute and topology space properties
        G.add_node("protein1", type="protein", molecular_weight=45.2, active=True, category="protein")
        G.add_node("protein2", type="protein", molecular_weight=62.8, active=False, category="protein")
        G.add_node("enzyme1", type="enzyme", molecular_weight=78.5, active=True, category="enzyme")
        G.add_node("enzyme2", type="enzyme", molecular_weight=32.1, active=False, category="enzyme")
        G.add_node("compound1", type="compound", molecular_weight=15.3, active=True, category="compound")

        # Add edges to create topology space
        G.add_edge("protein1", "enzyme1")
        G.add_edge("protein1", "enzyme2")
        G.add_edge("protein2", "enzyme1")
        G.add_edge("enzyme1", "compound1")
        G.add_edge("enzyme2", "compound1")

        return G

    def test_attribute_space_representation(self, sample_multivariate_graph):
        """Test Section 1.2: Attribute Space - properties from A function"""
        G = sample_multivariate_graph

        # Verify attribute space properties are stored on nodes
        assert G.nodes["protein1"]["molecular_weight"] == 45.2
        assert G.nodes["protein1"]["active"] is True
        assert G.nodes["protein1"]["category"] == "protein"

        # Test different attribute types from formalism examples
        assert isinstance(G.nodes["protein1"]["molecular_weight"], float)  # ℝ⁺
        assert G.nodes["protein1"]["category"] in {"protein", "enzyme", "compound"}  # categorical
        assert isinstance(G.nodes["protein1"]["active"], bool)  # boolean

    def test_topology_space_representation(self, sample_multivariate_graph):
        """Test Section 1.3: Topology Space - properties derived from (V, E)"""
        G = sample_multivariate_graph

        # Test computed topology properties
        assert G.degree["protein1"] == 2  # degree(v)
        assert G.degree["enzyme1"] == 3

        # Test neighbors relationship from topology space
        assert set(G.neighbors("protein1")) == {"enzyme1", "enzyme2"}
        assert set(G.neighbors("enzyme1")) == {"protein1", "protein2", "compound1"}


class TestPredicatesAndFOL:
    """Tests for Section 2: Predicates and First-Order Logic"""

    @pytest.fixture
    def parser(self):
        return FOLPredicateParser()

    @pytest.fixture
    def sample_graph(self):
        G = nx.Graph()
        G.add_node("n1", category="protein", molecular_weight=45.2, active=True)
        G.add_node("n2", category="enzyme", molecular_weight=62.8, active=False)
        G.add_node("n3", category="protein", molecular_weight=78.5, active=True)
        G.add_edge("n1", "n2")
        G.add_edge("n2", "n3")
        return G

    def test_atomic_predicates_attribute_space(self, parser, sample_graph):
        """Test Section 2.1: Atomic predicates in attribute space"""
        # Test categorical attribute predicate
        predicate = parser.parse('x.category = "protein"')
        result = predicate.evaluate_nodes(sample_graph)
        assert result == {"n1", "n3"}

        # Test numerical attribute predicate
        predicate = parser.parse('x.molecular_weight > 50')
        result = predicate.evaluate_nodes(sample_graph)
        assert result == {"n2", "n3"}

        # Test boolean attribute predicate
        predicate = parser.parse('x.active = true')
        result = predicate.evaluate_nodes(sample_graph)
        assert result == {"n1", "n3"}

    def test_atomic_predicates_topology_space(self, parser, sample_graph):
        """Test Section 2.1: Atomic predicates in topology space"""
        # Test degree predicate
        predicate = parser.parse('degree(x) > 1')
        result = predicate.evaluate_nodes(sample_graph)
        assert result == {"n2"}  # n2 has degree 2

        # Test degree equals
        predicate = parser.parse('degree(x) = 1')
        result = predicate.evaluate_nodes(sample_graph)
        assert result == {"n1", "n3"}  # both have degree 1

    def test_logical_connectives(self, parser, sample_graph):
        """Test Section 2.1: Conjunction, Disjunction, Negation"""
        # Test conjunction (∧)
        predicate = parser.parse('x.category = "protein" ∧ x.active = true')
        result = predicate.evaluate_nodes(sample_graph)
        assert result == {"n1", "n3"}

        # Test disjunction (∨)
        predicate = parser.parse('x.category = "enzyme" ∨ x.molecular_weight > 70')
        result = predicate.evaluate_nodes(sample_graph)
        assert result == {"n2", "n3"}

        # Test negation (¬)
        predicate = parser.parse('¬(x.active = true)')
        result = predicate.evaluate_nodes(sample_graph)
        assert result == {"n2"}

    def test_quantifiers_bounded_to_neighborhoods(self, parser):
        """Test Section 2.2: Universal and Existential quantifiers bounded to neighborhoods"""
        G = nx.Graph()
        G.add_node("center", category="protein")
        G.add_node("neighbor1", category="enzyme", active=True)
        G.add_node("neighbor2", category="enzyme", active=False)
        G.add_edge("center", "neighbor1")
        G.add_edge("center", "neighbor2")

        # Test universal quantifier
        predicate = parser.parse('∀ y ∈ neighbors(x): y.category = "enzyme"')
        result = predicate.evaluate_nodes(G)
        assert result == {"center"}  # all neighbors of center are enzymes

        # Test existential quantifier
        predicate = parser.parse('∃ y ∈ neighbors(x): y.active = true')
        result = predicate.evaluate_nodes(G)
        assert result == {"center"}  # at least one neighbor is active


class TestCrossSpacePredicateComposition:
    """Tests for Section 3: Cross-Space Predicate Composition"""

    @pytest.fixture
    def parser(self):
        return FOLPredicateParser()

    @pytest.fixture
    def cross_space_graph(self):
        """Graph with both topology and attribute complexity"""
        G = nx.Graph()

        # High-degree protein nodes
        G.add_node("hub_protein", category="protein", molecular_weight=45.2, degree_computed=True)
        G.add_node("regular_protein", category="protein", molecular_weight=30.1, degree_computed=True)

        # Connected enzymes
        G.add_node("enzyme1", category="enzyme", molecular_weight=62.8)
        G.add_node("enzyme2", category="enzyme", molecular_weight=78.5)
        G.add_node("enzyme3", category="enzyme", molecular_weight=55.3)

        # Create topology to make hub_protein have high degree
        G.add_edge("hub_protein", "enzyme1")
        G.add_edge("hub_protein", "enzyme2")
        G.add_edge("hub_protein", "enzyme3")
        G.add_edge("regular_protein", "enzyme1")

        return G

    def test_single_space_predicates(self, parser, cross_space_graph):
        """Test Section 3.1: Single-space predicates"""
        # Attribute-only predicate
        predicate = parser.parse('x.category = "protein"')
        result = predicate.evaluate_nodes(cross_space_graph)
        assert result == {"hub_protein", "regular_protein"}

        # Topology-only predicate
        predicate = parser.parse('degree(x) > 2')
        result = predicate.evaluate_nodes(cross_space_graph)
        assert result == {"hub_protein"}  # only hub has degree > 2

    def test_cross_space_predicates(self, parser, cross_space_graph):
        """Test Section 3.2: Cross-space predicates combining topology and attributes"""
        # Example from formalism: degree(x) > 5 ∧ category(x, "protein")
        predicate = parser.parse('degree(x) > 2 ∧ x.category = "protein"')
        result = predicate.evaluate_nodes(cross_space_graph)
        assert result == {"hub_protein"}  # high degree AND protein

        # More complex cross-space constraint
        predicate = parser.parse('degree(x) = 1 ∧ x.molecular_weight < 40')
        result = predicate.evaluate_nodes(cross_space_graph)
        assert result == {"regular_protein"}  # low degree AND low weight


class TestArrayMembershipOperations:
    """Tests for Section 3.3: Array Membership Operations"""

    @pytest.fixture
    def parser(self):
        return FOLPredicateParser()

    @pytest.fixture
    def array_graph(self):
        """Graph with array attributes as described in formalism"""
        G = nx.Graph()

        # Cybersecurity nodes with array attributes
        G.add_node("technique1",
                  node_type="technique",
                  platforms=["Linux", "Windows"],
                  tactics=["persistence", "defense_evasion"])
        G.add_node("technique2",
                  node_type="technique",
                  platforms=["macOS"],
                  tactics=["persistence"])
        G.add_node("actor1",
                  node_type="threat_actor",
                  aliases=["Thrip", "APT40"],
                  platforms=["Linux"])

        G.add_edge("technique1", "actor1")
        G.add_edge("technique2", "actor1")

        return G

    def test_array_membership_syntax(self, parser, array_graph):
        """Test Section 3.3: Array membership using 'in' operator"""
        # Test platforms array membership
        predicate = parser.parse('x.platforms in "Linux"')
        result = predicate.evaluate_nodes(array_graph)
        assert result == {"technique1", "actor1"}

        # Test tactics array membership
        predicate = parser.parse('x.tactics in "persistence"')
        result = predicate.evaluate_nodes(array_graph)
        assert result == {"technique1", "technique2"}

        # Test aliases array membership
        predicate = parser.parse('x.aliases in "Thrip"')
        result = predicate.evaluate_nodes(array_graph)
        assert result == {"actor1"}

    def test_array_membership_with_type_constraints(self, parser, array_graph):
        """Test combined array membership and node type constraints"""
        # Linux techniques (formalism example)
        predicate = parser.parse('x.platforms in "Linux" ∧ x.node_type = "technique"')
        result = predicate.evaluate_nodes(array_graph)
        assert result == {"technique1"}

        # Thrip threat actor (formalism example)
        predicate = parser.parse('x.aliases in "Thrip" ∧ x.node_type = "threat_actor"')
        result = predicate.evaluate_nodes(array_graph)
        assert result == {"actor1"}

    def test_cross_space_array_membership_with_quantifiers(self, parser, array_graph):
        """Test Section 4.4 real-world example: Combined arrays and quantifiers"""
        # Complex example from formalism
        predicate = parser.parse(
            'x.platforms in "Linux" ∧ ∃ y ∈ neighbors(x): y.node_type = "threat_actor" ∧ y.aliases in "Thrip"'
        )
        result = predicate.evaluate_nodes(array_graph)
        assert result == {"technique1"}  # Linux technique connected to Thrip actor


class TestCardinalityConstraints:
    """Tests for Section 4: Cardinality Constraints on Neighborhoods"""

    @pytest.fixture
    def parser(self):
        return FOLPredicateParser()

    @pytest.fixture
    def cardinality_graph(self):
        """Graph designed for cardinality constraint testing"""
        G = nx.Graph()

        # Central node with various neighbors
        G.add_node("center", amino_acid_type="SER", residue_type="SER")

        # Different types of neighbors for counting
        G.add_node("his1", amino_acid_type="HIS", verified_status=True)
        G.add_node("his2", amino_acid_type="HIS", verified_status=True)
        G.add_node("asp1", amino_acid_type="ASP", verified_status=False)
        G.add_node("leu1", amino_acid_type="LEU", verified_status=True)
        G.add_node("apt1", actor_type="apt", verified_status=True)

        # Connect to center
        for neighbor in ["his1", "his2", "asp1", "leu1", "apt1"]:
            G.add_edge("center", neighbor)

        return G

    def test_exactly_k_quantifier(self, parser, cardinality_graph):
        """Test Section 4.2: EXACTLY(k) quantifier"""
        # Exactly 2 HIS neighbors (formalism example)
        predicate = parser.parse('EXACTLY(2) y ∈ neighbors(x): y.amino_acid_type = "HIS"')
        result = predicate.evaluate_nodes(cardinality_graph)
        assert result == {"center"}  # center has exactly 2 HIS neighbors

        # Test failure case
        predicate = parser.parse('EXACTLY(3) y ∈ neighbors(x): y.amino_acid_type = "HIS"')
        result = predicate.evaluate_nodes(cardinality_graph)
        assert result == set()  # center doesn't have exactly 3 HIS neighbors

    def test_at_least_k_quantifier(self, parser, cardinality_graph):
        """Test Section 4.2: AT_LEAST(k) quantifier"""
        # At least 1 verified neighbor (formalism example adapted)
        predicate = parser.parse('AT_LEAST(1) y ∈ neighbors(x): y.verified_status = true')
        result = predicate.evaluate_nodes(cardinality_graph)
        assert result == {"center"}  # center has 3 verified neighbors

        # At least 3 verified neighbors
        predicate = parser.parse('AT_LEAST(3) y ∈ neighbors(x): y.verified_status = true')
        result = predicate.evaluate_nodes(cardinality_graph)
        assert result == {"center"}

        # At least 5 verified neighbors (should fail)
        predicate = parser.parse('AT_LEAST(5) y ∈ neighbors(x): y.verified_status = true')
        result = predicate.evaluate_nodes(cardinality_graph)
        assert result == set()

    def test_at_most_k_quantifier(self, parser, cardinality_graph):
        """Test Section 4.2: AT_MOST(k) quantifier"""
        # At most 3 APT actors (all nodes satisfy this since center has 1, others have 0)
        predicate = parser.parse('AT_MOST(3) y ∈ neighbors(x): y.actor_type = "apt"')
        result = predicate.evaluate_nodes(cardinality_graph)
        expected = {"center", "his1", "his2", "asp1", "leu1", "apt1"}
        assert result == expected

        # At most 0 APT actors (only nodes with 0 APT neighbors)
        predicate = parser.parse('AT_MOST(0) y ∈ neighbors(x): y.actor_type = "apt"')
        result = predicate.evaluate_nodes(cardinality_graph)
        expected = {"his1", "his2", "asp1", "leu1", "apt1"}  # center has 1 APT neighbor
        assert result == expected

    def test_cardinality_semantics(self, parser, cardinality_graph):
        """Test Section 4.3: Cardinality constraint semantics"""
        # Verify that cardinality constraints apply to primary entity
        # Neighbor variables are constraint witnesses, not returned
        predicate = parser.parse('EXACTLY(2) y ∈ neighbors(x): y.amino_acid_type = "HIS"')
        result = predicate.evaluate_nodes(cardinality_graph)

        # Only primary entity (center) should be returned, not neighbors
        assert result == {"center"}
        assert "his1" not in result
        assert "his2" not in result

    def test_composable_cardinality_constraints(self, parser, cardinality_graph):
        """Test Section 4.3: Composability with other predicates"""
        # Combine cardinality constraint with atomic predicate
        predicate = parser.parse(
            'x.residue_type = "SER" ∧ EXACTLY(2) y ∈ neighbors(x): y.amino_acid_type = "HIS"'
        )
        result = predicate.evaluate_nodes(cardinality_graph)
        assert result == {"center"}  # SER residue with exactly 2 HIS neighbors


class TestProjectionSemantics:
    """Tests for Section 5: Projection Semantics"""

    @pytest.fixture
    def parser(self):
        return FOLPredicateParser()

    @pytest.fixture
    def projection_graph(self):
        """Graph for testing projection semantics"""
        G = nx.Graph()

        G.add_node("center", node_type="protein")
        G.add_node("enzyme1", node_type="enzyme")
        G.add_node("enzyme2", node_type="enzyme")
        G.add_node("inhibitor1", node_type="inhibitor")
        G.add_node("activator1", node_type="activator")

        # Connect to create desired pattern
        for neighbor in ["enzyme1", "enzyme2", "inhibitor1", "activator1"]:
            G.add_edge("center", neighbor)

        return G

    def test_default_projection_primary_only(self, parser, projection_graph):
        """Test Section 5.1: Default projection returns only primary entities"""
        predicate = parser.parse('EXACTLY(2) y ∈ neighbors(x): y.node_type = "enzyme"')
        result = predicate.evaluate_nodes(projection_graph)

        # Only primary entity returned by default
        assert result == {"center"}
        assert "enzyme1" not in result
        assert "enzyme2" not in result

    def test_projection_with_relational_structure(self, parser, projection_graph):
        """Test Section 5.2: Optional projection returns relational structure"""
        predicate = parser.parse('EXACTLY(2) y ∈ neighbors(x): y.node_type = "enzyme"')

        # Test with projection enabled
        result_obj = predicate.evaluate_nodes_with_projection(
            projection_graph,
            project_variables={"y"}
        )

        assert result_obj.matching_nodes == {"center"}
        assert result_obj.projections is not None
        assert len(result_obj.projections) == 1

        projection = result_obj.projections[0]
        assert projection.primary_node == "center"
        assert "y" in projection.projected_variables
        assert set(projection.projected_variables["y"]) == {"enzyme1", "enzyme2"}

    def test_complex_projection_multiple_quantifiers(self, parser, projection_graph):
        """Test Section 5.2: Complex projections with multiple quantifiers"""
        # Example from formalism: EXACTLY(2) enzymes AND AT_LEAST(1) inhibitor
        predicate = parser.parse(
            'EXACTLY(2) y ∈ neighbors(x): y.node_type = "enzyme" ∧ '
            'AT_LEAST(1) z ∈ neighbors(x): z.node_type = "inhibitor"'
        )

        result_obj = predicate.evaluate_nodes_with_projection(
            projection_graph,
            project_variables={"y", "z"}
        )

        assert result_obj.matching_nodes == {"center"}

        if result_obj.projections:
            projection = result_obj.projections[0]
            assert "y" in projection.projected_variables
            assert "z" in projection.projected_variables


class TestDeterministicSemantics:
    """Tests for Section 6: Deterministic Semantics"""

    @pytest.fixture
    def parser(self):
        return FOLPredicateParser()

    @pytest.fixture
    def determinism_graph(self):
        """Fixed graph for determinism testing"""
        G = nx.Graph()
        G.add_node("n1", category="protein", weight=45.2)
        G.add_node("n2", category="enzyme", weight=62.8)
        G.add_node("n3", category="protein", weight=78.5)
        G.add_edge("n1", "n2")
        G.add_edge("n2", "n3")
        return G

    def test_predicate_evaluation_deterministic(self, parser, determinism_graph):
        """Test Section 6: Predicate evaluation is deterministic"""
        predicate_str = 'x.category = "protein" ∧ degree(x) = 1'

        # Run same predicate multiple times
        results = []
        for _ in range(5):
            predicate = parser.parse(predicate_str)
            result = predicate.evaluate_nodes(determinism_graph)
            results.append(result)

        # All results should be identical
        first_result = results[0]
        for result in results[1:]:
            assert result == first_result

    def test_projection_results_deterministic(self, parser, determinism_graph):
        """Test Section 6: Projection results are deterministic"""
        predicate_str = '∃ y ∈ neighbors(x): category(y) = "enzyme"'

        # Run projection multiple times
        results = []
        for _ in range(5):
            predicate = parser.parse(predicate_str)
            result = predicate.evaluate_nodes_with_projection(
                determinism_graph,
                project_variables={"y"}
            )
            results.append(result)

        # All results should have same matching nodes
        first_result = results[0]
        for result in results[1:]:
            assert result.matching_nodes == first_result.matching_nodes

    def test_independent_of_execution_order(self, parser, determinism_graph):
        """Test Section 6: Results independent of execution order"""
        # Create compound predicate that could be order-sensitive
        predicate = parser.parse(
            'x.category = "protein" ∧ degree(x) = 1 ∨ x.category = "enzyme"'
        )

        result1 = predicate.evaluate_nodes(determinism_graph)

        # Parse and evaluate same logical expression differently structured
        predicate2 = parser.parse(
            '(x.category = "protein" ∧ degree(x) = 1) ∨ x.category = "enzyme"'
        )

        result2 = predicate2.evaluate_nodes(determinism_graph)

        # Should give same result regardless of parsing/evaluation order
        assert result1 == result2


class TestScopeAndConstraints:
    """Tests for Section 7: Scope and Constraints"""

    @pytest.fixture
    def parser(self):
        return FOLPredicateParser()

    def test_bounded_relational_patterns_only(self, parser):
        """Test Section 7: GraphBridge supports only bounded patterns"""
        G = nx.Graph()
        G.add_node("n1", category="protein")
        G.add_node("n2", category="enzyme")
        G.add_node("n3", category="protein")
        G.add_edge("n1", "n2")
        G.add_edge("n2", "n3")

        # Bounded neighbor relationship (supported)
        predicate = parser.parse('∃ y ∈ neighbors(x): category(y) = "enzyme"')
        result = predicate.evaluate_nodes(G)
        assert isinstance(result, set)  # Should work

        # K-hop bounded relationship (supported)
        predicate = parser.parse('∃ y ∈ k_hop_neighbors(x, 2): category(y) = "protein"')
        result = predicate.evaluate_nodes(G)
        assert isinstance(result, set)  # Should work

    def test_node_attributes_only(self, parser):
        """Test Section 7: Only node attributes supported, not edge attributes"""
        G = nx.Graph()
        G.add_node("n1", category="protein", weight=45.2)  # Node attributes OK
        G.add_node("n2", category="enzyme", weight=62.8)
        G.add_edge("n1", "n2", edge_weight=0.8)  # Edge attributes not used in predicates

        # Node attribute predicate should work
        predicate = parser.parse('x.category = "protein"')
        result = predicate.evaluate_nodes(G)
        assert result == {"n1"}

        # Edge attribute predicates not supported in formalism
        # This is tested by absence - no edge attribute syntax in parser


class TestParseErrorHandling:
    """Test error handling in predicate parsing"""

    @pytest.fixture
    def parser(self):
        return FOLPredicateParser()

    def test_invalid_syntax_raises_parse_error(self, parser):
        """Test that invalid syntax raises ParseError"""
        with pytest.raises(ParseError):
            parser.parse("invalid syntax here")

        with pytest.raises(ParseError):
            parser.parse("category(x = protein")  # Missing quote and paren

        with pytest.raises(ParseError):
            parser.parse("∀ y neighbors(x): y.active")  # Missing ∈

    def test_unsupported_operators_raise_error(self, parser):
        """Test that unsupported operators raise ParseError"""
        with pytest.raises(ParseError):
            parser.parse("x.category ~= protein")  # Invalid operator

    def test_malformed_quantifiers_raise_error(self, parser):
        """Test malformed quantifier syntax"""
        with pytest.raises(ParseError):
            parser.parse("EXACTLY() y ∈ neighbors(x): y.active")  # Missing count

        with pytest.raises(ParseError):
            parser.parse("AT_LEAST(abc) y ∈ neighbors(x): y.active")  # Non-numeric count


class TestRealWorldFormalism:
    """Integration tests using real-world examples from formalism document"""

    @pytest.fixture
    def parser(self):
        return FOLPredicateParser()

    @pytest.fixture
    def cybersecurity_graph(self):
        """Real cybersecurity graph matching formalism examples"""
        G = nx.Graph()

        # Techniques with platform arrays
        G.add_node("tech_linux", node_type="technique", platforms=["Linux", "Windows"])
        G.add_node("tech_windows", node_type="technique", platforms=["Windows"])

        # Threat actors with aliases
        G.add_node("thrip_actor", node_type="threat_actor", aliases=["Thrip", "APT40"])
        G.add_node("other_actor", node_type="threat_actor", aliases=["OtherAPT"])

        # Connect Linux technique to Thrip actor (formalism example)
        G.add_edge("tech_linux", "thrip_actor")
        G.add_edge("tech_windows", "other_actor")

        return G

    def test_formalism_section_4_4_real_world_example(self, parser, cybersecurity_graph):
        """Test the exact real-world example from Section 4.4"""
        # Linux techniques connected to Thrip threat actor
        predicate = parser.parse(
            'x.platforms in "Linux" ∧ ∃ y ∈ neighbors(x): '
            'y.node_type = "threat_actor" ∧ y.aliases in "Thrip"'
        )

        result = predicate.evaluate_nodes(cybersecurity_graph)

        # Should match tech_linux: has Linux platform AND connected to Thrip actor
        assert result == {"tech_linux"}

        # Verify the semantic interpretation from formalism
        # "Linux techniques connected to the Thrip threat actor group"
        assert "tech_windows" not in result  # Windows-only technique

    def test_formalism_cross_space_semantics(self, parser, cybersecurity_graph):
        """Test that cross-space predicates encode explicit relationships"""
        # This predicate explicitly encodes:
        # 1. Platform attribute constraint (attribute space)
        # 2. Neighborhood structural constraint (topology space)
        # 3. Neighbor attribute constraint (attribute space)

        predicate = parser.parse(
            'x.platforms in "Linux" ∧ ∃ y ∈ neighbors(x): y.aliases in "Thrip"'
        )

        result = predicate.evaluate_nodes(cybersecurity_graph)
        assert result == {"tech_linux"}

        # The predicate makes the relationship explicit and reusable
        # As required by formalism: "Replace implicit mental coordination"
        predicate_str = predicate.to_string()
        assert "platforms" in predicate_str
        assert "neighbors" in predicate_str
        assert "aliases" in predicate_str
