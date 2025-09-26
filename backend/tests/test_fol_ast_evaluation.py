"""
Comprehensive tests for FOL AST evaluation engine.

Tests the core evaluation logic for all AST node types:
- AtomicPredicate evaluation
- CompoundPredicate evaluation
- QuantifiedPredicate evaluation
- CrossSpacePredicate evaluation with projections
"""

import pytest
import networkx as nx

from src.services.compiler.fol_ast import (
    AtomicPredicate,
    ComparisonOperator,
    CompoundPredicate,
    CrossSpacePredicate,
    LogicalConnective,
    QuantifiedPredicate,
    Quantifier,
    Relation,
    Variable,
    EvaluationResult,
    ProjectionResult,
)


class TestAtomicPredicateEvaluation:
    """Test atomic predicate evaluation across all supported types"""

    @pytest.fixture
    def test_graph(self):
        G = nx.Graph()

        # Nodes with comprehensive attribute coverage
        G.add_node("n1",
                  type="protein",
                  category="enzyme",
                  molecular_weight=45.2,
                  active=True,
                  platforms=["Linux", "Windows"],
                  count=5)
        G.add_node("n2",
                  type="compound",
                  category="inhibitor",
                  molecular_weight=120.8,
                  active=False,
                  platforms=["macOS"],
                  count=3)
        G.add_node("n3",
                  type="protein",
                  category="enzyme",
                  molecular_weight=78.5,
                  active=True,
                  platforms=["Linux", "macOS"],
                  count=7)

        # Create topology for centrality/clustering tests
        G.add_edge("n1", "n2")
        G.add_edge("n2", "n3")
        G.add_edge("n1", "n3")

        return G

    def test_attribute_predicate_string_equality(self, test_graph):
        """Test string attribute equality predicates"""
        predicate = AtomicPredicate("attr_type", "x", ComparisonOperator.EQUALS, "protein")

        # Test positive case
        result, projections = predicate.evaluate_with_projection(test_graph, {"x": "n1"})
        assert result is True

        # Test negative case
        result, projections = predicate.evaluate_with_projection(test_graph, {"x": "n2"})
        assert result is False

    def test_attribute_predicate_numerical_comparisons(self, test_graph):
        """Test numerical attribute comparison operators"""
        # Greater than
        predicate = AtomicPredicate("attr_molecular_weight", "x", ComparisonOperator.GREATER, 50.0)
        result, _ = predicate.evaluate_with_projection(test_graph, {"x": "n2"})
        assert result is True  # 120.8 > 50.0

        result, _ = predicate.evaluate_with_projection(test_graph, {"x": "n1"})
        assert result is False  # 45.2 < 50.0

        # Less than or equal
        predicate = AtomicPredicate("attr_molecular_weight", "x", ComparisonOperator.LESS_EQUAL, 78.5)
        result, _ = predicate.evaluate_with_projection(test_graph, {"x": "n3"})
        assert result is True  # 78.5 <= 78.5

        # Not equals
        predicate = AtomicPredicate("attr_count", "x", ComparisonOperator.NOT_EQUALS, 5)
        result, _ = predicate.evaluate_with_projection(test_graph, {"x": "n2"})
        assert result is True  # 3 != 5

    def test_attribute_predicate_boolean_values(self, test_graph):
        """Test boolean attribute predicates"""
        predicate = AtomicPredicate("attr_active", "x", ComparisonOperator.EQUALS, True)

        result, _ = predicate.evaluate_with_projection(test_graph, {"x": "n1"})
        assert result is True

        result, _ = predicate.evaluate_with_projection(test_graph, {"x": "n2"})
        assert result is False

    def test_attribute_predicate_array_membership(self, test_graph):
        """Test array membership operations"""
        # IN operator for arrays
        predicate = AtomicPredicate("attr_platforms", "x", ComparisonOperator.EQUALS, "Linux")
        result, _ = predicate.evaluate_with_projection(test_graph, {"x": "n1"})
        assert result is True  # "Linux" in ["Linux", "Windows"]

        # NOT_EQUALS for arrays (not in)
        predicate = AtomicPredicate("attr_platforms", "x", ComparisonOperator.NOT_EQUALS, "Windows")
        result, _ = predicate.evaluate_with_projection(test_graph, {"x": "n2"})
        assert result is True  # "Windows" not in ["macOS"]

    def test_topology_predicate_degree(self, test_graph):
        """Test degree topology predicates"""
        predicate = AtomicPredicate("degree", "x", ComparisonOperator.EQUALS, 2)

        # All nodes have degree 2 in this triangle
        for node in ["n1", "n2", "n3"]:
            result, _ = predicate.evaluate_with_projection(test_graph, {"x": node})
            assert result is True

        # Test greater than
        predicate = AtomicPredicate("degree", "x", ComparisonOperator.GREATER, 1)
        result, _ = predicate.evaluate_with_projection(test_graph, {"x": "n1"})
        assert result is True

    def test_topology_predicate_clustering(self, test_graph):
        """Test clustering coefficient topology predicates"""
        predicate = AtomicPredicate("clustering", "x", ComparisonOperator.EQUALS, 1.0)

        # In a complete triangle, all nodes have clustering coefficient 1.0
        for node in ["n1", "n2", "n3"]:
            result, _ = predicate.evaluate_with_projection(test_graph, {"x": node})
            assert result is True

    def test_topology_predicate_centrality(self, test_graph):
        """Test centrality topology predicates"""
        # Betweenness centrality
        predicate = AtomicPredicate("betweenness_centrality", "x", ComparisonOperator.GREATER_EQUAL, 0.0)
        result, _ = predicate.evaluate_with_projection(test_graph, {"x": "n1"})
        assert result is True

        # Closeness centrality
        predicate = AtomicPredicate("closeness_centrality", "x", ComparisonOperator.GREATER, 0.0)
        result, _ = predicate.evaluate_with_projection(test_graph, {"x": "n2"})
        assert result is True

    def test_invalid_predicate_type(self, test_graph):
        """Test handling of invalid predicate types"""
        predicate = AtomicPredicate("invalid_type", "x", ComparisonOperator.EQUALS, "value")
        result, _ = predicate.evaluate_with_projection(test_graph, {"x": "n1"})
        assert result is False

    def test_missing_attribute(self, test_graph):
        """Test handling of missing attributes"""
        predicate = AtomicPredicate("attr_missing", "x", ComparisonOperator.EQUALS, "value")
        result, _ = predicate.evaluate_with_projection(test_graph, {"x": "n1"})
        assert result is False

    def test_to_string_formatting(self):
        """Test string representation of atomic predicates"""
        # Attribute predicate
        predicate = AtomicPredicate("attr_type", "x", ComparisonOperator.EQUALS, "protein")
        assert predicate.to_string() == 'type(x, "protein")'

        # Topology predicate
        predicate = AtomicPredicate("degree", "x", ComparisonOperator.GREATER, 3)
        assert predicate.to_string() == "degree(x) > 3"

        # Negated attribute predicate
        predicate = AtomicPredicate("attr_active", "x", ComparisonOperator.NOT_EQUALS, True)
        assert predicate.to_string() == "¬active(x, True)"


class TestCompoundPredicateEvaluation:
    """Test compound predicate evaluation with logical connectives"""

    @pytest.fixture
    def test_graph(self):
        G = nx.Graph()
        G.add_node("n1", type="protein", active=True, weight=45.2)
        G.add_node("n2", type="enzyme", active=False, weight=62.8)
        G.add_node("n3", type="protein", active=True, weight=78.5)
        G.add_edge("n1", "n2")
        return G

    def test_conjunction_and_operation(self, test_graph):
        """Test AND logical connective"""
        # Both conditions true
        pred1 = AtomicPredicate("attr_type", "x", ComparisonOperator.EQUALS, "protein")
        pred2 = AtomicPredicate("attr_active", "x", ComparisonOperator.EQUALS, True)
        compound = CompoundPredicate(LogicalConnective.AND, [pred1, pred2])

        result, _ = compound.evaluate_with_projection(test_graph, {"x": "n1"})
        assert result is True  # protein AND active

        result, _ = compound.evaluate_with_projection(test_graph, {"x": "n2"})
        assert result is False  # enzyme (not protein) AND not active

    def test_disjunction_or_operation(self, test_graph):
        """Test OR logical connective"""
        pred1 = AtomicPredicate("attr_type", "x", ComparisonOperator.EQUALS, "enzyme")
        pred2 = AtomicPredicate("attr_weight", "x", ComparisonOperator.GREATER, 70.0)
        compound = CompoundPredicate(LogicalConnective.OR, [pred1, pred2])

        result, _ = compound.evaluate_with_projection(test_graph, {"x": "n2"})
        assert result is True  # enzyme OR high weight (enzyme is true)

        result, _ = compound.evaluate_with_projection(test_graph, {"x": "n3"})
        assert result is True  # protein OR high weight (high weight is true)

        result, _ = compound.evaluate_with_projection(test_graph, {"x": "n1"})
        assert result is False  # protein OR high weight (both false)

    def test_negation_not_operation(self, test_graph):
        """Test NOT logical connective"""
        pred = AtomicPredicate("attr_active", "x", ComparisonOperator.EQUALS, True)
        compound = CompoundPredicate(LogicalConnective.NOT, [pred])

        result, _ = compound.evaluate_with_projection(test_graph, {"x": "n1"})
        assert result is False  # NOT(active=True) for active node

        result, _ = compound.evaluate_with_projection(test_graph, {"x": "n2"})
        assert result is True  # NOT(active=True) for inactive node

    def test_complex_nested_compounds(self, test_graph):
        """Test nested compound predicates"""
        # (protein AND active) OR (enzyme AND NOT active)
        pred1 = AtomicPredicate("attr_type", "x", ComparisonOperator.EQUALS, "protein")
        pred2 = AtomicPredicate("attr_active", "x", ComparisonOperator.EQUALS, True)
        pred3 = AtomicPredicate("attr_type", "x", ComparisonOperator.EQUALS, "enzyme")
        pred4 = AtomicPredicate("attr_active", "x", ComparisonOperator.EQUALS, True)

        not_pred4 = CompoundPredicate(LogicalConnective.NOT, [pred4])
        left_and = CompoundPredicate(LogicalConnective.AND, [pred1, pred2])
        right_and = CompoundPredicate(LogicalConnective.AND, [pred3, not_pred4])
        final_or = CompoundPredicate(LogicalConnective.OR, [left_and, right_and])

        result, _ = final_or.evaluate_with_projection(test_graph, {"x": "n1"})
        assert result is True  # protein AND active

        result, _ = final_or.evaluate_with_projection(test_graph, {"x": "n2"})
        assert result is True  # enzyme AND NOT active

        result, _ = final_or.evaluate_with_projection(test_graph, {"x": "n3"})
        assert result is True  # protein AND active

    def test_projection_aggregation(self, test_graph):
        """Test that projections are properly aggregated in compound predicates"""
        pred1 = AtomicPredicate("attr_type", "x", ComparisonOperator.EQUALS, "protein")
        pred2 = AtomicPredicate("attr_active", "x", ComparisonOperator.EQUALS, True)
        compound = CompoundPredicate(LogicalConnective.AND, [pred1, pred2])

        result, projections = compound.evaluate_with_projection(
            test_graph, {"x": "n1"}, project_variables={"x"}
        )
        assert result is True
        assert isinstance(projections, dict)

    def test_short_circuit_evaluation(self, test_graph):
        """Test that AND short-circuits on false, OR short-circuits on true"""
        # For AND: if first is false, second shouldn't be evaluated (no exception)
        pred1 = AtomicPredicate("attr_type", "x", ComparisonOperator.EQUALS, "nonexistent")
        pred2 = AtomicPredicate("invalid_attr", "x", ComparisonOperator.EQUALS, "value")
        compound = CompoundPredicate(LogicalConnective.AND, [pred1, pred2])

        # Should not raise exception despite invalid second predicate
        result, _ = compound.evaluate_with_projection(test_graph, {"x": "n1"})
        assert result is False

    def test_to_string_compound_formatting(self):
        """Test string representation of compound predicates"""
        pred1 = AtomicPredicate("attr_type", "x", ComparisonOperator.EQUALS, "protein")
        pred2 = AtomicPredicate("degree", "x", ComparisonOperator.GREATER, 2)

        # AND compound
        compound_and = CompoundPredicate(LogicalConnective.AND, [pred1, pred2])
        expected = '(type(x, "protein")∧degree(x) > 2)'
        assert compound_and.to_string() == expected

        # OR compound
        compound_or = CompoundPredicate(LogicalConnective.OR, [pred1, pred2])
        expected = '(type(x, "protein")∨degree(x) > 2)'
        assert compound_or.to_string() == expected

        # NOT compound
        compound_not = CompoundPredicate(LogicalConnective.NOT, [pred1])
        expected = '¬(type(x, "protein"))'
        assert compound_not.to_string() == expected


class TestQuantifiedPredicateEvaluation:
    """Test quantified predicate evaluation with all quantifier types"""

    @pytest.fixture
    def neighborhood_graph(self):
        """Graph with well-defined neighborhood structure"""
        G = nx.Graph()

        # Central node
        G.add_node("center", type="hub", active=True)

        # Various neighbors for testing quantifiers
        G.add_node("enzyme1", type="enzyme", active=True, verified=True)
        G.add_node("enzyme2", type="enzyme", active=False, verified=True)
        G.add_node("protein1", type="protein", active=True, verified=False)
        G.add_node("protein2", type="protein", active=True, verified=True)
        G.add_node("compound1", type="compound", active=False, verified=False)

        # Connect all to center
        for neighbor in ["enzyme1", "enzyme2", "protein1", "protein2", "compound1"]:
            G.add_edge("center", neighbor)

        # Isolated node for testing empty neighborhoods
        G.add_node("isolated", type="hub", active=False)

        return G

    def test_universal_quantifier_forall(self, neighborhood_graph):
        """Test universal quantifier (∀)"""
        constraint = AtomicPredicate("attr_active", "y", ComparisonOperator.EQUALS, True)
        quantified = QuantifiedPredicate(
            quantifier=Quantifier.FORALL,
            variable=Variable("y"),
            relation=Relation.NEIGHBORS,
            target="x",
            constraint=constraint
        )

        # Not all neighbors are active
        result, _ = quantified.evaluate_with_projection(neighborhood_graph, {"x": "center"})
        assert result is False

        # Test with modified graph where all neighbors are active
        for node in neighborhood_graph.neighbors("center"):
            neighborhood_graph.nodes[node]["active"] = True

        result, _ = quantified.evaluate_with_projection(neighborhood_graph, {"x": "center"})
        assert result is True

        # Test with isolated node (GraphBridge semantics: requires actual neighbors)
        result, _ = quantified.evaluate_with_projection(neighborhood_graph, {"x": "isolated"})
        assert result is False  # ∀ requires at least one neighbor to exist

    def test_existential_quantifier_exists(self, neighborhood_graph):
        """Test existential quantifier (∃)"""
        constraint = AtomicPredicate("attr_type", "y", ComparisonOperator.EQUALS, "enzyme")
        quantified = QuantifiedPredicate(
            quantifier=Quantifier.EXISTS,
            variable=Variable("y"),
            relation=Relation.NEIGHBORS,
            target="x",
            constraint=constraint
        )

        # At least one neighbor is enzyme
        result, _ = quantified.evaluate_with_projection(neighborhood_graph, {"x": "center"})
        assert result is True

        # Test with isolated node
        result, _ = quantified.evaluate_with_projection(neighborhood_graph, {"x": "isolated"})
        assert result is False  # ∃ over empty set is false

    def test_exactly_k_quantifier(self, neighborhood_graph):
        """Test exactly(k) quantifier"""
        constraint = AtomicPredicate("attr_type", "y", ComparisonOperator.EQUALS, "enzyme")
        quantified = QuantifiedPredicate(
            quantifier=Quantifier.EXACTLY,
            variable=Variable("y"),
            relation=Relation.NEIGHBORS,
            target="x",
            constraint=constraint,
            count_parameter=2
        )

        # Exactly 2 neighbors are enzymes
        result, _ = quantified.evaluate_with_projection(neighborhood_graph, {"x": "center"})
        assert result is True

        # Test different count
        quantified.count_parameter = 3
        result, _ = quantified.evaluate_with_projection(neighborhood_graph, {"x": "center"})
        assert result is False

    def test_at_least_k_quantifier(self, neighborhood_graph):
        """Test at_least(k) quantifier"""
        constraint = AtomicPredicate("attr_verified", "y", ComparisonOperator.EQUALS, True)
        quantified = QuantifiedPredicate(
            quantifier=Quantifier.AT_LEAST,
            variable=Variable("y"),
            relation=Relation.NEIGHBORS,
            target="x",
            constraint=constraint,
            count_parameter=2
        )

        # At least 2 neighbors are verified
        result, _ = quantified.evaluate_with_projection(neighborhood_graph, {"x": "center"})
        assert result is True  # enzyme1, enzyme2, protein2 are verified

        # Test higher threshold
        quantified.count_parameter = 4
        result, _ = quantified.evaluate_with_projection(neighborhood_graph, {"x": "center"})
        assert result is False  # Only 3 verified neighbors

    def test_at_most_k_quantifier(self, neighborhood_graph):
        """Test at_most(k) quantifier"""
        constraint = AtomicPredicate("attr_type", "y", ComparisonOperator.EQUALS, "protein")
        quantified = QuantifiedPredicate(
            quantifier=Quantifier.AT_MOST,
            variable=Variable("y"),
            relation=Relation.NEIGHBORS,
            target="x",
            constraint=constraint,
            count_parameter=3
        )

        # At most 3 neighbors are proteins (actual: 2)
        result, _ = quantified.evaluate_with_projection(neighborhood_graph, {"x": "center"})
        assert result is True

        # Test lower threshold
        quantified.count_parameter = 1
        result, _ = quantified.evaluate_with_projection(neighborhood_graph, {"x": "center"})
        assert result is False  # 2 proteins > 1

    def test_type_constraints(self, neighborhood_graph):
        """Test type constraints on quantified variables"""
        constraint = AtomicPredicate("attr_active", "y", ComparisonOperator.EQUALS, True)
        quantified = QuantifiedPredicate(
            quantifier=Quantifier.EXISTS,
            variable=Variable("y", "enzyme"),  # Type constraint
            relation=Relation.NEIGHBORS,
            target="x",
            constraint=constraint
        )

        # Should only consider enzyme neighbors for the constraint
        result, _ = quantified.evaluate_with_projection(neighborhood_graph, {"x": "center"})
        assert result is True  # enzyme1 is active

        # Change to type that doesn't exist
        quantified.variable.type_constraint = "nonexistent"
        result, _ = quantified.evaluate_with_projection(neighborhood_graph, {"x": "center"})
        assert result is False

    def test_k_hop_neighbors_relation(self, neighborhood_graph):
        """Test k-hop neighbors relation"""
        # Add 2-hop neighbors
        G = neighborhood_graph
        G.add_node("distant1", type="distant", active=True)
        G.add_node("distant2", type="distant", active=False)
        G.add_edge("enzyme1", "distant1")
        G.add_edge("protein1", "distant2")

        constraint = AtomicPredicate("attr_type", "y", ComparisonOperator.EQUALS, "distant")
        quantified = QuantifiedPredicate(
            quantifier=Quantifier.EXISTS,
            variable=Variable("y"),
            relation=Relation.K_HOP,
            target="x",
            constraint=constraint,
            k_parameter=2
        )

        # Should find distant nodes at 2 hops
        result, _ = quantified.evaluate_with_projection(G, {"x": "center"})
        assert result is True

    def test_connected_components_relation(self, neighborhood_graph):
        """Test connected components relation"""
        constraint = AtomicPredicate("attr_type", "y", ComparisonOperator.EQUALS, "compound")
        quantified = QuantifiedPredicate(
            quantifier=Quantifier.EXISTS,
            variable=Variable("y"),
            relation=Relation.CONNECTED_COMPONENTS,
            target="x",
            constraint=constraint
        )

        # Should find compound1 in same component as center
        result, _ = quantified.evaluate_with_projection(neighborhood_graph, {"x": "center"})
        assert result is True

        # Isolated node should not find compound in its component
        result, _ = quantified.evaluate_with_projection(neighborhood_graph, {"x": "isolated"})
        assert result is False

    def test_projection_with_quantified_predicates(self, neighborhood_graph):
        """Test projection of quantified variables"""
        constraint = AtomicPredicate("attr_type", "y", ComparisonOperator.EQUALS, "enzyme")
        quantified = QuantifiedPredicate(
            quantifier=Quantifier.EXACTLY,
            variable=Variable("y"),
            relation=Relation.NEIGHBORS,
            target="x",
            constraint=constraint,
            count_parameter=2
        )

        result, projections = quantified.evaluate_with_projection(
            neighborhood_graph, {"x": "center"}, project_variables={"y"}
        )

        assert result is True
        assert "y" in projections
        assert set(projections["y"]) == {"enzyme1", "enzyme2"}

    def test_to_string_quantified_formatting(self):
        """Test string representation of quantified predicates"""
        constraint = AtomicPredicate("attr_active", "y", ComparisonOperator.EQUALS, True)

        # Universal quantifier
        quantified = QuantifiedPredicate(
            quantifier=Quantifier.FORALL,
            variable=Variable("y"),
            relation=Relation.NEIGHBORS,
            target="x",
            constraint=constraint
        )
        expected = "∀ y ∈ neighbors(x): active(y, True)"
        assert quantified.to_string() == expected

        # Counting quantifier with type constraint
        quantified = QuantifiedPredicate(
            quantifier=Quantifier.EXACTLY,
            variable=Variable("y", "enzyme"),
            relation=Relation.NEIGHBORS,
            target="x",
            constraint=constraint,
            count_parameter=3
        )
        expected = "EXACTLY(3) y: enzyme ∈ neighbors(x): active(y, True)"
        assert quantified.to_string() == expected


class TestCrossSpacePredicateIntegration:
    """Test CrossSpacePredicate evaluation and projection"""

    @pytest.fixture
    def cross_space_graph(self):
        """Graph for cross-space testing"""
        G = nx.Graph()

        # Hub nodes with high degree
        G.add_node("hub1", type="protein", category="enzyme", weight=45.2, active=True)
        G.add_node("hub2", type="protein", category="inhibitor", weight=120.8, active=False)

        # Regular nodes
        for i in range(6):
            G.add_node(f"regular{i}", type="compound", category="substrate", weight=20.0, active=True)
            G.add_edge("hub1", f"regular{i}")

        for i in range(3):
            G.add_node(f"special{i}", type="protein", category="enzyme", weight=30.0, active=False)
            G.add_edge("hub2", f"special{i}")

        return G

    def test_cross_space_evaluation_single_variable(self, cross_space_graph):
        """Test cross-space predicate with single free variable"""
        # High degree proteins
        pred1 = AtomicPredicate("degree", "x", ComparisonOperator.GREATER, 3)
        pred2 = AtomicPredicate("attr_type", "x", ComparisonOperator.EQUALS, "protein")
        compound = CompoundPredicate(LogicalConnective.AND, [pred1, pred2])

        cross_space = CrossSpacePredicate(compound, "High-degree proteins")

        result = cross_space.evaluate_nodes(cross_space_graph)
        # hub1: degree=6 > 3 and type=protein ✓, hub2: degree=3 not > 3 ✗
        assert result == {"hub1"}

    def test_cross_space_evaluation_with_projection(self, cross_space_graph):
        """Test cross-space predicate evaluation with projection"""
        # Proteins with many compound neighbors
        constraint = AtomicPredicate("attr_type", "y", ComparisonOperator.EQUALS, "compound")
        quantified = QuantifiedPredicate(
            quantifier=Quantifier.AT_LEAST,
            variable=Variable("y"),
            relation=Relation.NEIGHBORS,
            target="x",
            constraint=constraint,
            count_parameter=3
        )

        cross_space = CrossSpacePredicate(quantified, "Proteins with many compound neighbors")

        result_obj = cross_space.evaluate_nodes_with_projection(
            cross_space_graph, project_variables={"y"}
        )

        assert result_obj.matching_nodes == {"hub1"}
        assert result_obj.projections is not None
        assert len(result_obj.projections) == 1

        projection = result_obj.projections[0]
        assert projection.primary_node == "hub1"
        assert "y" in projection.projected_variables
        assert len(projection.projected_variables["y"]) >= 3

    def test_cross_space_complex_predicate(self, cross_space_graph):
        """Test complex cross-space predicate combining multiple aspects"""
        # Active proteins with high degree AND enzyme category neighbors
        pred1 = AtomicPredicate("attr_type", "x", ComparisonOperator.EQUALS, "protein")
        pred2 = AtomicPredicate("attr_active", "x", ComparisonOperator.EQUALS, True)
        pred3 = AtomicPredicate("degree", "x", ComparisonOperator.GREATER, 5)

        base_compound = CompoundPredicate(LogicalConnective.AND, [pred1, pred2, pred3])

        cross_space = CrossSpacePredicate(base_compound)
        result = cross_space.evaluate_nodes(cross_space_graph)

        assert result == {"hub1"}  # Only hub1 is active protein with high degree

    def test_cross_space_error_handling(self, cross_space_graph):
        """Test error handling in cross-space evaluation"""
        # Predicate that might cause errors
        pred = AtomicPredicate("invalid_attr", "x", ComparisonOperator.EQUALS, "value")
        cross_space = CrossSpacePredicate(pred)

        # Should not crash, should handle errors gracefully
        result = cross_space.evaluate_nodes(cross_space_graph)
        assert isinstance(result, set)
        assert len(result) == 0  # No matches due to invalid predicate

    def test_cross_space_deterministic_evaluation(self, cross_space_graph):
        """Test that cross-space evaluation is deterministic"""
        pred1 = AtomicPredicate("attr_type", "x", ComparisonOperator.EQUALS, "protein")
        pred2 = AtomicPredicate("degree", "x", ComparisonOperator.GREATER, 2)
        compound = CompoundPredicate(LogicalConnective.AND, [pred1, pred2])

        cross_space = CrossSpacePredicate(compound)

        # Multiple evaluations should yield identical results
        results = []
        for _ in range(5):
            result = cross_space.evaluate_nodes(cross_space_graph)
            results.append(result)

        # All results should be identical
        first_result = results[0]
        for result in results[1:]:
            assert result == first_result

    def test_cross_space_to_string(self):
        """Test string representation of cross-space predicates"""
        pred = AtomicPredicate("attr_type", "x", ComparisonOperator.EQUALS, "protein")
        cross_space = CrossSpacePredicate(pred, "Custom description")

        assert cross_space.description == "Custom description"
        assert cross_space.to_string() == 'type(x, "protein")'
