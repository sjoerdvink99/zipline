"""Dataset manager for loading and managing graph datasets."""

import json
import time
from pathlib import Path
from typing import Any

import networkx as nx

from utils.logging_config import LogContext, get_logger

logger = get_logger("datasets")

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent


# Sample Dataset Loaders


def get_bron_threat_intel() -> nx.Graph:
    """Load BRON threat intelligence dataset."""
    bron_path = PROJECT_ROOT / "data" / "bron_threat_intel.json"

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

            node_attrs = {
                k: v for k, v in node.items() if k not in ["id", "label", "type"]
            }
            node_type = node.get("type")
            if not node_type:
                continue
            node_label = node.get("label", f"{node_type} {node_id}")

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

    return G


def get_primekg_drug_repurposing() -> nx.Graph:
    """Load PrimeKG drug repurposing dataset."""
    primekg_path = PROJECT_ROOT / "data" / "primekg_drug_repurposing.json"

    if not primekg_path.exists():
        raise FileNotFoundError(
            f"PrimeKG drug repurposing dataset not found at {primekg_path}"
        )

    return _load_primekg_dataset(primekg_path)


def _load_primekg_dataset(file_path: Path) -> nx.Graph:
    """Load a PrimeKG dataset from JSON file."""
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


# Dataset Registry

DATASETS = {
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
}


def get_dataset(name: str) -> nx.Graph:
    """Get a dataset by name."""
    if name not in DATASETS:
        raise ValueError(f"Unknown dataset: {name}")
    return DATASETS[name]["loader"]()


def list_datasets() -> dict[str, dict[str, Any]]:
    """List all available datasets."""
    return {
        name: {k: v for k, v in info.items() if k != "loader"}
        for name, info in DATASETS.items()
    }


# Dataset Manager Classes


class GraphMeta:
    """Metadata for a graph dataset."""

    def __init__(self, name: str, desc: str):
        self.name = name
        self.desc = desc


class DatasetManager:
    """Manager for loading and handling graph datasets."""

    def __init__(self):
        self.current_dataset_name: str | None = None
        self.current_graph: nx.Graph | None = None
        self.current_metadata: dict[str, Any] | None = None
        self._graphs: dict[str, nx.Graph] = {}
        self._meta: dict[str, GraphMeta] = {}

    def load_dataset(self, name: str) -> dict[str, Any]:
        """Load a dataset by name."""
        start_time = time.time()

        logger.info(
            "📂 Loading dataset",
            extra={"dataset_name": name, "available_datasets": list(DATASETS.keys())},
        )

        if name not in DATASETS:
            logger.error(
                "❌ Dataset not found",
                extra={
                    "requested_dataset": name,
                    "available_datasets": list(DATASETS.keys()),
                },
            )
            raise ValueError(f"Unknown dataset: {name}")

        try:
            with LogContext(logger, dataset_name=name):
                logger.debug("🔄 Executing dataset loader...")
                self.current_graph = get_dataset(name)
                self.current_dataset_name = name
                self.current_metadata = DATASETS[name].copy()
                self.current_metadata.pop("loader", None)

                load_time = (time.time() - start_time) * 1000

                logger.info(
                    "✅ Dataset loaded successfully",
                    extra={
                        "load_time_ms": round(load_time, 2),
                        "nodes": self.current_graph.number_of_nodes(),
                        "edges": self.current_graph.number_of_edges(),
                        "node_types": len(
                            {
                                data.get("type", "unknown")
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
                "❌ Dataset loading failed",
                extra={
                    "load_time_ms": round(load_time, 2),
                    "error": str(e),
                    "error_type": type(e).__name__,
                },
            )
            raise

        self._graphs[name] = self.current_graph
        self._meta[name] = GraphMeta(
            name=DATASETS[name]["name"], desc=DATASETS[name]["description"]
        )

        return {
            "name": name,
            "nodes": self.current_graph.number_of_nodes(),
            "edges": self.current_graph.number_of_edges(),
            "metadata": self.current_metadata,
        }

    def get_current_dataset(self) -> dict[str, Any] | None:
        """Get information about the current dataset."""
        if not self.current_graph:
            return None

        return {
            "name": self.current_dataset_name,
            "nodes": self.current_graph.number_of_nodes(),
            "edges": self.current_graph.number_of_edges(),
            "metadata": self.current_metadata,
        }

    def get_graph(self) -> nx.Graph | None:
        """Get the current graph."""
        return self.current_graph

    def get_available_datasets(self) -> dict[str, dict[str, Any]]:
        """Get all available datasets."""
        return list_datasets()

    def has_dataset(self) -> bool:
        """Check if a dataset is currently loaded."""
        return self.current_graph is not None

    @property
    def active(self) -> nx.Graph | None:
        """Get the active graph."""
        return self.current_graph

    @property
    def active_graph(self) -> str | None:
        """Get the active graph name."""
        return self.current_dataset_name

    @property
    def graphs(self) -> dict[str, nx.Graph]:
        """Get all loaded graphs."""
        return self._graphs

    @property
    def meta(self) -> dict[str, GraphMeta]:
        """Get metadata for all loaded graphs."""
        return self._meta

    def set(self, name: str, graph: nx.Graph, description: str = "") -> None:
        """Set a custom graph."""
        self._graphs[name] = graph
        self._meta[name] = GraphMeta(name=name, desc=description)

    def set_active(self, name: str) -> bool:
        """Set an already loaded graph as active."""
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
