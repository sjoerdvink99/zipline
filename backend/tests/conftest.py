"""
Shared test configuration and fixtures for predicate compilation tests.

Provides common test utilities and sample graphs that match the formalism examples.
"""

import pytest
import networkx as nx


@pytest.fixture(scope="session")
def sample_multivariate_graph():
    """Standard multivariate graph G = (V, E, A) matching formalism Section 1.1"""
    G = nx.Graph()

    # Protein nodes
    G.add_node("protein1",
              type="protein",
              category="enzyme",
              molecular_weight=45.2,
              active=True,
              platforms=["Linux", "Windows"])

    G.add_node("protein2",
              type="protein",
              category="inhibitor",
              molecular_weight=62.8,
              active=False,
              platforms=["macOS"])

    # Enzyme nodes
    G.add_node("enzyme1",
              type="enzyme",
              category="catalytic",
              molecular_weight=78.5,
              active=True,
              platforms=["Linux"])

    G.add_node("enzyme2",
              type="enzyme",
              category="regulatory",
              molecular_weight=32.1,
              active=False,
              platforms=["Windows", "macOS"])

    # Compound node
    G.add_node("compound1",
              type="compound",
              category="substrate",
              molecular_weight=15.3,
              active=True,
              platforms=["Linux"])

    # Create topology space through edges
    G.add_edge("protein1", "enzyme1")
    G.add_edge("protein1", "enzyme2")
    G.add_edge("protein2", "enzyme1")
    G.add_edge("enzyme1", "compound1")
    G.add_edge("enzyme2", "compound1")

    return G


@pytest.fixture(scope="session")
def cybersecurity_formalism_graph():
    """Cybersecurity graph matching exact formalism examples"""
    G = nx.Graph()

    # Techniques with platform arrays (Section 3.3)
    G.add_node("linux_technique",
              node_type="technique",
              mitre_id="T1068",
              platforms=["Linux", "Unix"],
              tactics=["privilege_escalation", "persistence"])

    G.add_node("windows_technique",
              node_type="technique",
              mitre_id="T1055.011",
              platforms=["Windows"],
              tactics=["defense_evasion", "privilege_escalation"])

    G.add_node("multiplatform_technique",
              node_type="technique",
              mitre_id="T1059",
              platforms=["Linux", "Windows", "macOS"],
              tactics=["execution"])

    # Threat actors with aliases (Section 3.3)
    G.add_node("thrip_actor",
              node_type="threat_actor",
              aliases=["Thrip", "APT40", "Leviathan"],
              actor_type="apt",
              target_sector="healthcare")

    G.add_node("cozy_bear",
              node_type="threat_actor",
              aliases=["APT29", "Cozy Bear", "The Dukes"],
              actor_type="apt",
              target_sector="government")

    # Malware
    G.add_node("banking_trojan",
              node_type="malware",
              malware_type="banking_trojan",
              capabilities=["credential_theft", "screen_capture"])

    # Create relationships for Section 4.4 real-world example
    G.add_edge("linux_technique", "thrip_actor")
    G.add_edge("windows_technique", "cozy_bear")
    G.add_edge("multiplatform_technique", "thrip_actor")

    return G


@pytest.fixture(scope="session")
def biology_formalism_graph():
    """Biology graph matching protein interaction formalism examples"""
    G = nx.Graph()

    # Catalytic triad example (Section 4.2)
    G.add_node("serine_center",
              residue_type="SER",
              amino_acid_type="SER",
              active_site=True)

    # K-hop neighbors for catalytic triad
    G.add_node("histidine_neighbor",
              residue_type="HIS",
              amino_acid_type="HIS",
              verified_status=True)

    G.add_node("aspartate_neighbor",
              residue_type="ASP",
              amino_acid_type="ASP",
              verified_status=True)

    G.add_node("glycine_spacer",
              residue_type="GLY",
              amino_acid_type="GLY",
              verified_status=False)

    # Create 2-hop structure
    G.add_edge("serine_center", "glycine_spacer")
    G.add_edge("glycine_spacer", "histidine_neighbor")
    G.add_edge("glycine_spacer", "aspartate_neighbor")

    # Hydrophobic cluster example
    G.add_node("phe_cluster_center",
              amino_acid_type="PHE",
              hydrophobic=True)

    for i, aa_type in enumerate(["LEU", "VAL", "ILE", "PHE"]):
        G.add_node(f"hydrophobic_{i}",
                  amino_acid_type=aa_type,
                  hydrophobic=True)
        G.add_edge("phe_cluster_center", f"hydrophobic_{i}")

    return G


@pytest.fixture(scope="session")
def energy_grid_formalism_graph():
    """Energy grid graph for formalism examples"""
    G = nx.Graph()

    # Generators with high capacity
    G.add_node("generator_high",
              node_type="generator",
              capacity_mw=600,
              status="active")

    G.add_node("generator_low",
              node_type="generator",
              capacity_mw=200,
              status="active")

    # Substations
    G.add_node("critical_substation",
              node_type="substation",
              peak_load_mw=250,
              voltage_level="transmission")

    G.add_node("distribution_substation",
              node_type="substation",
              peak_load_mw=50,
              voltage_level="distribution")

    # Loads
    for i in range(4):
        G.add_node(f"residential_load_{i}",
                  node_type="load",
                  load_type="residential",
                  peak_demand_mw=25)

    G.add_node("industrial_load",
              node_type="load",
              load_type="industrial",
              peak_demand_mw=150)

    # Create grid topology
    G.add_edge("generator_high", "critical_substation")
    G.add_edge("critical_substation", "distribution_substation")

    for i in range(4):
        G.add_edge("critical_substation", f"residential_load_{i}")

    G.add_edge("generator_low", "industrial_load")

    return G


def assert_predicate_deterministic(predicate_func, graph, iterations=5):
    """Utility to assert that predicate evaluation is deterministic"""
    results = []
    for _ in range(iterations):
        result = predicate_func(graph)
        results.append(result)

    first_result = results[0]
    for i, result in enumerate(results[1:], 1):
        assert result == first_result, f"Iteration {i} gave different result: {result} != {first_result}"


def create_graph_with_degree_distribution(degree_sequence):
    """Create a graph with specified degree sequence for topology testing"""
    if sum(degree_sequence) % 2 != 0:
        degree_sequence[-1] += 1  # Ensure sum is even

    try:
        G = nx.configuration_model(degree_sequence)
        G = nx.Graph(G)  # Remove parallel edges and self-loops
        G.remove_edges_from(nx.selfloop_edges(G))

        # Add attributes
        for i, node in enumerate(G.nodes()):
            G.nodes[node]["type"] = f"type_{i % 3}"
            G.nodes[node]["active"] = i % 2 == 0

        return G
    except nx.NetworkXError:
        # Fallback: create simple path if configuration model fails
        G = nx.path_graph(len(degree_sequence))
        for i, node in enumerate(G.nodes()):
            G.nodes[node]["type"] = f"type_{i % 3}"
            G.nodes[node]["active"] = i % 2 == 0
        return G
