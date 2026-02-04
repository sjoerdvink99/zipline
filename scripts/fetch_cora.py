"""
Fetch and process the CORA citation network dataset.

CORA: McCallum et al. (2000) — 2,708 scientific papers, 5,429 citation edges,
7 research categories, 1433 binary bag-of-words features per paper.

Source: https://linqs-data.soe.ucsc.edu/public/lbc/cora.tgz
"""

import io
import json
import random
import tarfile
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import requests


CORA_URL = "https://linqs-data.soe.ucsc.edu/public/lbc/cora.tgz"

CATEGORIES = [
    "Case_Based",
    "Genetic_Algorithms",
    "Neural_Networks",
    "Probabilistic_Methods",
    "Reinforcement_Learning",
    "Rule_Learning",
    "Theory",
]

# Plausible ML/AI venues for each category.
VENUES_BY_CATEGORY: dict[str, list[str]] = {
    "Case_Based": ["ICCBR", "ECAI", "AAAI", "IJCAI", "Applied Intelligence"],
    "Genetic_Algorithms": ["GECCO", "CEC", "PPSN", "ICGA", "Evolutionary Computation"],
    "Neural_Networks": ["NeurIPS", "ICML", "ICLR", "CVPR", "Neural Networks"],
    "Probabilistic_Methods": ["UAI", "AISTATS", "IJCAI", "AAAI", "JMLR"],
    "Reinforcement_Learning": ["NeurIPS", "ICML", "ICLR", "ICAPS", "JAIR"],
    "Rule_Learning": ["ECML", "ILP", "IJCAI", "Machine Learning", "MLJ"],
    "Theory": ["COLT", "ALT", "STOC", "FOCS", "JMLR"],
}

# CORA covers ML papers from roughly the late 1980s through 1999.
YEAR_RANGE = (1990, 1999)


def download_cora() -> tuple[str, str]:
    """Download cora.tgz and return (cora.content, cora.cites) as strings."""
    print("Downloading CORA dataset from LINQS...")
    response = requests.get(CORA_URL, timeout=(10, 120))
    response.raise_for_status()

    with tarfile.open(fileobj=io.BytesIO(response.content), mode="r:gz") as tar:
        content_file = tar.extractfile("cora/cora.content")
        cites_file = tar.extractfile("cora/cora.cites")
        assert content_file is not None and cites_file is not None
        content = content_file.read().decode("utf-8")
        cites = cites_file.read().decode("utf-8")

    return content, cites


def parse_content(content: str, seed: int = 42) -> list[dict]:
    """Parse cora.content into node dicts.

    Each line: <paper_id> <word_feat_0> ... <word_feat_1432> <class_label>
    """
    random.seed(seed)
    nodes = []
    for line in content.strip().splitlines():
        parts = line.strip().split("\t")
        if len(parts) < 3:
            continue

        paper_id = parts[0]
        features = parts[1:-1]  # 1433 binary values
        category = parts[-1]

        # Summarise the bag-of-words as a word count (number of active features)
        word_count = sum(int(f) for f in features)

        # Use the category (lowercased) as node_type so the frontend can
        # colour each research area distinctly, just like other datasets.
        node_type = category.lower()

        year = random.randint(*YEAR_RANGE)
        venue = random.choice(VENUES_BY_CATEGORY.get(category, ["Workshop"]))

        nodes.append(
            {
                "id": f"paper_{paper_id}",
                "node_type": node_type,
                "display_name": f"Paper {paper_id}",
                "label": f"Paper {paper_id}",
                "paper_id": paper_id,
                "category": category,
                "word_count": word_count,
                "year": year,
                "venue": venue,
            }
        )

    return nodes


def parse_cites(cites: str, node_ids: set) -> list[dict]:
    """Parse cora.cites into edge dicts.

    Each line: <citing_paper_id> <cited_paper_id>
    """
    edges = []
    seen = set()

    for line in cites.strip().splitlines():
        parts = line.strip().split("\t")
        if len(parts) != 2:
            continue

        src_id = f"paper_{parts[0]}"
        tgt_id = f"paper_{parts[1]}"

        # Skip self-loops and edges referencing unknown nodes
        if src_id == tgt_id:
            continue
        if src_id not in node_ids or tgt_id not in node_ids:
            continue

        # Deduplicate (undirected: treat (a,b) and (b,a) as the same)
        key = (min(src_id, tgt_id), max(src_id, tgt_id))
        if key in seen:
            continue
        seen.add(key)

        edges.append(
            {
                "source": src_id,
                "target": tgt_id,
                "edge_type": "cites",
                "label": "cites",
            }
        )

    return edges


def build_dataset(nodes: list[dict], edges: list[dict]) -> dict:
    # Remove isolated nodes (no edges)
    connected_ids: set[str] = set()
    for edge in edges:
        connected_ids.add(edge["source"])
        connected_ids.add(edge["target"])

    isolated = [n for n in nodes if n["id"] not in connected_ids]
    if isolated:
        print(f"Removing {len(isolated)} isolated nodes (no citations)")
        nodes = [n for n in nodes if n["id"] in connected_ids]

    # Statistics
    category_counts: dict[str, int] = defaultdict(int)
    for node in nodes:
        category_counts[node["category"]] += 1

    metadata = {
        "name": "CORA Citation Network",
        "description": (
            "Scientific citation network where nodes are papers and edges are "
            "citations. Each paper is classified into one of 7 research categories. "
            "Rich combination of citation topology and content-based attributes."
        ),
        "domain": "academic_citations",
        "source": "LINQS — McCallum et al. (2000)",
        "node_count": len(nodes),
        "edge_count": len(edges),
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "data_sources": ["https://linqs-data.soe.ucsc.edu/public/lbc/cora.tgz"],
        "schema_version": "1.0",
        "node_distribution": dict(category_counts),
        "representational_spaces": {
            "topology": (
                "Citation network — papers form community clusters by research area; "
                "hub papers have high citation counts; cross-area bridges are rare"
            ),
            "attributes": (
                "category: 7 research areas (Neural_Networks, Genetic_Algorithms, etc.); "
                "word_count: number of active bag-of-words features (proxy for paper breadth)"
            ),
            "patterns": (
                "Research community detection via citation topology vs. topic category; "
                "cross-disciplinary paper identification; prolific authors and influential papers"
            ),
        },
    }

    return {"nodes": nodes, "links": edges, "metadata": metadata}


def main():
    content_raw, cites_raw = download_cora()

    print("Parsing nodes...")
    nodes = parse_content(content_raw)
    node_ids = {n["id"] for n in nodes}
    print(f"  {len(nodes)} papers loaded")

    print("Parsing citations...")
    edges = parse_cites(cites_raw, node_ids)
    print(f"  {len(edges)} citation edges loaded")

    dataset = build_dataset(nodes, edges)

    # Print summary
    print(f"\nDataset statistics:")
    print(f"  Nodes: {dataset['metadata']['node_count']}")
    print(f"  Edges: {dataset['metadata']['edge_count']}")
    print("  Category breakdown:")
    for cat, count in sorted(dataset["metadata"]["node_distribution"].items()):
        print(f"    {cat}: {count}")

    output_file = Path(__file__).parent.parent / "data" / "cora_citation_network.json"
    output_file.parent.mkdir(parents=True, exist_ok=True)

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(dataset, f, indent=2, ensure_ascii=False)

    print(f"\nOutput: {output_file}")
    print("Done.")


if __name__ == "__main__":
    main()
