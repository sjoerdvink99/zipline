import networkx as nx
import pytest


@pytest.fixture(scope="session")
def sample_multivariate_graph():
    G = nx.Graph()

    G.add_node(
        "protein1",
        type="protein",
        category="enzyme",
        molecular_weight=45.2,
        active=True,
        platforms=["Linux", "Windows"],
    )
    G.add_node(
        "protein2",
        type="protein",
        category="inhibitor",
        molecular_weight=62.8,
        active=False,
        platforms=["macOS"],
    )
    G.add_node(
        "enzyme1",
        type="enzyme",
        category="catalytic",
        molecular_weight=78.5,
        active=True,
        platforms=["Linux"],
    )
    G.add_node(
        "enzyme2",
        type="enzyme",
        category="regulatory",
        molecular_weight=32.1,
        active=False,
        platforms=["Windows", "macOS"],
    )
    G.add_node(
        "compound1",
        type="compound",
        category="substrate",
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


@pytest.fixture(scope="session")
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

    G.add_node(
        "actor1", node_type="threat_actor", aliases=["Thrip", "APT40"], actor_type="apt"
    )
    G.add_node(
        "actor2",
        node_type="threat_actor",
        aliases=["APT29", "Cozy Bear"],
        actor_type="apt",
    )

    G.add_edge("technique1", "actor1")
    G.add_edge("technique2", "actor2")
    G.add_edge("technique3", "actor1")

    return G


@pytest.fixture(scope="session")
def biology_graph():
    G = nx.Graph()

    G.add_node(
        "serine_center", residue_type="SER", amino_acid_type="SER", active_site=True
    )
    G.add_node(
        "histidine_neighbor",
        residue_type="HIS",
        amino_acid_type="HIS",
        verified_status=True,
    )
    G.add_node(
        "aspartate_neighbor",
        residue_type="ASP",
        amino_acid_type="ASP",
        verified_status=True,
    )
    G.add_node(
        "glycine_spacer",
        residue_type="GLY",
        amino_acid_type="GLY",
        verified_status=False,
    )

    G.add_edge("serine_center", "glycine_spacer")
    G.add_edge("glycine_spacer", "histidine_neighbor")
    G.add_edge("glycine_spacer", "aspartate_neighbor")

    G.add_node("phe_cluster_center", amino_acid_type="PHE", hydrophobic=True)

    for i, aa_type in enumerate(["LEU", "VAL", "ILE", "PHE"]):
        G.add_node(f"hydrophobic_{i}", amino_acid_type=aa_type, hydrophobic=True)
        G.add_edge("phe_cluster_center", f"hydrophobic_{i}")

    return G


@pytest.fixture(scope="session")
def energy_grid_graph():
    G = nx.Graph()

    G.add_node(
        "generator_high", node_type="generator", capacity_mw=600, status="active"
    )
    G.add_node("generator_low", node_type="generator", capacity_mw=200, status="active")

    G.add_node(
        "critical_substation",
        node_type="substation",
        peak_load_mw=250,
        voltage_level="transmission",
    )
    G.add_node(
        "distribution_substation",
        node_type="substation",
        peak_load_mw=50,
        voltage_level="distribution",
    )

    for i in range(4):
        G.add_node(
            f"residential_load_{i}",
            node_type="load",
            load_type="residential",
            peak_demand_mw=25,
        )

    G.add_node(
        "industrial_load", node_type="load", load_type="industrial", peak_demand_mw=150
    )

    G.add_edge("generator_high", "critical_substation")
    G.add_edge("generator_low", "distribution_substation")
    G.add_edge("critical_substation", "industrial_load")

    for i in range(4):
        G.add_edge("distribution_substation", f"residential_load_{i}")

    return G
