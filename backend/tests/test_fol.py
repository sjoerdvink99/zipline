import networkx as nx
import pytest

from fol.ast import (
    Comparator,
    ComparisonPredicate,
    Conjunction,
    Disjunction,
    Negation,
    NeighborhoodQuantifier,
    Quantifier,
    SetComprehension,
    TypePredicate,
    UnaryPredicate,
    Variable,
)
from fol.evaluator import Evaluator
from fol.inference import PredicateInferencer, infer_predicates_from_selection
from fol.parser import ParseError, parse
from fol.topology import TopologyMetrics
from services.evaluator import PredicateService, get_lifted_predicates


@pytest.fixture
def multivariate_graph():
    G = nx.Graph()

    G.add_node(
        "protein1",
        type="protein",
        molecular_weight=45.2,
        active=True,
        platforms=["Linux", "Windows"],
    )
    G.add_node(
        "protein2",
        type="protein",
        molecular_weight=62.8,
        active=False,
        platforms=["macOS"],
    )
    G.add_node(
        "enzyme1",
        type="enzyme",
        molecular_weight=78.5,
        active=True,
        platforms=["Linux"],
    )
    G.add_node(
        "enzyme2",
        type="enzyme",
        molecular_weight=32.1,
        active=False,
        platforms=["Windows", "macOS"],
    )
    G.add_node(
        "compound1",
        type="compound",
        molecular_weight=15.3,
        active=True,
        platforms=["Linux"],
    )
    G.add_edge("protein1", "enzyme1")
    G.add_edge("protein1", "enzyme2")
    G.add_edge("protein2", "enzyme1")
    G.add_edge("enzyme1", "compound1")
    G.add_edge("enzyme2", "compound1")

    return G


@pytest.fixture
def cybersecurity_graph():
    G = nx.Graph()
    G.add_node(
        "technique1",
        node_type="technique",
        mitre_id="T1068",
        platforms=["Linux", "Unix"],
        tactics=["privilege_escalation", "persistence"],
    )
    G.add_node(
        "technique2",
        node_type="technique",
        mitre_id="T1055",
        platforms=["Windows"],
        tactics=["defense_evasion"],
    )
    G.add_node(
        "technique3",
        node_type="technique",
        mitre_id="T1059",
        platforms=["Linux", "Windows", "macOS"],
        tactics=["execution"],
    )
    G.add_node("actor1", node_type="threat_actor", aliases=["Thrip", "APT40"])
    G.add_node("actor2", node_type="threat_actor", aliases=["APT29", "Cozy Bear"])
    G.add_edge("technique1", "actor1")
    G.add_edge("technique2", "actor2")
    G.add_edge("technique3", "actor1")

    return G


@pytest.fixture
def hub_graph():
    G = nx.Graph()
    G.add_node("hub", type="hub", importance=1.0)
    for i in range(10):
        G.add_node(f"peripheral_{i}", type="peripheral", importance=0.1)
        G.add_edge("hub", f"peripheral_{i}")
    G.add_edge("peripheral_0", "peripheral_1")
    G.add_edge("peripheral_2", "peripheral_3")

    return G


class TestDataModel:
    def test_graph_structure(self, multivariate_graph):
        G = multivariate_graph

        assert G.number_of_nodes() == 5

        assert G.number_of_edges() == 5
        assert G.nodes["protein1"]["type"] == "protein"
        assert G.nodes["protein1"]["molecular_weight"] == 45.2

    def test_attribute_types(self, multivariate_graph):
        G = multivariate_graph
        node = G.nodes["protein1"]

        assert isinstance(node["molecular_weight"], float)

        assert isinstance(node["active"], bool)
        assert isinstance(node["platforms"], list)
        assert "Linux" in node["platforms"]


class TestLogicalFoundation:
    def test_unary_predicate_evaluation(self, multivariate_graph):
        pred = UnaryPredicate("active", Variable("x"))

        assert pred.evaluate(multivariate_graph, {"x": "protein1"}) is True
        assert pred.evaluate(multivariate_graph, {"x": "protein2"}) is False

    def test_type_predicate_evaluation(self, multivariate_graph):
        pred = TypePredicate("protein", Variable("x"))

        assert pred.evaluate(multivariate_graph, {"x": "protein1"}) is True
        assert pred.evaluate(multivariate_graph, {"x": "enzyme1"}) is False

    def test_conjunction(self, multivariate_graph):
        type_pred = TypePredicate("protein", Variable("x"))
        active_pred = UnaryPredicate("active", Variable("x"))
        conj = Conjunction([type_pred, active_pred])

        assert conj.evaluate(multivariate_graph, {"x": "protein1"}) is True
        assert conj.evaluate(multivariate_graph, {"x": "protein2"}) is False
        assert conj.evaluate(multivariate_graph, {"x": "enzyme1"}) is False

    def test_disjunction(self, multivariate_graph):
        type_pred = TypePredicate("enzyme", Variable("x"))
        active_pred = UnaryPredicate("active", Variable("x"))
        disj = Disjunction([type_pred, active_pred])

        assert disj.evaluate(multivariate_graph, {"x": "enzyme1"}) is True

        assert disj.evaluate(multivariate_graph, {"x": "protein1"}) is True

        assert disj.evaluate(multivariate_graph, {"x": "enzyme2"}) is True

        assert disj.evaluate(multivariate_graph, {"x": "protein2"}) is False

    def test_negation(self, multivariate_graph):
        active_pred = UnaryPredicate("active", Variable("x"))
        neg = Negation(active_pred)

        assert neg.evaluate(multivariate_graph, {"x": "protein2"}) is True
        assert neg.evaluate(multivariate_graph, {"x": "protein1"}) is False

    def test_section2_example(self, multivariate_graph):
        ast = parse("(protein(x) ∧ active(x)) ∨ enzyme(x)")
        evaluator = Evaluator()
        result = evaluator.evaluate(multivariate_graph, ast)

        assert "protein1" in result.nodes

        assert "enzyme1" in result.nodes
        assert "enzyme2" in result.nodes

        assert "protein2" not in result.nodes


class TestCrossSpacePredicates:
    def test_comparison_predicate_attribute(self, multivariate_graph):
        pred = ComparisonPredicate(
            "molecular_weight", Variable("x"), Comparator.GT, 50.0
        )

        assert pred.evaluate(multivariate_graph, {"x": "protein2"}) is True
        assert pred.evaluate(multivariate_graph, {"x": "protein1"}) is False

    def test_comparison_predicate_topology(self, multivariate_graph):
        pred = ComparisonPredicate("degree", Variable("x"), Comparator.GT, 2)

        assert pred.evaluate(multivariate_graph, {"x": "enzyme1"}) is True

        assert pred.evaluate(multivariate_graph, {"x": "compound1"}) is False

    def test_cross_space_predicate(self, multivariate_graph):
        ast = parse("degree(x) > 1 ∧ protein(x)")
        evaluator = Evaluator()
        result = evaluator.evaluate(multivariate_graph, ast)

        assert "protein1" in result.nodes

        assert "protein2" not in result.nodes


class TestArrayLifting:
    def test_lifted_predicate_evaluation(self, cybersecurity_graph):
        pred = UnaryPredicate("platforms_Linux", Variable("x"))

        assert pred.evaluate(cybersecurity_graph, {"x": "technique1"}) is True
        assert pred.evaluate(cybersecurity_graph, {"x": "technique2"}) is False
        assert pred.evaluate(cybersecurity_graph, {"x": "technique3"}) is True

    def test_lifted_predicate_combination(self, cybersecurity_graph):
        ast = parse("platforms_Linux(x) ∧ platforms_Windows(x)")
        evaluator = Evaluator()
        result = evaluator.evaluate(cybersecurity_graph, ast)

        assert "technique3" in result.nodes
        assert "technique1" not in result.nodes

    def test_get_lifted_predicates(self, cybersecurity_graph):
        lifted = get_lifted_predicates(cybersecurity_graph)

        assert "platforms_Linux" in lifted
        assert "technique1" in lifted["platforms_Linux"]
        assert "technique3" in lifted["platforms_Linux"]

        assert "tactics_privilege_escalation" in lifted
        assert "technique1" in lifted["tactics_privilege_escalation"]

        assert "aliases_Thrip" in lifted
        assert "actor1" in lifted["aliases_Thrip"]


class TestNeighborhoodOperators:
    def test_forall_neighbors(self, multivariate_graph):
        enzyme_pred = TypePredicate("enzyme", Variable("y"))
        quant = NeighborhoodQuantifier(
            quantifier=Quantifier.FORALL,
            bound_variable=Variable("y"),
            target_variable=Variable("x"),
            k=1,
            body=enzyme_pred,
        )

        assert quant.evaluate(multivariate_graph, {"x": "protein1"}) is True

        assert quant.evaluate(multivariate_graph, {"x": "enzyme1"}) is False

    def test_exists_neighbors(self, multivariate_graph):
        active_pred = UnaryPredicate("active", Variable("y"))
        quant = NeighborhoodQuantifier(
            quantifier=Quantifier.EXISTS,
            bound_variable=Variable("y"),
            target_variable=Variable("x"),
            k=1,
            body=active_pred,
        )

        assert quant.evaluate(multivariate_graph, {"x": "protein1"}) is True

    def test_at_least_cardinality(self, multivariate_graph):
        enzyme_pred = TypePredicate("enzyme", Variable("y"))
        quant = NeighborhoodQuantifier(
            quantifier=Quantifier.AT_LEAST,
            bound_variable=Variable("y"),
            target_variable=Variable("x"),
            k=1,
            body=enzyme_pred,
            count=2,
        )

        assert quant.evaluate(multivariate_graph, {"x": "protein1"}) is True

        assert quant.evaluate(multivariate_graph, {"x": "protein2"}) is False

    def test_exactly_cardinality(self, multivariate_graph):
        enzyme_pred = TypePredicate("enzyme", Variable("y"))
        quant = NeighborhoodQuantifier(
            quantifier=Quantifier.EXACTLY,
            bound_variable=Variable("y"),
            target_variable=Variable("x"),
            k=1,
            body=enzyme_pred,
            count=2,
        )

        assert quant.evaluate(multivariate_graph, {"x": "protein1"}) is True
        assert quant.evaluate(multivariate_graph, {"x": "protein2"}) is False

    def test_at_most_cardinality(self, multivariate_graph):
        enzyme_pred = TypePredicate("enzyme", Variable("y"))
        quant = NeighborhoodQuantifier(
            quantifier=Quantifier.AT_MOST,
            bound_variable=Variable("y"),
            target_variable=Variable("x"),
            k=1,
            body=enzyme_pred,
            count=1,
        )

        assert quant.evaluate(multivariate_graph, {"x": "protein2"}) is True

        assert quant.evaluate(multivariate_graph, {"x": "protein1"}) is False

    def test_k_hop_neighborhood(self, multivariate_graph):
        compound_pred = TypePredicate("compound", Variable("y"))
        quant = NeighborhoodQuantifier(
            quantifier=Quantifier.EXISTS,
            bound_variable=Variable("y"),
            target_variable=Variable("x"),
            k=2,
            body=compound_pred,
        )

        assert quant.evaluate(multivariate_graph, {"x": "protein1"}) is True


class TestResultStructure:
    def test_single_variable_result(self, multivariate_graph):
        pred = TypePredicate("protein", Variable("x"))
        evaluator = Evaluator()
        result = evaluator.evaluate(multivariate_graph, pred)

        assert len(result.bindings) == 2
        assert all("x" in b for b in result.bindings)
        assert all(len(b) == 1 for b in result.bindings)

    def test_multi_variable_result(self, multivariate_graph):
        ast = parse("{ (x, y) | ∃y ∈ neighbors(x) : enzyme(y) }")

        assert isinstance(ast, SetComprehension)
        assert len(ast.variables) == 2

    def test_set_comprehension_evaluation(self, multivariate_graph):
        enzyme_pred = TypePredicate("enzyme", Variable("y"))
        neighborhood = NeighborhoodQuantifier(
            quantifier=Quantifier.EXISTS,
            bound_variable=Variable("y"),
            target_variable=Variable("x"),
            k=1,
            body=enzyme_pred,
        )

        comprehension = SetComprehension(
            variables=[Variable("x"), Variable("y")],
            predicate=neighborhood,
        )

        result = comprehension.evaluate(multivariate_graph)

        assert len(result) > 0

    def test_set_comprehension_fol_string(self, multivariate_graph):
        comprehension = SetComprehension(
            variables=[Variable("x"), Variable("y")],
            predicate=TypePredicate("enzyme", Variable("y")),
        )

        fol = comprehension.to_fol()
        assert "{ (x, y) |" in fol
        assert "enzyme(y)" in fol


class TestDeterminism:
    def test_evaluation_determinism(self, multivariate_graph):
        ast = parse("protein(x) ∧ active(x)")
        evaluator = Evaluator()

        results = [evaluator.evaluate(multivariate_graph, ast) for _ in range(10)]

        first_nodes = results[0].nodes
        for result in results[1:]:
            assert result.nodes == first_nodes

    def test_quantifier_determinism(self, multivariate_graph):
        ast = parse("∀y ∈ neighbors(x) : enzyme(y)")
        evaluator = Evaluator()

        results = [evaluator.evaluate(multivariate_graph, ast) for _ in range(5)]

        first_nodes = results[0].nodes
        for result in results[1:]:
            assert result.nodes == first_nodes


class TestParser:
    def test_parse_simple_predicate(self):
        ast = parse("protein(x)")
        assert isinstance(ast, TypePredicate | UnaryPredicate)
        assert ast.to_fol() == "protein(x)"

    def test_parse_comparison(self):
        ast = parse("degree(x) >= 5")
        assert isinstance(ast, ComparisonPredicate)
        assert ast.comparator == Comparator.GTE
        assert ast.value == 5

    def test_parse_conjunction(self):
        ast = parse("protein(x) ∧ active(x)")
        assert isinstance(ast, Conjunction)
        assert len(ast.operands) == 2

    def test_parse_disjunction(self):
        ast = parse("protein(x) ∨ enzyme(x)")
        assert isinstance(ast, Disjunction)

    def test_parse_negation(self):
        ast = parse("¬active(x)")
        assert isinstance(ast, Negation)

    def test_parse_quantifier_forall(self):
        ast = parse("∀y ∈ neighbors(x) : enzyme(y)")
        assert isinstance(ast, NeighborhoodQuantifier)
        assert ast.quantifier == Quantifier.FORALL
        assert ast.k == 1

    def test_parse_quantifier_exists(self):
        ast = parse("∃y ∈ neighbors(x) : active(y)")
        assert isinstance(ast, NeighborhoodQuantifier)
        assert ast.quantifier == Quantifier.EXISTS

    def test_parse_cardinality_at_least(self):
        ast = parse("at_least(3) y ∈ neighbors(x) : active(y)")
        assert isinstance(ast, NeighborhoodQuantifier)
        assert ast.quantifier == Quantifier.AT_LEAST
        assert ast.count == 3

    def test_parse_cardinality_exactly(self):
        ast = parse("exactly(2) y ∈ neighbors(x) : enzyme(y)")
        assert isinstance(ast, NeighborhoodQuantifier)
        assert ast.quantifier == Quantifier.EXACTLY
        assert ast.count == 2

    def test_parse_k_hop(self):
        ast = parse("∃y ∈ N_2(x) : compound(y)")
        assert isinstance(ast, NeighborhoodQuantifier)
        assert ast.k == 2

    def test_parse_nested_expression(self):
        ast = parse("protein(x) ∧ (active(x) ∨ ¬enzyme(x))")
        assert isinstance(ast, Conjunction)

    def test_parse_set_comprehension(self):
        ast = parse("{ x | protein(x) }")
        assert isinstance(ast, SetComprehension)
        assert len(ast.variables) == 1

    def test_parse_multi_var_comprehension(self):
        ast = parse("{ (x, y) | ∃y ∈ neighbors(x) : enzyme(y) }")
        assert isinstance(ast, SetComprehension)
        assert len(ast.variables) == 2

    def test_parse_error_invalid_syntax(self):
        with pytest.raises(ParseError):
            parse("invalid @@ syntax")

    def test_parse_string_values(self):
        ast = parse('node_type(x) = "technique"')
        assert isinstance(ast, ComparisonPredicate)
        assert ast.value == "technique"

    def test_parse_alternative_syntax(self):
        ast1 = parse("protein(x) and active(x)")
        ast2 = parse("protein(x) ∧ active(x)")

        assert isinstance(ast1, Conjunction)
        assert isinstance(ast2, Conjunction)


class TestTopologyMetrics:
    def test_degree_computation(self, hub_graph):
        metrics = TopologyMetrics(hub_graph)

        assert metrics.get_metric("hub", "degree") == 10.0
        assert metrics.get_metric("peripheral_0", "degree") == 2.0

    def test_centrality_computation(self, hub_graph):
        metrics = TopologyMetrics(hub_graph)

        hub_bc = metrics.get_metric("hub", "betweenness_centrality")
        peripheral_bc = metrics.get_metric("peripheral_0", "betweenness_centrality")

        assert hub_bc > peripheral_bc

    def test_clustering_coefficient(self, hub_graph):
        metrics = TopologyMetrics(hub_graph)

        hub_cc = metrics.get_metric("hub", "clustering_coefficient")
        assert hub_cc < 0.1

    def test_get_nodes_by_threshold(self, hub_graph):
        metrics = TopologyMetrics(hub_graph)

        high_degree = metrics.get_nodes_by_threshold("degree", ">=", 5)
        assert "hub" in high_degree
        assert "peripheral_0" not in high_degree


class TestPredicateInference:
    def test_infer_attribute_predicates(self, multivariate_graph):
        inferencer = PredicateInferencer(min_coverage=0.5, min_selectivity=0.1)

        result = inferencer.infer(multivariate_graph, ["protein1", "protein2"])

        attr_preds = result.attribute_predicates
        assert len(attr_preds) > 0

        types = [p.value for p in attr_preds]
        assert "protein" in types or any("protein" in str(v) for v in types)

    def test_infer_topology_predicates(self, hub_graph):
        inferencer = PredicateInferencer(min_coverage=0.5, min_selectivity=0.1)

        result = inferencer.infer(hub_graph, ["hub"])

        topo_preds = result.topology_predicates
        assert len(topo_preds) > 0

        metrics = [p.metric for p in topo_preds]
        assert "degree" in metrics

    def test_infer_lifted_predicates(self, cybersecurity_graph):
        inferencer = PredicateInferencer(min_coverage=0.5, min_selectivity=0.1)

        result = inferencer.infer(cybersecurity_graph, ["technique1", "technique3"])

        attr_preds = result.attribute_predicates
        fol_exprs = [p.fol_expression for p in attr_preds]

        assert any("Linux" in expr for expr in fol_exprs)

    def test_backward_compatible_interface(self, multivariate_graph):
        result = infer_predicates_from_selection(
            multivariate_graph,
            ["protein1", "protein2"],
            min_coverage=0.5,
            min_selectivity=0.1,
        )

        assert "attribute" in result
        assert "topology" in result
        assert isinstance(result["attribute"], list)
        assert isinstance(result["topology"], list)

    def test_empty_selection(self, multivariate_graph):
        inferencer = PredicateInferencer()
        result = inferencer.infer(multivariate_graph, [])

        assert result.selection_size == 0
        assert len(result.attribute_predicates) == 0
        assert len(result.topology_predicates) == 0

    def test_invalid_nodes_filtered(self, multivariate_graph):
        inferencer = PredicateInferencer()
        result = inferencer.infer(multivariate_graph, ["protein1", "nonexistent_node"])

        assert result.selection_size == 1


class TestPredicateService:
    def test_evaluate_simple_expression(self, multivariate_graph):
        service = PredicateService()
        result = service.evaluate_expression(multivariate_graph, "protein(x)")

        assert "protein1" in result.matching_nodes
        assert "protein2" in result.matching_nodes
        assert len(result.errors) == 0

    def test_evaluate_cross_space(self, multivariate_graph):
        service = PredicateService()
        result = service.evaluate_expression(
            multivariate_graph, "protein(x) ∧ degree(x) > 1"
        )

        assert "protein1" in result.matching_nodes

    def test_evaluate_invalid_expression(self, multivariate_graph):
        service = PredicateService()
        result = service.evaluate_expression(multivariate_graph, "invalid @@ syntax")

        assert len(result.errors) > 0
        assert len(result.matching_nodes) == 0

    def test_evaluation_timing(self, multivariate_graph):
        service = PredicateService()
        result = service.evaluate_expression(multivariate_graph, "protein(x)")

        assert result.evaluation_time_ms >= 0


class TestEdgeCases:
    def test_empty_graph(self):
        G = nx.Graph()
        evaluator = Evaluator()
        pred = TypePredicate("protein", Variable("x"))

        result = evaluator.evaluate(G, pred)
        assert len(result.bindings) == 0

    def test_node_not_in_graph(self, multivariate_graph):
        pred = TypePredicate("protein", Variable("x"))

        assert pred.evaluate(multivariate_graph, {"x": "nonexistent"}) is False

    def test_missing_attribute(self, multivariate_graph):
        pred = ComparisonPredicate("nonexistent_attr", Variable("x"), Comparator.GT, 5)

        assert pred.evaluate(multivariate_graph, {"x": "protein1"}) is False

    def test_empty_neighborhood(self):
        G = nx.Graph()
        G.add_node("isolated", type="protein")

        quant = NeighborhoodQuantifier(
            quantifier=Quantifier.FORALL,
            bound_variable=Variable("y"),
            target_variable=Variable("x"),
            k=1,
            body=TypePredicate("enzyme", Variable("y")),
        )

        assert quant.evaluate(G, {"x": "isolated"}) is True

    def test_comparison_with_different_types(self, multivariate_graph):
        pred = ComparisonPredicate("type", Variable("x"), Comparator.GT, 5)

        pred.evaluate(multivariate_graph, {"x": "protein1"})


class TestIntegration:
    def test_end_to_end_simple(self, multivariate_graph):
        expression = "protein(x) ∧ active(x)"

        ast = parse(expression)
        evaluator = Evaluator()
        result = evaluator.evaluate(multivariate_graph, ast)

        assert "protein1" in result.nodes
        assert "protein2" not in result.nodes

    def test_end_to_end_complex(self, multivariate_graph):
        expression = (
            "(protein(x) ∧ molecular_weight(x) > 50) ∨ ∃y ∈ neighbors(x) : active(y)"
        )

        ast = parse(expression)
        evaluator = Evaluator()
        result = evaluator.evaluate(multivariate_graph, ast)

        assert "protein2" in result.nodes

    def test_inference_to_evaluation(self, multivariate_graph):
        inferencer = PredicateInferencer(min_coverage=0.5, min_selectivity=0.1)
        infer_result = inferencer.infer(multivariate_graph, ["protein1", "protein2"])

        if infer_result.attribute_predicates:
            fol_expr = infer_result.attribute_predicates[0].fol_expression

            service = PredicateService()
            eval_result = service.evaluate_expression(multivariate_graph, fol_expr)

            assert len(eval_result.matching_nodes) >= 2


class TestFormalismsExamples:
    def test_section_2_example(self, multivariate_graph):
        ast = parse("(protein(x) ∧ active(x)) ∨ enzyme(x)")
        evaluator = Evaluator()
        result = evaluator.evaluate(multivariate_graph, ast)

        assert "protein1" in result.nodes
        assert "enzyme1" in result.nodes
        assert "enzyme2" in result.nodes
        assert "protein2" not in result.nodes

    def test_section_4_neighborhood_example(self, multivariate_graph):
        ast = parse("∀y ∈ neighbors(x) : active(y)")
        evaluator = Evaluator()
        result = evaluator.evaluate(multivariate_graph, ast)

        matching = result.nodes
        assert len(matching) >= 0

    def test_section_4_cardinality_example(self, multivariate_graph):
        ast = parse("at_least(1) y ∈ neighbors(x) : active(y)")
        evaluator = Evaluator()
        result = evaluator.evaluate(multivariate_graph, ast)

        assert len(result.nodes) > 0

    def test_cross_space_predicate(self, multivariate_graph):
        ast = parse("degree(x) > 1 ∧ protein(x)")
        evaluator = Evaluator()
        result = evaluator.evaluate(multivariate_graph, ast)

        assert "protein1" in result.nodes


class TestDisjunctionAST:
    @pytest.fixture
    def sample_graph(self):
        G = nx.Graph()
        G.add_node("1", type="protein")
        G.add_node("2", type="enzyme")
        G.add_node("3", type="lipid")
        G.add_node("4", type="protein")
        return G

    def test_disjunction_clause_evaluation_true(self, sample_graph):
        var_x = Variable("x")
        protein_pred = TypePredicate("protein", var_x)
        enzyme_pred = TypePredicate("enzyme", var_x)

        disjunction = Disjunction([protein_pred, enzyme_pred])

        assert disjunction.evaluate(sample_graph, {"x": "1"}) is True
        assert disjunction.evaluate(sample_graph, {"x": "2"}) is True

    def test_disjunction_clause_evaluation_false(self, sample_graph):
        var_x = Variable("x")
        protein_pred = TypePredicate("protein", var_x)
        enzyme_pred = TypePredicate("enzyme", var_x)

        disjunction = Disjunction([protein_pred, enzyme_pred])

        assert disjunction.evaluate(sample_graph, {"x": "3"}) is False

    def test_disjunction_clause_empty(self, sample_graph):
        disjunction = Disjunction([])

        assert disjunction.evaluate(sample_graph, {"x": "1"}) is False

    def test_disjunction_clause_single_clause(self, sample_graph):
        var_x = Variable("x")
        protein_pred = TypePredicate("protein", var_x)

        disjunction = Disjunction([protein_pred])

        assert disjunction.evaluate(sample_graph, {"x": "1"}) is True
        assert disjunction.evaluate(sample_graph, {"x": "2"}) is False

    def test_disjunction_clause_free_variables(self):
        var_x = Variable("x")
        var_y = Variable("y")
        protein_pred = TypePredicate("protein", var_x)
        enzyme_pred = TypePredicate("enzyme", var_y)

        disjunction = Disjunction([protein_pred, enzyme_pred])

        free_vars = disjunction.free_variables()
        assert free_vars == {"x", "y"}

    def test_disjunction_clause_to_fol_single(self):
        var_x = Variable("x")
        protein_pred = TypePredicate("protein", var_x)
        disjunction = Disjunction([protein_pred])

        assert disjunction.to_fol() == "protein(x)"

    def test_disjunction_clause_to_fol_multiple(self):
        var_x = Variable("x")
        protein_pred = TypePredicate("protein", var_x)
        enzyme_pred = TypePredicate("enzyme", var_x)

        disjunction = Disjunction([protein_pred, enzyme_pred])

        expected = "protein(x) ∨ enzyme(x)"
        assert disjunction.to_fol() == expected

    def test_disjunction_clause_to_fol_with_conjunction(self):
        var_x = Variable("x")
        protein_pred = TypePredicate("protein", var_x)
        enzyme_pred = TypePredicate("enzyme", var_x)
        lipid_pred = TypePredicate("lipid", var_x)

        conjunction = Conjunction([protein_pred, enzyme_pred])
        disjunction = Disjunction([conjunction, lipid_pred])

        result = disjunction.to_fol()
        assert "(protein(x) ∧ enzyme(x)) ∨ lipid(x)" == result

    def test_disjunction_clause_nested_disjunction(self):
        var_x = Variable("x")
        protein_pred = TypePredicate("protein", var_x)
        enzyme_pred = TypePredicate("enzyme", var_x)
        lipid_pred = TypePredicate("lipid", var_x)

        inner_disjunction = Disjunction([protein_pred, enzyme_pred])
        outer_disjunction = Disjunction([inner_disjunction, lipid_pred])

        result = outer_disjunction.to_fol()
        assert "(protein(x) ∨ enzyme(x)) ∨ lipid(x)" == result
