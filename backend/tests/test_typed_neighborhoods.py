"""Tests for typed, schema-constrained neighborhood operators.

Covers:
  1. Schema extraction (undirected and directed)
  2. Sibling bridge exclusion (rule: terminal_node_type == source_node_type)
  3. Cross-type mixed-edge-type paths are preserved
  4. Typed adjacency index: get_typed_neighbors, get_typed_2hop_neighbors
  5. evaluate_typed_path_existential
  6. evaluate_typed_path_count_ge
  7. NeighborhoodLiteralSpec.to_fol_string and is_typed
  8. Parser roundtrip for typed path expressions
  9. No untyped k_hop=2 literals are generated
  10. LiteralGenerator produces no sibling 2-hop outputs
  11. BeamSearch._literal_key distinguishes typed path literals
  12. End-to-end: no sibling leak in learned clauses
"""

from __future__ import annotations

import networkx as nx

from fol.schema import EdgeStep, enumerate_2hop_paths, extract_edge_schema

# ---------------------------------------------------------------------------
# Shared synthetic graph fixture
# ---------------------------------------------------------------------------


def _make_bron_like_graph() -> nx.Graph:
    """Small undirected graph mirroring the BRON sibling-bridge problem.

    Nodes:
        T1, T2  — technique
        P       — platform
        APT     — apt_group
        M       — malware

    Edges (all undirected):
        T1 --[targets]--> P
        T2 --[targets]--> P
        APT --[uses]--> T1
        APT --[uses]--> M
    """
    G = nx.Graph()
    G.add_node("T1", node_type="technique")
    G.add_node("T2", node_type="technique")
    G.add_node("P", node_type="platform")
    G.add_node("APT", node_type="apt_group")
    G.add_node("M", node_type="malware")

    G.add_edge("T1", "P", edge_type="targets")
    G.add_edge("T2", "P", edge_type="targets")
    G.add_edge("APT", "T1", edge_type="uses")
    G.add_edge("APT", "M", edge_type="uses")
    return G


# ---------------------------------------------------------------------------
# Test 1: Schema extraction
# ---------------------------------------------------------------------------


class TestSchemaExtraction:
    def test_undirected_both_directions_stored(self):
        G = _make_bron_like_graph()
        schema = extract_edge_schema(G)

        # "targets" edges: T1--P and T2--P
        assert "targets" in schema
        assert ("technique", "platform") in schema["targets"]
        assert ("platform", "technique") in schema["targets"]  # both directions

    def test_directed_only_forward_direction(self):
        G = nx.DiGraph()
        G.add_node("D", node_type="drug")
        G.add_node("Dis", node_type="disease")
        G.add_edge("D", "Dis", edge_type="treats")
        schema = extract_edge_schema(G)

        assert ("drug", "disease") in schema["treats"]
        assert ("disease", "drug") not in schema["treats"]  # directed: no reverse

    def test_missing_edge_type_defaults_to_related(self):
        G = nx.Graph()
        G.add_node("A", node_type="x")
        G.add_node("B", node_type="y")
        G.add_edge("A", "B")  # no edge_type attribute
        schema = extract_edge_schema(G)
        assert "related" in schema


# ---------------------------------------------------------------------------
# Test 2: Sibling bridge exclusion — refined rule
# ---------------------------------------------------------------------------


class TestSiblingBridgeExclusion:
    def test_targets_targets_technique_excluded(self):
        """T1 →[targets]→ P →[targets]→ T2: same edge type + same terminal type."""
        G = _make_bron_like_graph()
        schema = extract_edge_schema(G)
        paths = enumerate_2hop_paths(schema, exclude_sibling_bridges=True)

        sibling_path = (EdgeStep("targets"), EdgeStep("targets"))
        assert (
            sibling_path not in paths
        ), "targets·targets from technique should be excluded as sibling bridge"

    def test_uses_uses_excluded_when_any_combination_cycles(self):
        """uses·uses is excluded if ANY type combination creates a cycle.

        Even though Technique→APT→Malware (src=technique, terminal=malware) is
        non-circular, the same path also admits Technique→APT→Technique
        (src=technique, terminal=technique) which IS circular.  Because path
        evaluation cannot restrict to specific intermediate node types, we exclude
        the entire (uses, uses) path pair when any combination is a sibling bridge.
        """
        G = _make_bron_like_graph()
        schema = extract_edge_schema(G)
        paths = enumerate_2hop_paths(schema, exclude_sibling_bridges=True)

        uses_uses = (EdgeStep("uses"), EdgeStep("uses"))
        assert uses_uses not in paths, (
            "uses·uses should be excluded: Technique→APT→Technique combination "
            "is a sibling bridge, so the entire path pair is rejected"
        )

    def test_disable_exclusion_includes_sibling(self):
        G = _make_bron_like_graph()
        schema = extract_edge_schema(G)
        paths_with = enumerate_2hop_paths(schema, exclude_sibling_bridges=True)
        paths_without = enumerate_2hop_paths(schema, exclude_sibling_bridges=False)

        sibling_path = (EdgeStep("targets"), EdgeStep("targets"))
        assert sibling_path not in paths_with
        assert sibling_path in paths_without


# ---------------------------------------------------------------------------
# Test 3: Paths with different edge types are never excluded
# ---------------------------------------------------------------------------


class TestDifferentEdgeTypeNotExcluded:
    def test_uses_targets_cross_type_not_excluded(self):
        """APT →[uses]→ Technique →[targets]→ Platform: src=apt_group, terminal=platform.

        The exclusion rule only fires when terminal_type == source_type.
        apt_group ≠ platform, so uses·targets must be preserved.
        """
        G = _make_bron_like_graph()
        schema = extract_edge_schema(G)
        paths = enumerate_2hop_paths(schema, exclude_sibling_bridges=True)

        uses_targets = (EdgeStep("uses"), EdgeStep("targets"))
        assert uses_targets in paths, (
            "uses·targets path (APT→Technique→Platform) should not be excluded: "
            "source_type(apt_group) ≠ terminal_type(platform)"
        )


# ---------------------------------------------------------------------------
# Test 4: Typed adjacency index
# ---------------------------------------------------------------------------


class TestTypedAdjacencyIndex:
    def test_get_typed_neighbors_targets(self):
        from fol.learning.neighborhood_index import NeighborhoodIndex

        G = _make_bron_like_graph()
        idx = NeighborhoodIndex(G)

        assert idx.get_typed_neighbors("T1", "targets") == {"P"}
        assert idx.get_typed_neighbors("P", "targets") == {"T1", "T2"}

    def test_get_typed_2hop_neighbors_same_type_excluded(self):
        from fol.learning.neighborhood_index import NeighborhoodIndex

        G = _make_bron_like_graph()
        idx = NeighborhoodIndex(G)

        # T1 →[targets]→ P →[targets]→ T2: source_type(T1)==technique, terminal_type(T2)==technique
        # → excluded by actor-closure rule. Result should be empty.
        two_hop = idx.get_typed_2hop_neighbors("T1", "targets", "targets")
        assert "T2" not in two_hop  # same type as source T1, excluded
        assert "T1" not in two_hop  # self always excluded

    def test_get_typed_2hop_neighbors_cross_type_allowed(self):
        from fol.learning.neighborhood_index import NeighborhoodIndex

        G = _make_bron_like_graph()
        # T1 →[uses]→ APT →[uses]→ M: source=technique, terminal=malware → allowed
        G.add_edge("T1", "APT", edge_type="uses")  # make the path explicit
        idx = NeighborhoodIndex(G)

        two_hop = idx.get_typed_2hop_neighbors("T1", "uses", "uses")
        assert "M" in two_hop  # technique→APT→malware: cross-type, allowed
        assert "T1" not in two_hop  # self excluded

    def test_apt_uses_uses_does_not_include_self(self):
        from fol.learning.neighborhood_index import NeighborhoodIndex

        G = _make_bron_like_graph()
        idx = NeighborhoodIndex(G)

        # APT --[uses]--> T1 --[uses?]--> ... T1 has no 'uses' edges so result empty
        # APT --[uses]--> M --[uses?]--> ... M has no 'uses' edges
        two_hop = idx.get_typed_2hop_neighbors("APT", "uses", "uses")
        assert "APT" not in two_hop


# ---------------------------------------------------------------------------
# Test 5: evaluate_typed_path_existential
# ---------------------------------------------------------------------------


class TestEvaluateTypedPathExistential:
    def test_existential_2hop(self):
        from fol.learning.neighborhood_index import NeighborhoodIndex

        G = _make_bron_like_graph()
        NeighborhoodIndex(G)

        # Nodes satisfying Malware(y): {M}
        malware_matches = {"M"}

        # ∃y ∈ N_{uses.uses}(x) : Malware(y)
        # APT --[uses]--> T1 --[uses?] or APT --[uses]--> M (direct, not 2-hop)
        # For 2-hop: APT →[uses]→ T1 →[uses]→ M: T1 needs a 'uses' edge to M
        # In our graph T1 has no 'uses' edge so this is empty
        # But APT itself: APT →[uses]→ M is only 1-hop.
        # Let's add T1 --[uses]--> M to make the test meaningful
        G2 = G.copy()
        G2.add_edge("T1", "M", edge_type="uses")
        idx2 = NeighborhoodIndex(G2)

        result = idx2.evaluate_typed_path_existential(
            (EdgeStep("uses"), EdgeStep("uses")), malware_matches
        )
        # APT →[uses]→ T1 →[uses]→ M: APT satisfies the literal
        assert "APT" in result

    def test_existential_1hop(self):
        from fol.learning.neighborhood_index import NeighborhoodIndex

        G = _make_bron_like_graph()
        idx = NeighborhoodIndex(G)

        malware_matches = {"M"}
        result = idx.evaluate_typed_path_existential(
            (EdgeStep("uses"),), malware_matches
        )
        # APT --[uses]--> M: APT satisfies ∃y ∈ N_{uses}(x) : Malware(y)
        assert "APT" in result
        assert "T1" not in result  # T1 has no 'uses' edge to M


# ---------------------------------------------------------------------------
# Test 6: evaluate_typed_path_count_ge
# ---------------------------------------------------------------------------


class TestEvaluateTypedPathCountGe:
    def test_count_ge_1hop(self):
        from fol.learning.neighborhood_index import NeighborhoodIndex

        G = nx.Graph()
        G.add_node("HUB", node_type="hub")
        for i in range(3):
            node = f"T{i}"
            G.add_node(node, node_type="target")
            G.add_edge("HUB", node, edge_type="uses")

        idx = NeighborhoodIndex(G)
        target_matches = {"T0", "T1", "T2"}

        result2 = idx.evaluate_typed_path_count_ge(
            (EdgeStep("uses"),), target_matches, threshold=2
        )
        assert "HUB" in result2  # 3 matching neighbors >= 2

        result4 = idx.evaluate_typed_path_count_ge(
            (EdgeStep("uses"),), target_matches, threshold=4
        )
        assert "HUB" not in result4  # only 3 neighbors, threshold 4 not met

    def test_count_ge_excludes_below_threshold(self):
        from fol.learning.neighborhood_index import NeighborhoodIndex

        G = nx.Graph()
        G.add_node("A", node_type="x")
        G.add_node("B", node_type="y")
        G.add_node("C", node_type="y")
        G.add_edge("A", "B", edge_type="rel")
        G.add_edge("A", "C", edge_type="rel")

        idx = NeighborhoodIndex(G)
        matches = {"B"}  # only B matches

        # A has 1 matching neighbor, threshold=2 → A should NOT be in result
        result = idx.evaluate_typed_path_count_ge(
            (EdgeStep("rel"),), matches, threshold=2
        )
        assert "A" not in result


# ---------------------------------------------------------------------------
# Test 7: NeighborhoodLiteralSpec.to_fol_string and is_typed
# ---------------------------------------------------------------------------


class TestNeighborhoodLiteralSpec:
    def test_typed_fol_string(self):
        from fol.learning.neighborhood_index import (
            NeighborhoodLiteralSpec,
            QuantifierType,
        )

        spec = NeighborhoodLiteralSpec(
            quantifier=QuantifierType.EXISTS,
            k_hop=2,
            base_predicates=("Malware",),
            path=(EdgeStep("uses"), EdgeStep("uses")),
        )
        assert spec.to_fol_string() == "∃y ∈ N_{uses.uses}(x) : Malware(y)"
        assert spec.is_typed() is True

    def test_untyped_fol_string_1hop(self):
        from fol.learning.neighborhood_index import (
            NeighborhoodLiteralSpec,
            QuantifierType,
        )

        spec = NeighborhoodLiteralSpec(
            quantifier=QuantifierType.EXISTS,
            k_hop=1,
            base_predicates=("malware",),
        )
        assert spec.to_fol_string() == "∃y ∈ neighbors(x) : malware(y)"
        assert spec.is_typed() is False

    def test_count_ge_typed_fol_string(self):
        from fol.learning.neighborhood_index import (
            NeighborhoodLiteralSpec,
            QuantifierType,
        )

        spec = NeighborhoodLiteralSpec(
            quantifier=QuantifierType.COUNT_GE,
            k_hop=2,
            base_predicates=("Malware",),
            threshold=2,
            path=(EdgeStep("uses"), EdgeStep("uses")),
        )
        assert spec.to_fol_string() == "at_least(2) y ∈ N_{uses.uses}(x) : Malware(y)"


# ---------------------------------------------------------------------------
# Test 8: Parser roundtrip for typed path expressions
# ---------------------------------------------------------------------------


class TestParserRoundtrip:
    def test_typed_path_parse_and_to_fol(self):
        from fol.parser import Lexer, parse

        expr = "∃y ∈ N_{uses.uses}(x) : malware(y)"

        # Verify TYPED_KHOP token is emitted
        tokens = Lexer(expr).tokenize()
        token_types = [t.type for t in tokens]
        assert "TYPED_KHOP" in token_types
        assert "IDENTIFIER" not in [
            t.type for t in tokens if t.value == "N_{uses.uses}"
        ]

        # Parse and roundtrip
        node = parse(expr)
        assert node.to_fol() == expr

    def test_typed_path_sets_path_field(self):
        from fol.parser import parse

        node = parse("∃y ∈ N_{uses.uses}(x) : malware(y)")
        assert node.path is not None
        assert len(node.path) == 2
        assert node.path[0].edge_type == "uses"
        assert node.path[1].edge_type == "uses"

    def test_untyped_1hop_still_works(self):
        from fol.parser import parse

        node = parse("∃y ∈ neighbors(x) : malware(y)")
        assert node.path is None
        assert node.k == 1


# ---------------------------------------------------------------------------
# Test 9: No untyped k_hop=2 literals are generated
# ---------------------------------------------------------------------------


class TestNoUntyped2HopLiterals:
    def _assert_no_untyped_2hop(self, literals):
        for lit in literals:
            if lit.neighborhood_spec is not None:
                spec = lit.neighborhood_spec
                assert not (spec.k_hop == 2 and spec.path is None), (
                    f"Found untyped k_hop=2 literal: {lit.fol_string} — "
                    "old 2-hop block was not fully removed"
                )

    def test_with_schema(self):
        from fol.learning.literal_generator import LiteralGenerator
        from fol.learning.scoring import EnrichmentScorer
        from fol.schema import extract_edge_schema

        G = _make_bron_like_graph()
        schema = extract_edge_schema(G)
        selected = {"T1"}
        scorer = EnrichmentScorer(1)

        gen = LiteralGenerator(edge_schema=schema, enable_typed_2hop=True)
        literals = gen.generate(G, selected, scorer=scorer)
        self._assert_no_untyped_2hop(literals)

    def test_without_schema(self):
        from fol.learning.literal_generator import LiteralGenerator
        from fol.learning.scoring import EnrichmentScorer

        G = _make_bron_like_graph()
        selected = {"T1"}
        scorer = EnrichmentScorer(1)

        gen = LiteralGenerator(edge_schema=None, enable_typed_2hop=False)
        literals = gen.generate(G, selected, scorer=scorer)
        self._assert_no_untyped_2hop(literals)


# ---------------------------------------------------------------------------
# Test 10: LiteralGenerator produces no sibling 2-hop outputs
# ---------------------------------------------------------------------------


class TestNoSiblingOutput:
    def test_sibling_not_in_matching_nodes(self):
        from fol.learning.literal_generator import LiteralGenerator
        from fol.learning.scoring import EnrichmentScorer
        from fol.schema import extract_edge_schema

        G = _make_bron_like_graph()
        schema = extract_edge_schema(G)

        # Select T1, leave T2 unselected
        selected = {"T1"}
        scorer = EnrichmentScorer(1)

        gen = LiteralGenerator(edge_schema=schema, enable_typed_2hop=True)
        literals = gen.generate(G, selected, scorer=scorer)

        # No neighborhood literal with path (targets, targets) should include T2
        for lit in literals:
            if lit.neighborhood_spec is not None and lit.neighborhood_spec.is_typed():
                path = lit.neighborhood_spec.path
                if path == (EdgeStep("targets"), EdgeStep("targets")):
                    assert (
                        "T2" not in lit.matching_nodes
                    ), "T2 (unselected sibling) leaked into targets·targets literal"


# ---------------------------------------------------------------------------
# Test 11: BeamSearch._literal_key distinguishes typed path literals
# ---------------------------------------------------------------------------


class TestBeamSearchLiteralKey:
    def _make_neighborhood_literal(self, path, quantifier_value, base_pred):
        from fol.learning.literal_generator import Literal, LiteralType
        from fol.learning.neighborhood_index import (
            NeighborhoodLiteralSpec,
            QuantifierType,
        )
        from fol.learning.threshold_finder import LiteralOperator

        qt = QuantifierType(quantifier_value)
        spec = NeighborhoodLiteralSpec(
            quantifier=qt,
            k_hop=2,
            base_predicates=(base_pred,),
            path=path,
        )
        return Literal(
            literal_type=LiteralType.NEIGHBORHOOD,
            attribute=f"test_{base_pred}",
            operator=LiteralOperator.EQ,
            value="neighborhood",
            score=1.0,
            coverage=0.5,
            matching_nodes=set(),
            neighborhood_spec=spec,
        )

    def test_different_paths_different_keys(self):
        from fol.learning.beam_search import BeamSearch

        bs = BeamSearch()
        path1 = (EdgeStep("uses"), EdgeStep("uses"))
        path2 = (EdgeStep("targets"), EdgeStep("uses"))
        lit1 = self._make_neighborhood_literal(path1, "exists", "Malware")
        lit2 = self._make_neighborhood_literal(path2, "exists", "Malware")

        assert bs._literal_key(lit1) != bs._literal_key(lit2)

    def test_different_quantifiers_different_keys(self):
        from fol.learning.beam_search import BeamSearch

        bs = BeamSearch()
        path = (EdgeStep("uses"), EdgeStep("uses"))
        lit_exists = self._make_neighborhood_literal(path, "exists", "Malware")
        lit_forall = self._make_neighborhood_literal(path, "forall", "Malware")

        assert bs._literal_key(lit_exists) != bs._literal_key(lit_forall)

    def test_untyped_key_format(self):
        from fol.learning.beam_search import BeamSearch
        from fol.learning.literal_generator import Literal, LiteralType
        from fol.learning.neighborhood_index import (
            NeighborhoodLiteralSpec,
            QuantifierType,
        )
        from fol.learning.threshold_finder import LiteralOperator

        bs = BeamSearch()
        spec = NeighborhoodLiteralSpec(
            quantifier=QuantifierType.EXISTS,
            k_hop=1,
            base_predicates=("malware",),
        )
        lit = Literal(
            literal_type=LiteralType.NEIGHBORHOOD,
            attribute="exists_malware",
            operator=LiteralOperator.EQ,
            value="neighborhood",
            score=1.0,
            coverage=0.5,
            matching_nodes=set(),
            neighborhood_spec=spec,
        )
        key = bs._literal_key(lit)
        assert "k1" in key
        assert "path" not in key


# ---------------------------------------------------------------------------
# Test 12: End-to-end — no sibling leak in learned clauses
# ---------------------------------------------------------------------------


class TestEndToEndNoSiblingLeak:
    def test_no_sibling_targets_targets_in_clauses(self):
        from fol.learning.learner import ExplanationLearner

        G = _make_bron_like_graph()
        learner = ExplanationLearner(
            beam_width=3, max_clause_len=3, max_evaluations=500
        )
        result = learner.learn_explanations(G, selected_nodes=["T1"])

        for clause in result.clauses:
            expr = clause.fol_expression
            assert (
                "N_{targets.targets}" not in expr
            ), f"Sibling bridge predicate found in clause: {expr}"
