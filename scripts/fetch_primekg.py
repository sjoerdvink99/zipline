import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

import pandas as pd
import requests

PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
DATA_DIR.mkdir(parents=True, exist_ok=True)
RAW_DIR.mkdir(parents=True, exist_ok=True)

DATAVERSE_BASE = "https://dataverse.harvard.edu/api/access/datafile"
FILES = {
    "kg":               (6180620, "kg_primekg_raw.csv"),
    "drug_features":    (6180619, "drug_features_raw.tab"),
    "disease_features": (6180618, "disease_features_raw.tab"),
}
MIN_SIZES = {
    "kg":               400_000_000,
    "drug_features":    500_000,
    "disease_features": 500_000,
}

N_DISEASES             = 120   # was 100; adds neuro/cardio/autoimmune coverage gaps
MAX_DRUG_TARGETS       = 550   # was 400; adds ~250 drug-side gene nodes
MAX_DISEASE_GENES      = 450   # was 300; adds ~250 disease-side gene nodes
MAX_BIO_NODES_PER_TYPE = 40    # was 25; richer annotation context per type
MAX_BIO_ANNOTS         = 20

# Pharmacokinetic ratio threshold: demote bridge_gene → drug_target if
# drug_protein edges / disease_protein edges > this threshold.
# Prevents high-affinity drug carriers (ALB, ORM1) from being classified as
# mechanistic bridge genes — they are pharmacokinetic hubs, not repurposing targets.
PK_RATIO_THRESHOLD     = 8

_KEPT_RELATIONS = frozenset({
    "indication",
    "contraindication",
    "off-label use",
    "drug_protein",
    "disease_protein",
    "disease_disease",
    "protein_protein",
    "molfunc_protein",
    "pathway_protein",
    "bioprocess_protein",
    "cellcomp_protein",
})

_KNOWN_GROUPS = frozenset({
    "approved", "investigational", "experimental",
    "illicit", "nutraceutical", "withdrawn", "vet_approved",
})

_STATE_KEYWORDS = frozenset({"solid", "liquid", "gas", "powder", "solution"})

_NUM_RE = re.compile(r"[-+]?\d+\.?\d*")


def _download(file_id: int, dest: Path) -> None:
    url = f"{DATAVERSE_BASE}/{file_id}"
    print(f"  Downloading {dest.name} from {url} …")
    r = requests.get(url, stream=True, timeout=600)
    r.raise_for_status()
    with open(dest, "wb") as f:
        for chunk in r.iter_content(chunk_size=65536):
            f.write(chunk)
    print(f"  Saved {dest.stat().st_size / 1e6:.1f} MB → {dest}")


def _ensure(key: str) -> Path:
    _, fname = FILES[key]
    path = RAW_DIR / fname
    min_sz = MIN_SIZES.get(key, 0)
    if path.exists() and path.stat().st_size >= min_sz:
        print(f"  {fname} already cached ({path.stat().st_size / 1e6:.1f} MB)")
    else:
        if path.exists():
            print(f"  {fname} too small; re-downloading …")
            path.unlink()
        file_id, _ = FILES[key]
        _download(file_id, path)
    return path


def _stable_top(counter: Counter, n: int) -> list[int]:
    return [ix for ix, _ in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))[:n]]


def _parse_drug_categories(raw: str) -> list[str]:
    if not raw or not isinstance(raw, str):
        return []
    if " is part of " in raw:
        raw = raw.split(" is part of ", 1)[1]
    raw = raw.rstrip(".")
    return [p.strip() for p in raw.split(" ; ") if p.strip() and len(p.strip()) < 120]


def _parse_drug_groups(raw: str) -> list[str]:
    if not raw or not isinstance(raw, str):
        return []
    text_lower = raw.lower()
    return [g for g in _KNOWN_GROUPS if g.replace("_", " ") in text_lower]


def _parse_numeric(raw: Any) -> float | None:
    if raw is None or (isinstance(raw, float) and raw != raw):
        return None
    try:
        v = float(raw)
        return None if v != v else v
    except (TypeError, ValueError):
        pass
    m = _NUM_RE.search(str(raw))
    if m:
        try:
            return float(m.group())
        except ValueError:
            pass
    return None


def _parse_state(raw: Any) -> str | None:
    s = str(raw).strip().lower() if pd.notna(raw) else ""
    for kw in _STATE_KEYWORDS:
        if kw in s:
            return kw
    return None


def _parse_atc_groups(raw: Any) -> list[str]:
    s = str(raw).strip() if pd.notna(raw) else ""
    if not s or s.lower() in {"nan", "none", ""}:
        return []
    _MARKERS = [
        "is anatomically related to ",
        "is in the therapeutic group of ",
        "is pharmacologically related to ",
    ]
    s_lower = s.lower()
    extracted: str | None = None
    for marker in _MARKERS:
        if marker in s_lower:
            extracted = s[s_lower.index(marker) + len(marker):]
            break
    if extracted is None:
        if " is " in s_lower:
            extracted = s.rsplit(" is ", 1)[-1]
        else:
            return []
    extracted = extracted.rstrip(".")
    seen: set[str] = set()
    result = []
    for p in extracted.split(" and "):
        p = p.strip()
        if p and p not in seen and len(p) < 80:
            seen.add(p)
            result.append(p)
    return result


def _parse_prevalence(raw: str) -> list[str]:
    if not raw or not isinstance(raw, str):
        return []
    s = raw.lower().strip()
    if "unknown" in s:
        return ["prevalence_unknown"]
    if "< 1 / 1 000 000" in s or "1-9 / 1 000 000" in s:
        return ["prevalence_ultrarare"]
    if "1-9 / 100 000" in s:
        return ["prevalence_very_rare"]
    if "1-9 / 10 000" in s or "1-5 / 10 000" in s:
        return ["prevalence_rare"]
    if "> 1 / 1000" in s or "1-5 / 1000" in s:
        return ["prevalence_common"]
    return []


def load_kg() -> pd.DataFrame:
    path = _ensure("kg")
    print("Loading kg.csv …")
    df = pd.read_csv(path, low_memory=False)
    print(f"  {len(df):,} edges")
    return df


def load_drug_features() -> pd.DataFrame:
    path = _ensure("drug_features")
    print("Loading drug_features.tab …")
    df = pd.read_csv(path, sep="\t", low_memory=False)
    print(f"  {len(df):,} drugs")
    return df


def load_disease_features() -> pd.DataFrame:
    path = _ensure("disease_features")
    print("Loading disease_features.tab …")
    usecols = ["node_index", "group_name_bert", "orphanet_prevalence"]
    df = pd.read_csv(path, sep="\t", usecols=usecols, low_memory=False)
    print(f"  {len(df):,} diseases")
    return df


def build_drug_attrs(drug_feats: pd.DataFrame) -> dict[int, dict]:
    attrs: dict[int, dict] = {}
    for _, row in drug_feats.iterrows():
        try:
            nid = int(row["node_index"])
        except (ValueError, TypeError):
            continue
        d: dict[str, Any] = {}

        cats = _parse_drug_categories(str(row.get("category", "")))
        if cats:
            d["categories"] = cats

        groups = _parse_drug_groups(str(row.get("group", "")))
        if groups:
            d["groups"] = groups

        for atc in ("atc_1", "atc_2", "atc_3", "atc_4"):
            gl = _parse_atc_groups(row.get(atc))
            if gl:
                d[atc] = gl

        state = _parse_state(row.get("state"))
        if state:
            d["state"] = state

        for col in ("molecular_weight", "tpsa", "clogp"):
            v = _parse_numeric(row.get(col))
            if v is not None:
                d[col] = round(v, 4)

        attrs[nid] = d
    return attrs


def build_disease_attrs(disease_feats: pd.DataFrame) -> dict[int, dict]:
    attrs: dict[int, dict] = {}
    for _, row in disease_feats.iterrows():
        try:
            nid = int(row["node_index"])
        except (ValueError, TypeError):
            continue
        d: dict[str, Any] = {}

        group = str(row.get("group_name_bert", "")).strip()
        if group and group not in {"nan", "none", ""}:
            d["disease_group"] = group

        prevalence = _parse_prevalence(str(row.get("orphanet_prevalence", "")))
        if prevalence:
            d["prevalence"] = prevalence

        attrs[nid] = d
    return attrs


def build_gene_bio_attrs(
    kg: pd.DataFrame,
    selected_genes: set[int],
) -> dict[int, dict]:
    BIO_RELS: dict[str, str] = {
        "molfunc_protein":    "molecular_functions",
        "pathway_protein":    "pathways",
        "bioprocess_protein": "biological_processes",
        "cellcomp_protein":   "cellular_components",
    }
    attrs: dict[int, dict] = {}

    for rel, attr_key in BIO_RELS.items():
        sub = kg[kg["relation"] == rel]

        x_mask = (sub["x_type"] == "gene/protein") & sub["x_index"].isin(selected_genes)
        x_pairs = sub.loc[x_mask, ["x_index", "y_name"]].rename(
            columns={"x_index": "gene_ix", "y_name": "bio_name"}
        )
        y_mask = (sub["y_type"] == "gene/protein") & sub["y_index"].isin(selected_genes)
        y_pairs = sub.loc[y_mask, ["y_index", "x_name"]].rename(
            columns={"y_index": "gene_ix", "x_name": "bio_name"}
        )

        all_pairs = pd.concat([x_pairs, y_pairs], ignore_index=True)
        all_pairs = all_pairs[all_pairs["bio_name"].notna()]
        all_pairs["bio_name"] = all_pairs["bio_name"].astype(str)
        all_pairs = all_pairs[~all_pairs["bio_name"].isin({"nan", ""})]

        for gene_ix, group in all_pairs.groupby("gene_ix"):
            seen: set[str] = set()
            names: list[str] = []
            for name in group["bio_name"]:
                if name not in seen and len(names) < MAX_BIO_ANNOTS:
                    seen.add(name)
                    names.append(name)
            attrs.setdefault(int(gene_ix), {})[attr_key] = names

    return attrs


def build_drug_ddi_counts(
    kg: pd.DataFrame,
    selected_drugs: set[int],
) -> dict[int, int]:
    ddi = kg[kg["relation"] == "drug_drug"]
    cx = ddi.loc[ddi["x_index"].isin(selected_drugs), "x_index"].value_counts()
    cy = ddi.loc[ddi["y_index"].isin(selected_drugs), "y_index"].value_counts()
    combined: Counter = Counter(cx.to_dict()) + Counter(cy.to_dict())
    return {int(k): int(v) for k, v in combined.items()}


def build_bridge_bio_nodes(
    kg: pd.DataFrame,
    bridge_genes: set[int],
) -> dict[int, dict]:
    BIO_RELS: dict[str, str] = {
        "molfunc_protein":    "molecular_function",
        "pathway_protein":    "pathway",
        "bioprocess_protein": "biological_process",
        "cellcomp_protein":   "cellular_component",
    }
    bio_nodes: dict[int, dict] = {}

    for rel, bio_type in BIO_RELS.items():
        sub = kg[kg["relation"] == rel]

        x_is_gene = sub["x_type"] == "gene/protein"
        y_is_gene = sub["y_type"] == "gene/protein"

        xg_mask = x_is_gene & sub["x_index"].isin(bridge_genes)
        x_bio = sub.loc[xg_mask, ["y_index", "y_name", "y_source", "y_id"]]
        x_bio = x_bio.rename(columns={"y_index": "bio_ix", "y_name": "bio_name",
                                       "y_source": "bio_src", "y_id": "bio_sid"})

        yg_mask = y_is_gene & sub["y_index"].isin(bridge_genes)
        y_bio = sub.loc[yg_mask, ["x_index", "x_name", "x_source", "x_id"]]
        y_bio = y_bio.rename(columns={"x_index": "bio_ix", "x_name": "bio_name",
                                       "x_source": "bio_src", "x_id": "bio_sid"})

        all_bio = pd.concat([x_bio, y_bio], ignore_index=True)
        if all_bio.empty:
            continue

        bio_counts = all_bio["bio_ix"].value_counts()
        top_bio_ixs = set(_stable_top(Counter(bio_counts.to_dict()), MAX_BIO_NODES_PER_TYPE))

        for _, row in all_bio.drop_duplicates("bio_ix").iterrows():
            bix = int(row["bio_ix"])
            if bix not in top_bio_ixs:
                continue
            bio_nodes[bix] = {
                "id": str(bix),
                "label": str(row["bio_name"]) if pd.notna(row["bio_name"]) else str(bix),
                "type": bio_type,
            }

    print(f"  Bio annotation nodes (bridge genes): {len(bio_nodes)}")
    return bio_nodes


def build_drug_repurposing_subset(
    kg: pd.DataFrame,
) -> tuple[pd.DataFrame, set[int], set[int], set[int], set[int]]:
    print("\nBuilding drug-repurposing subset …")

    x_meta = kg[["x_index", "x_type"]].rename(columns={"x_index": "nix", "x_type": "ntype"})
    y_meta = kg[["y_index", "y_type"]].rename(columns={"y_index": "nix", "y_type": "ntype"})
    node_type_map: dict[int, str] = (
        pd.concat([x_meta, y_meta], ignore_index=True)
        .drop_duplicates(subset="nix")
        .set_index("nix")["ntype"]
        .fillna("entity")
        .to_dict()
    )
    print(f"  Total unique nodes in full kg: {len(node_type_map):,}")

    def rel_df(relation: str) -> pd.DataFrame:
        sub = kg[kg["relation"] == relation].copy()
        sub["x_ntype"] = sub["x_index"].map(node_type_map).fillna("entity")
        sub["y_ntype"] = sub["y_index"].map(node_type_map).fillna("entity")
        return sub

    ind = rel_df("indication")
    x_dis = ind.loc[ind["x_ntype"] == "disease", "x_index"].astype(int)
    y_dis = ind.loc[ind["y_ntype"] == "disease", "y_index"].astype(int)
    disease_counts: Counter = Counter(x_dis.tolist()) + Counter(y_dis.tolist())
    top_diseases = set(_stable_top(disease_counts, N_DISEASES))
    print(f"  Top diseases: {len(top_diseases)}")

    mask_xd = (ind["x_ntype"] == "drug") & ind["y_index"].isin(top_diseases)
    mask_yd = (ind["y_ntype"] == "drug") & ind["x_index"].isin(top_diseases)
    selected_drugs = (
        set(ind.loc[mask_xd, "x_index"].astype(int))
        | set(ind.loc[mask_yd, "y_index"].astype(int))
    )
    print(f"  Indication drugs: {len(selected_drugs)}")

    dp = rel_df("drug_protein")
    mask_xd_yg = (dp["x_ntype"] == "drug") & dp["x_index"].isin(selected_drugs) & (dp["y_ntype"] == "gene/protein")
    mask_yd_xg = (dp["y_ntype"] == "drug") & dp["y_index"].isin(selected_drugs) & (dp["x_ntype"] == "gene/protein")
    drug_targets = (
        set(dp.loc[mask_xd_yg, "y_index"].astype(int))
        | set(dp.loc[mask_yd_xg, "x_index"].astype(int))
    )
    if len(drug_targets) > MAX_DRUG_TARGETS:
        deg = Counter(dp.loc[dp["x_index"].isin(drug_targets), "x_index"].value_counts().to_dict())
        deg += Counter(dp.loc[dp["y_index"].isin(drug_targets), "y_index"].value_counts().to_dict())
        drug_targets = set(_stable_top(deg, MAX_DRUG_TARGETS))
    print(f"  Drug protein targets: {len(drug_targets)}")

    dp2 = rel_df("disease_protein")
    mask_xd_yg = (dp2["x_ntype"] == "disease") & dp2["x_index"].isin(top_diseases) & (dp2["y_ntype"] == "gene/protein")
    mask_yd_xg = (dp2["y_ntype"] == "disease") & dp2["y_index"].isin(top_diseases) & (dp2["x_ntype"] == "gene/protein")
    disease_genes = (
        set(dp2.loc[mask_xd_yg, "y_index"].astype(int))
        | set(dp2.loc[mask_yd_xg, "x_index"].astype(int))
    )
    if len(disease_genes) > MAX_DISEASE_GENES:
        deg = Counter(dp2.loc[dp2["x_index"].isin(disease_genes), "x_index"].value_counts().to_dict())
        deg += Counter(dp2.loc[dp2["y_index"].isin(disease_genes), "y_index"].value_counts().to_dict())
        disease_genes = set(_stable_top(deg, MAX_DISEASE_GENES))
    print(f"  Disease-associated genes: {len(disease_genes)}")

    bridge_genes = drug_targets & disease_genes
    selected_genes = drug_targets | disease_genes
    print(f"  Bridge genes (target ∩ disease gene): {len(bridge_genes)}")
    print(f"  Total selected genes: {len(selected_genes)}")

    bio_rels = {"molfunc_protein", "pathway_protein", "bioprocess_protein", "cellcomp_protein"}
    bio_node_types = {"molecular_function", "pathway", "biological_process", "cellular_component"}
    bridge_bio_nodes: set[int] = set()
    for brel in bio_rels:
        bsub = kg[kg["relation"] == brel].copy()
        bsub["x_ntype"] = bsub["x_index"].map(node_type_map).fillna("entity")
        bsub["y_ntype"] = bsub["y_index"].map(node_type_map).fillna("entity")
        x_mask = bsub["x_index"].isin(bridge_genes) & bsub["y_ntype"].isin(bio_node_types)
        y_mask = bsub["y_index"].isin(bridge_genes) & bsub["x_ntype"].isin(bio_node_types)
        bridge_bio_nodes |= set(bsub.loc[x_mask, "y_index"].astype(int))
        bridge_bio_nodes |= set(bsub.loc[y_mask, "x_index"].astype(int))
    print(f"  Bridge bio candidates (before capping): {len(bridge_bio_nodes)}")

    all_selected = top_diseases | selected_drugs | selected_genes | bridge_bio_nodes
    print(f"  Total selected nodes (incl. bridge bio): {len(all_selected)}")

    mask = kg["x_index"].isin(all_selected) & kg["y_index"].isin(all_selected)
    subset = kg[mask].copy()
    print(f"  Edges in raw induced subgraph: {len(subset):,} (before relation filtering)")

    return subset, bridge_genes, drug_targets, disease_genes, selected_drugs


def convert(
    subset: pd.DataFrame,
    bio_nodes_dict: dict[int, dict],
    drug_attrs: dict[int, dict],
    disease_attrs: dict[int, dict],
    gene_bio_attrs: dict[int, dict],
    drug_ddi_counts: dict[int, int],
    indication_counts: dict[int, int],
    bridge_genes: set[int],
    drug_targets: set[int],
    disease_genes: set[int],
) -> dict:
    print("\nConverting to ZipLine format …")

    bio_node_ixs = set(bio_nodes_dict.keys())

    nodes: dict[str, dict] = {}

    # Pre-compute per-gene drug_protein and disease_protein edge counts for the
    # pharmacokinetic ratio check. Genes with a very high drug/disease ratio are
    # pharmacokinetic hubs (drug carriers like ALB, efflux pumps like ORM1) rather
    # than mechanistic repurposing targets, and are demoted from bridge_gene to drug_target.
    _dp_drug_count: dict[int, int] = {}
    _dp_disease_count: dict[int, int] = {}
    for _, row in subset[subset["relation"] == "drug_protein"].iterrows():
        for col in ("x_index", "y_index"):
            ix = int(row[col])
            if ix in bridge_genes:
                _dp_drug_count[ix] = _dp_drug_count.get(ix, 0) + 1
    for _, row in subset[subset["relation"] == "disease_protein"].iterrows():
        for col in ("x_index", "y_index"):
            ix = int(row[col])
            if ix in bridge_genes:
                _dp_disease_count[ix] = _dp_disease_count.get(ix, 0) + 1

    _pk_demoted: set[int] = set()
    for ix in bridge_genes:
        drug_deg = _dp_drug_count.get(ix, 0)
        disease_deg = _dp_disease_count.get(ix, 0)
        if disease_deg > 0 and drug_deg / disease_deg > PK_RATIO_THRESHOLD:
            _pk_demoted.add(ix)
    if _pk_demoted:
        print(f"  PK-demoted bridge genes → drug_target: {len(_pk_demoted)}")

    def _gene_subtype(ix: int) -> str:
        if ix in bridge_genes and ix not in _pk_demoted:
            return "bridge_gene"
        if ix in drug_targets or ix in _pk_demoted:
            return "drug_target"
        return "disease_gene"

    def _add_node(ix: int, src_type: str, nname: str) -> None:
        key = str(ix)
        if key in nodes:
            return

        if src_type == "gene/protein":
            ntype = _gene_subtype(ix)
        else:
            ntype = src_type

        node: dict[str, Any] = {
            "id": key,
            "label": nname,
            "type": ntype,
        }

        if ntype == "drug":
            if ix in drug_attrs:
                node.update(drug_attrs[ix])
            ddi = drug_ddi_counts.get(ix)
            if ddi is not None:
                node["drug_interaction_count"] = ddi
            ind_cnt = indication_counts.get(ix)
            if ind_cnt is not None:
                node["indication_count"] = ind_cnt

        elif ntype == "disease":
            if ix in disease_attrs:
                node.update(disease_attrs[ix])

        else:
            if ix in gene_bio_attrs:
                node.update(gene_bio_attrs[ix])

        nodes[key] = node

    edges: list[dict] = []
    seen_pairs: set[frozenset] = set()

    for _, row in subset.iterrows():
        rel = str(row["relation"]) if pd.notna(row["relation"]) else ""
        if rel not in _KEPT_RELATIONS:
            continue

        xix = int(row["x_index"])
        yix = int(row["y_index"])

        if rel == "protein_protein":
            if xix not in bridge_genes or yix not in bridge_genes:
                continue

        if rel in {"molfunc_protein", "pathway_protein", "bioprocess_protein", "cellcomp_protein"}:
            gene_ix = xix if str(row.get("x_type", "")) == "gene/protein" else yix
            bio_ix  = yix if str(row.get("x_type", "")) == "gene/protein" else xix
            if gene_ix not in bridge_genes or bio_ix not in bio_node_ixs:
                continue

        # Deduplicate bidirectional edges (PrimeKG stores both (A,B) and (B,A))
        pair = frozenset([str(xix), str(yix)])
        pair_key = (pair, rel)
        if pair_key in seen_pairs:
            continue
        seen_pairs.add(pair_key)

        _add_node(
            xix,
            str(row["x_type"]) if pd.notna(row["x_type"]) else "entity",
            str(row["x_name"]) if pd.notna(row["x_name"]) else str(xix),
        )
        _add_node(
            yix,
            str(row["y_type"]) if pd.notna(row["y_type"]) else "entity",
            str(row["y_name"]) if pd.notna(row["y_name"]) else str(yix),
        )

        edges.append({"source": str(xix), "target": str(yix), "label": rel})

    for bix, bnode in bio_nodes_dict.items():
        key = str(bix)
        if key not in nodes:
            nodes[key] = bnode

    nodes_list = list(nodes.values())
    node_type_counts = dict(Counter(n["type"] for n in nodes_list))
    edge_type_counts = dict(Counter(e["label"] for e in edges))

    print(f"  Nodes: {len(nodes_list)}")
    print(f"  Edges: {len(edges)}")
    print(f"  Node types: {node_type_counts}")
    print(f"  Edge types: {edge_type_counts}")

    metadata = {
        "name": "PrimeKG Drug-Repurposing Network",
        "source": "PrimeKG (Harvard Medical School)",
        "data_url": "https://doi.org/10.7910/DVN/IXA7BM",
        "source_file_ids": {"kg": 6180620, "drug_features": 6180619, "disease_features": 6180618},
        "subset_params": {
            "n_diseases": N_DISEASES,
            "max_drug_targets": MAX_DRUG_TARGETS,
            "max_disease_genes": MAX_DISEASE_GENES,
            "max_bio_nodes_per_type": MAX_BIO_NODES_PER_TYPE,
            "bio_nodes": "bridge_genes_only",
            "ppi": "bridge_genes_only",
            "selection_criterion": "stable_sort_count_desc_index_asc",
        },
        "node_count": len(nodes_list),
        "edge_count": len(edges),
        "node_types": node_type_counts,
        "relationship_types": edge_type_counts,
    }
    return {"nodes": nodes_list, "links": edges, "metadata": metadata}


def main() -> None:
    print("PrimeKG Drug-Repurposing Dataset for ZipLine")
    print("=" * 55)

    try:
        kg = load_kg()
        drug_feats = load_drug_features()
        disease_feats = load_disease_features()

        subset, bridge_genes, drug_targets, disease_genes, selected_drugs = (
            build_drug_repurposing_subset(kg)
        )
        selected_genes = drug_targets | disease_genes

        print("\nBuilding node attributes …")
        drug_attrs    = build_drug_attrs(drug_feats)
        disease_attrs = build_disease_attrs(disease_feats)
        gene_bio_attrs = build_gene_bio_attrs(kg, selected_genes)
        bio_nodes_dict = build_bridge_bio_nodes(kg, bridge_genes)
        drug_ddi_counts = build_drug_ddi_counts(kg, selected_drugs)

        ind_sub = kg[
            (kg["relation"] == "indication") &
            (kg["x_index"].isin(selected_drugs) | kg["y_index"].isin(selected_drugs))
        ]
        top_diseases_set = set(
            subset.loc[subset["x_type"] == "disease", "x_index"].astype(int).tolist()
            + subset.loc[subset["y_type"] == "disease", "y_index"].astype(int).tolist()
        )
        ic_x = ind_sub.loc[ind_sub["x_type"] == "drug", ["x_index", "y_index"]]
        ic_x = ic_x[ic_x["y_index"].isin(top_diseases_set)]
        ic_y = ind_sub.loc[ind_sub["y_type"] == "drug", ["y_index", "x_index"]]
        ic_y = ic_y[ic_y["x_index"].isin(top_diseases_set)]
        ic_counter: Counter = (
            Counter(ic_x["x_index"].astype(int).tolist())
            + Counter(ic_y["y_index"].astype(int).tolist())
        )
        indication_counts = {int(k): int(v) for k, v in ic_counter.items()}

        graph_data = convert(
            subset, bio_nodes_dict,
            drug_attrs, disease_attrs,
            gene_bio_attrs, drug_ddi_counts, indication_counts,
            bridge_genes, drug_targets, disease_genes,
        )

        out = DATA_DIR / "primekg_drug_repurposing.json"
        print(f"\nSaving to {out} …")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(graph_data, f, ensure_ascii=False)

        m = graph_data["metadata"]
        print(f"\nDataset summary")
        print(f"  Nodes : {m['node_count']}")
        print(f"  Edges : {m['edge_count']}")
        print(f"  Types : {m['node_types']}")
        print(f"\n✓ Saved to {out}")

    except Exception as exc:
        print(f"\n✗ Error: {exc}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
