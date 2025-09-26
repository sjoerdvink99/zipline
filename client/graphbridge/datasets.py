from __future__ import annotations

import json
from pathlib import Path

import networkx as nx
import numpy as np

__all__ = ["make_supply_chain", "make_social", "load_bron", "load_hetionet"]


def _get_data_dir() -> Path:
    pkg_data = Path(__file__).resolve().parent / "data"
    if pkg_data.exists():
        return pkg_data
    client_data = Path(__file__).resolve().parent.parent / "data"
    if client_data.exists():
        return client_data
    return Path.cwd() / "data"


def make_supply_chain(seed: int = 42) -> nx.Graph:
    rng = np.random.default_rng(seed)
    regions = ["North", "South", "East", "West"]
    risk_levels = ["low", "medium", "high"]

    G = nx.Graph()

    for i in range(8):
        G.add_node(
            f"F{i}",
            label="factory",
            name=f"Factory {i}",
            capacity=int(rng.integers(500, 2000)),
            region=rng.choice(regions),
            risk=rng.choice(risk_levels),
        )

    for i in range(14):
        G.add_node(
            f"D{i}",
            label="distributor",
            name=f"Distributor {i}",
            capacity=int(rng.integers(200, 800)),
            region=rng.choice(regions),
            risk=rng.choice(risk_levels),
        )

    for i in range(26):
        G.add_node(
            f"R{i}",
            label="retailer",
            name=f"Retailer {i}",
            capacity=int(rng.integers(50, 300)),
            region=rng.choice(regions),
            risk=rng.choice(risk_levels, p=[0.6, 0.3, 0.1]),
        )

    for f in range(8):
        for d in rng.choice(range(14), size=rng.integers(3, 6), replace=False):
            G.add_edge(f"F{f}", f"D{d}", type="supplies", amount=float(rng.lognormal(9.5, 0.5)))

    for d in range(14):
        for r in rng.choice(range(26), size=rng.integers(3, 7), replace=False):
            G.add_edge(f"D{d}", f"R{r}", type="distributes", amount=float(rng.lognormal(9.0, 0.6)))

    for _ in range(20):
        u, v = f"R{rng.integers(0, 26)}", f"R{rng.integers(0, 26)}"
        if u != v:
            G.add_edge(u, v, type="transfers", amount=float(rng.lognormal(8.0, 0.7)))

    for _ in range(8):
        u, v = f"D{rng.integers(0, 14)}", f"D{rng.integers(0, 14)}"
        if u != v:
            G.add_edge(u, v, type="transfers", amount=float(rng.lognormal(8.5, 0.6)))

    return G


def make_social(seed: int = 7) -> nx.Graph:
    rng = np.random.default_rng(seed)
    sizes = [45, 35, 30]
    probs = [[0.18, 0.02, 0.01], [0.02, 0.22, 0.015], [0.01, 0.015, 0.26]]

    G = nx.stochastic_block_model(sizes, probs, seed=int(seed))
    G = nx.relabel_nodes(G, {i: f"U{i}" for i in range(G.number_of_nodes())}, copy=True)

    communities = ["tech", "sports", "music"]
    roles = ["member", "moderator", "admin"]

    for i, n in enumerate(G.nodes):
        community = communities[0] if i < 45 else communities[1] if i < 80 else communities[2]
        G.nodes[n].update({
            "label": "person",
            "name": n,
            "community": community,
            "age": int(rng.integers(18, 65)),
            "activity_score": round(float(rng.exponential(50)), 1),
            "role": rng.choice(roles, p=[0.85, 0.12, 0.03]),
            "verified": bool(rng.random() > 0.7),
        })

    for u, v in G.edges:
        G[u][v]["type"] = "follows"
        G[u][v]["interactions"] = float(rng.lognormal(7.5, 0.9))

    return G


def load_bron(max_cves: int = 500) -> nx.Graph | None:
    bron_path = _get_data_dir() / "BRON.json"
    if not bron_path.exists():
        print(f"BRON dataset not found at {bron_path}")
        return None

    try:
        with open(bron_path) as f:
            data = json.load(f)

        nodes_by_type: dict[str, list] = {}
        node_attrs: dict[str, dict] = {}

        for node_data in data.get("nodes", []):
            if isinstance(node_data, list) and len(node_data) >= 2:
                node_id = str(node_data[0])
                attrs = node_data[1] if isinstance(node_data[1], dict) else {}
                kind = attrs.get("datatype", "unknown")
                nodes_by_type.setdefault(kind, []).append(node_id)
                node_attrs[node_id] = attrs

        cve_connections: dict[str, set] = {}
        edges_list = []

        for edge_data in data.get("edges", []):
            if isinstance(edge_data, list) and len(edge_data) >= 2:
                source, target = str(edge_data[0]), str(edge_data[1])
                attrs = edge_data[2] if len(edge_data) > 2 and isinstance(edge_data[2], dict) else {}
                edges_list.append((source, target, attrs))

                src_kind = node_attrs.get(source, {}).get("datatype", "")
                tgt_kind = node_attrs.get(target, {}).get("datatype", "")

                if src_kind == "cve" and tgt_kind != "cve":
                    cve_connections.setdefault(source, set()).add(target)
                elif tgt_kind == "cve" and src_kind != "cve":
                    cve_connections.setdefault(target, set()).add(source)

        top_cves = sorted(cve_connections, key=lambda c: len(cve_connections[c]), reverse=True)[:max_cves]
        selected = set(top_cves)
        for kind, ids in nodes_by_type.items():
            if kind != "cve":
                selected.update(ids)

        G = nx.Graph()
        for node_id in selected:
            attrs = node_attrs.get(node_id, {})
            G.add_node(
                node_id,
                label=attrs.get("datatype", "unknown"),
                name=attrs.get("original_id", node_id),
            )

        for source, target, attrs in edges_list:
            if source in selected and target in selected:
                edge_type = attrs.get("label", attrs.get("kind", attrs.get("type", "related")))
                G.add_edge(source, target, type=edge_type)

        return G
    except Exception as e:
        print(f"Failed to load BRON: {e}")
        return None


def load_hetionet(max_genes: int = 200, max_go_terms: int = 300) -> nx.Graph | None:
    path = _get_data_dir() / "hetionet.json"
    if not path.exists():
        print(f"Hetionet dataset not found at {path}")
        return None

    try:
        with open(path) as f:
            data = json.load(f)

        def node_id(kind: str, identifier: str) -> str:
            return f"{kind}::{identifier}"

        nodes_by_kind: dict[str, list] = {}
        node_info: dict[str, dict] = {}

        for node in data.get("nodes", []):
            kind = node.get("kind", "unknown")
            nid = node_id(kind, node.get("identifier", ""))
            nodes_by_kind.setdefault(kind, []).append(nid)
            node_info[nid] = node

        connections: dict[str, set] = {}
        edges_list = []

        for edge in data.get("edges", []):
            src_ref, tgt_ref = edge.get("source_id"), edge.get("target_id")
            if not (isinstance(src_ref, list) and isinstance(tgt_ref, list)):
                continue
            source = node_id(src_ref[0], src_ref[1])
            target = node_id(tgt_ref[0], tgt_ref[1])
            edges_list.append((source, target, edge.get("kind", "related")))
            connections.setdefault(source, set()).add(target)
            connections.setdefault(target, set()).add(source)

        selected = set()
        for kind in ["Disease", "Compound", "Symptom", "Pathway", "Anatomy", "Pharmacologic Class"]:
            selected.update(nodes_by_kind.get(kind, []))

        disease_ids = set(nodes_by_kind.get("Disease", []))
        gene_scores = {g: len(connections.get(g, set()) & disease_ids) for g in nodes_by_kind.get("Gene", [])}
        selected.update(sorted(gene_scores, key=gene_scores.get, reverse=True)[:max_genes])

        gene_set = set(sorted(gene_scores, key=gene_scores.get, reverse=True)[:max_genes])
        for kind in ["Biological Process", "Molecular Function", "Cellular Component", "Side Effect"]:
            scores = {n: len(connections.get(n, set()) & gene_set) for n in nodes_by_kind.get(kind, [])}
            selected.update(sorted(scores, key=scores.get, reverse=True)[:max_go_terms])

        G = nx.Graph()
        for nid in selected:
            info = node_info.get(nid, {})
            name = info.get("name", nid)
            G.add_node(
                nid,
                label=info.get("kind", "unknown"),
                name=name[:50] if len(name) > 50 else name,
                identifier=info.get("identifier", ""),
            )

        for source, target, edge_type in edges_list:
            if source in selected and target in selected:
                G.add_edge(source, target, type=edge_type)

        return G
    except Exception as e:
        print(f"Failed to load Hetionet: {e}")
        return None
