import json
import os
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any, cast

import networkx as nx

from utils.logging_config import LogContext, get_logger


def _prewarm_caches(graph: nx.Graph) -> None:
    from fol.learning.literal_generator import _get_learning_neighborhood_index
    from fol.schema import get_edge_schema

    get_edge_schema(graph)
    _get_learning_neighborhood_index(graph)


logger = get_logger("datasets")

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
DATA_DIR = Path(os.environ.get("ZIPLINE_DATA_DIR", str(PROJECT_ROOT / "data")))


def get_bron_threat_intel() -> nx.Graph:
    bron_path = DATA_DIR / "bron_threat_intel.json"

    if not bron_path.exists():
        raise FileNotFoundError(f"BRON dataset not found at {bron_path}")

    with open(bron_path) as f:
        data = json.load(f)

    G = nx.Graph()

    if "nodes" in data:
        for node in data["nodes"]:
            node_id = node.get("id")
            if not node_id:
                continue

            node_attrs = {k: v for k, v in node.items() if k not in ["id"]}
            node_type = node.get("node_type")
            if not node_type:
                continue

            G.add_node(node_id, **node_attrs)

    if "links" in data:
        for edge in data["links"]:
            source = edge.get("source")
            target = edge.get("target")

            if source and target and source in G.nodes and target in G.nodes:
                edge_attrs = {
                    k: v for k, v in edge.items() if k not in ["source", "target"]
                }
                G.add_edge(source, target, **edge_attrs)

    return G


def get_primekg_drug_repurposing() -> nx.Graph:
    primekg_path = DATA_DIR / "primekg_drug_repurposing.json"

    if not primekg_path.exists():
        raise FileNotFoundError(
            f"PrimeKG drug repurposing dataset not found at {primekg_path}"
        )

    return _load_primekg_dataset(primekg_path)


def get_cora_citation_network() -> nx.Graph:
    path = DATA_DIR / "cora_citation_network.json"

    if not path.exists():
        raise FileNotFoundError(
            f"CORA dataset not found at {path}. "
            "Run scripts/fetch_cora.py to generate it."
        )

    with open(path) as f:
        data = json.load(f)

    G = nx.Graph()

    if "nodes" in data:
        for node in data["nodes"]:
            node_id = node.get("id")
            if not node_id:
                continue
            node_attrs = {k: v for k, v in node.items() if k != "id"}
            if not node_attrs.get("node_type"):
                continue
            G.add_node(node_id, **node_attrs)

    if "links" in data:
        for edge in data["links"]:
            source = edge.get("source")
            target = edge.get("target")
            if source and target and source in G.nodes and target in G.nodes:
                edge_attrs = {
                    k: v for k, v in edge.items() if k not in ["source", "target"]
                }
                G.add_edge(source, target, **edge_attrs)

    if "metadata" in data:
        G.graph["metadata"] = data["metadata"]

    return G


def get_tennet_nh_energy() -> nx.Graph:
    path = DATA_DIR / "tennet_nh_energy.json"

    if not path.exists():
        raise FileNotFoundError(
            f"TenneT NH Energy dataset not found at {path}. "
            "Run scripts/fetch_tennet_nh.py to generate it."
        )

    return _load_energy_grid_dataset(path)


def _load_primekg_dataset(file_path: Path) -> nx.Graph:
    with open(file_path) as f:
        data = json.load(f)

    G = nx.Graph()

    if "nodes" in data:
        for node in data["nodes"]:
            node_id = node.get("id")
            if not node_id:
                continue

            node_attrs = {
                k: v for k, v in node.items() if k not in ["id", "label", "type"]
            }
            node_type = node.get("type", "entity")
            node_label = node.get("label", node_id)

            G.add_node(
                node_id, node_type=node_type, display_name=node_label, **node_attrs
            )

    if "links" in data:
        for edge in data["links"]:
            source = edge.get("source")
            target = edge.get("target")

            if source and target and source in G.nodes and target in G.nodes:
                edge_type = edge.get("label", "relationship")
                edge_attrs = {
                    k: v
                    for k, v in edge.items()
                    if k not in ["source", "target", "label"]
                }
                G.add_edge(source, target, edge_type=edge_type, **edge_attrs)

    if "metadata" in data:
        G.graph["metadata"] = data["metadata"]

    return G


def _load_energy_grid_dataset(file_path: Path) -> nx.Graph:
    with open(file_path) as f:
        data = json.load(f)

    G = nx.Graph()

    if "nodes" in data:
        for node in data["nodes"]:
            node_id = node.get("id")
            if not node_id:
                continue

            node_attrs = {
                k: v for k, v in node.items() if k not in ["id", "label", "type"]
            }
            node_type = node.get("type", "substation")
            node_label = node.get("label", node_id)

            G.add_node(
                node_id, node_type=node_type, display_name=node_label, **node_attrs
            )

    if "links" in data:
        for edge in data["links"]:
            source = edge.get("source")
            target = edge.get("target")

            if source and target and source in G.nodes and target in G.nodes:
                edge_type = edge.get("label", "transmission_line")
                edge_attrs = {
                    k: v
                    for k, v in edge.items()
                    if k not in ["source", "target", "label"]
                }
                G.add_edge(source, target, edge_type=edge_type, **edge_attrs)

    if "metadata" in data:
        G.graph["metadata"] = data["metadata"]

    return G


DATASETS = {
    "cora_citation_network": {
        "name": "CORA Citation Network (~2.7K nodes)",
        "description": "Scientific citation network where nodes are papers and edges are citations. Each paper belongs to one of 7 research categories, enabling community detection and cross-disciplinary pattern analysis.",
        "node_types": [
            "neural_networks",
            "genetic_algorithms",
            "probabilistic_methods",
            "theory",
            "case_based",
            "reinforcement_learning",
            "rule_learning",
        ],
        "loader": get_cora_citation_network,
        "default_label": "Paper",
        "representational_spaces": {
            "topology": "Citation network — papers cluster by research area; hub papers accumulate many citations; cross-area bridges are rare",
            "attributes": "category: 7 research areas (Neural_Networks, Genetic_Algorithms, Probabilistic_Methods, etc.); word_count: active bag-of-words features per paper",
            "patterns": "Research community detection, influential paper identification, cross-disciplinary bridge papers, topic-topology alignment",
        },
        "source": "LINQS — McCallum et al. (2000)",
        "use_case": "citation_network_analysis",
        "research_applications": [
            "Research community detection via citation topology",
            "Cross-disciplinary paper identification",
            "Influential paper and hub detection",
            "Topic vs. citation pattern alignment",
            "Predicate learning on homogeneous graphs",
        ],
    },
    "bron_threat_intel": {
        "name": "MITRE ATT&CK Enterprise (~1.7K nodes)",
        "description": "Pure MITRE ATT&CK Enterprise framework data with techniques, APT groups, malware, tools, mitigations, and campaigns - balanced schema for rich cross-space analysis",
        "node_types": [
            "technique",
            "apt_group",
            "malware",
            "tool",
            "mitigation",
            "campaign",
        ],
        "loader": get_bron_threat_intel,
        "default_label": "Entity",
        "representational_spaces": {
            "topology": "APT group attack chains, malware-technique relationships, campaign structures, and mitigation coverage patterns",
            "attributes": "Platform targeting, tactic classifications, temporal intelligence, threat actor aliases, and software categorization",
            "patterns": "Real-world APT behaviors, malware deployment patterns, technique clustering, and defensive countermeasure networks",
        },
        "source": "MITRE ATT&CK Enterprise Framework",
        "use_case": "cybersecurity_analysis",
    },
    "primekg_drug_repurposing": {
        "name": "PrimeKG Cancer-Focused Network (~2.1K nodes)",
        "description": "Comprehensive cancer-focused biomedical knowledge graph with all 10 PrimeKG node types for rich cross-space predicate demonstration and diverse analytical patterns",
        "node_types": [
            "disease",
            "drug",
            "gene/protein",
            "effect/phenotype",
            "anatomy",
            "biological_process",
            "pathway",
            "molecular_function",
            "cellular_component",
            "exposure",
        ],
        "loader": get_primekg_drug_repurposing,
        "default_label": "Entity",
        "source": "PrimeKG (Harvard Medical School)",
        "focus": "Cancer and related biomedical entities",
        "representational_spaces": {
            "topology": "Cancer-focused multi-scale biomedical network with diverse entity relationships across all biological scales",
            "attributes": "Cancer drugs, affected anatomy, molecular processes, pathways, exposures, and phenotypes with rich metadata",
            "patterns": "Cancer treatment patterns, disease mechanisms, drug-target interactions, biological pathways, and multi-scale therapeutic relationships",
        },
        "use_case": "cancer_biomedicine",
        "research_applications": [
            "Cancer drug discovery and repurposing analysis",
            "Disease-drug association discovery across biological scales",
            "Multi-scale therapeutic pathway exploration",
            "Side effect and exposure analysis",
            "Cross-space biomedical pattern detection",
            "Anatomy-disease-drug relationship mapping",
            "Molecular mechanism of action analysis",
        ],
    },
    "tennet_nh_energy": {
        "name": "Noord-Holland Energy Infrastructure (TenneT / Gasunie / RVO)",
        "description": (
            "Noord-Holland energy infrastructure graph combining TenneT HV substations connected "
            "by overhead lines and underground cables, individual wind turbines and solar parks "
            "connected to their nearest substation, and a Gasunie high-pressure gas pipeline network "
            "with derived junction nodes. Rich generator attributes (capacity, hub height, rotor "
            "diameter, manufacturer, commissioning year) support multi-space predicate learning."
        ),
        "node_types": ["substation", "wind_turbine", "solar_park", "gas_junction"],
        "loader": get_tennet_nh_energy,
        "default_label": "Entity",
        "representational_spaces": {
            "topology": (
                "TenneT HV substations connected via overhead and underground cables; wind turbines "
                "and solar parks connected to nearest substation via feeds_into; Gasunie pipeline "
                "junctions connected by gas transport pipelines"
            ),
            "attributes": (
                "wind_turbine: capacity_mw, hub_height_m, rotor_diameter_m, manufacturer, turbine_type, "
                "commissioned_year, municipality, wind_farm, net_production_gwh. "
                "substation: voltage_kv, status, year_built, operator. "
                "gas_junction: operator, latitude, longitude. "
                "solar_park: capacity_kw, municipality."
            ),
            "patterns": (
                "Wind turbine generation patterns by capacity tier and era, HV substation hub topology, "
                "gas pipeline network clustering, spatial co-location of renewable generation and "
                "grid infrastructure, and cross-infrastructure energy flow patterns"
            ),
        },
        "sources": [
            "Atlas NH Energie — Province of Noord-Holland",
            "https://geoservices.noord-holland.nl/ags/rest/services/thematische_services/atlasNH_Energie/MapServer",
        ],
        "use_case": "regional_energy_infrastructure_analysis",
        "research_applications": [
            "Wind turbine capacity and technology characterisation",
            "Renewable energy spatial clustering and grid connectivity",
            "HV substation hub identification",
            "Gas pipeline network resilience analysis",
            "Energy transition era detection (old vs. modern turbines)",
            "Cross-carrier infrastructure pattern learning",
        ],
    },
}


def get_dataset(name: str) -> nx.Graph:
    if name not in DATASETS:
        raise ValueError(f"Unknown dataset: {name}")
    return cast(Callable[[], nx.Graph], DATASETS[name]["loader"])()


def list_datasets() -> dict[str, dict[str, Any]]:
    return {
        name: {k: v for k, v in info.items() if k != "loader"}
        for name, info in DATASETS.items()
    }


class GraphMeta:
    def __init__(self, name: str, desc: str):
        self.name = name
        self.desc = desc


class DatasetManager:
    def __init__(self) -> None:
        self.current_dataset_name: str | None = None
        self.current_graph: nx.Graph | None = None
        self.current_metadata: dict[str, Any] | None = None
        self._graphs: dict[str, nx.Graph] = {}
        self._meta: dict[str, GraphMeta] = {}

    def set_user_graph(
        self, source_id: str, graph: nx.Graph, meta: dict[str, Any]
    ) -> dict[str, Any]:
        start_time = time.time()
        self.current_graph = graph
        self.current_dataset_name = source_id
        self.current_metadata = meta
        self._graphs[source_id] = graph
        self._meta[source_id] = GraphMeta(
            name=meta.get("name", source_id),
            desc=meta.get("description", ""),
        )
        _prewarm_caches(self.current_graph)
        load_time = (time.time() - start_time) * 1000
        logger.info(
            "User graph loaded",
            extra={
                "source_id": source_id,
                "load_time_ms": round(load_time, 2),
                "nodes": graph.number_of_nodes(),
                "edges": graph.number_of_edges(),
            },
        )
        return {
            "name": source_id,
            "nodes": graph.number_of_nodes(),
            "edges": graph.number_of_edges(),
            "metadata": meta,
        }

    def load_dataset(self, name: str) -> dict[str, Any]:
        start_time = time.time()

        if name not in DATASETS:
            if self.set_active(name):
                return self.get_current_dataset() or {
                    "name": name,
                    "nodes": 0,
                    "edges": 0,
                }
            logger.error(
                "Dataset not found",
                extra={
                    "requested_dataset": name,
                    "available_datasets": list(DATASETS.keys()),
                },
            )
            raise ValueError(f"Unknown dataset: {name}")

        logger.info(
            "Loading dataset",
            extra={"dataset_name": name, "available_datasets": list(DATASETS.keys())},
        )

        try:
            with LogContext(logger, dataset_name=name):
                logger.debug("Executing dataset loader")
                self.current_graph = get_dataset(name)
                self.current_dataset_name = name
                self.current_metadata = DATASETS[name].copy()
                self.current_metadata.pop("loader", None)

                _prewarm_caches(self.current_graph)

                load_time = (time.time() - start_time) * 1000

                logger.info(
                    "Dataset loaded",
                    extra={
                        "load_time_ms": round(load_time, 2),
                        "nodes": self.current_graph.number_of_nodes(),
                        "edges": self.current_graph.number_of_edges(),
                        "node_types": len(
                            {
                                data.get("node_type", "unknown")
                                for _, data in self.current_graph.nodes(data=True)
                            }
                        ),
                        "metadata_keys": list(self.current_metadata.keys())
                        if self.current_metadata
                        else [],
                    },
                )

        except Exception as e:
            load_time = (time.time() - start_time) * 1000
            logger.error(
                "Dataset loading failed",
                extra={
                    "load_time_ms": round(load_time, 2),
                    "error": str(e),
                    "error_type": type(e).__name__,
                },
            )
            raise

        self._graphs[name] = self.current_graph
        self._meta[name] = GraphMeta(
            name=cast(str, DATASETS[name]["name"]),
            desc=cast(str, DATASETS[name]["description"]),
        )

        return {
            "name": name,
            "nodes": self.current_graph.number_of_nodes(),
            "edges": self.current_graph.number_of_edges(),
            "metadata": self.current_metadata,
        }

    def get_current_dataset(self) -> dict[str, Any] | None:
        if not self.current_graph:
            return None

        return {
            "name": self.current_dataset_name,
            "nodes": self.current_graph.number_of_nodes(),
            "edges": self.current_graph.number_of_edges(),
            "metadata": self.current_metadata,
        }

    def get_graph(self) -> nx.Graph | None:
        return self.current_graph

    def get_available_datasets(self) -> dict[str, dict[str, Any]]:
        return list_datasets()

    def has_dataset(self) -> bool:
        return self.current_graph is not None

    @property
    def active(self) -> nx.Graph | None:
        return self.current_graph

    @property
    def active_graph(self) -> str | None:
        return self.current_dataset_name

    @property
    def graphs(self) -> dict[str, nx.Graph]:
        return self._graphs

    @property
    def meta(self) -> dict[str, GraphMeta]:
        return self._meta

    def set(self, name: str, graph: nx.Graph, description: str = "") -> None:
        self._graphs[name] = graph
        self._meta[name] = GraphMeta(name=name, desc=description)

    def set_active(self, name: str) -> bool:
        if name in self._graphs:
            self.current_graph = self._graphs[name]
            self.current_dataset_name = name
            if name in DATASETS:
                self.current_metadata = DATASETS[name].copy()
                self.current_metadata.pop("loader", None)
            else:
                self.current_metadata = {
                    "name": name,
                    "description": self._meta[name].desc,
                }
            return True
        return False
