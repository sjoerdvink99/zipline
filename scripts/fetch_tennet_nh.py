#!/usr/bin/env python3
"""
Fetch Noord-Holland energy infrastructure from the Atlas NH Energie ArcGIS service
and build a ZipLine-compatible graph dataset.

Source:
  https://geoservices.noord-holland.nl/ags/rest/services/thematische_services/
  atlasNH_Energie/MapServer

Node types:
  substation   – TenneT HV stations (layer 5, polygons → centroids)
  wind_turbine – Wind turbines (layer 14, points)
  solar_park   – Solar parks (layer 17, polygons → centroids)
  gas_junction – Derived pipeline endpoint junctions (layer 10)

Edge types:
  hv_overhead_line     – TenneT overhead HV lines (layer 39)
  hv_underground_cable – TenneT underground HV cables (layer 40)
  gas_pipeline         – Gasunie transport pipelines (layer 10)
  feeds_into           – Generator → nearest substation (spatial proximity)
"""

import json
import math
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import requests

PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

BASE_URL = (
    "https://geoservices.noord-holland.nl/ags/rest/services"
    "/thematische_services/atlasNH_Energie/MapServer"
)

PAGE_SIZE = 1000
MAX_RETRIES = 3

# Max km from a generator to the nearest substation for a feeds_into edge
FEEDS_INTO_MAX_KM = 20.0

# Snap gas pipeline endpoints to ~50 m grid before clustering into junctions
GAS_SNAP_DEG = 0.0005  # ≈ 35–55 m at Dutch latitudes

# ─────────────────────────── Translation tables ──────────────────────────────

def translate_status(raw: str) -> str:
    """Map Dutch status strings to English, including prefix variants."""
    s = raw.strip().lower()
    if s.startswith("in bedrijf") or s.startswith("in gebruik"):
        return "operational"
    if s.startswith("in aanleg"):
        return "under_construction"
    if s.startswith("buiten bedrijf"):
        return "decommissioned"
    if s.startswith("gepland"):
        return "planned"
    if s.startswith("ontwerp"):
        return "design"
    return s

MATERIAL_NL_EN: dict[str, str] = {
    "staal": "steel",
    "x52": "steel",
    "x56": "steel",
    "x60": "steel",
    "x70": "steel",
    "polyetheen": "polyethylene",
    "gietijzer": "cast_iron",
    "pvc": "pvc",
    "asbestcement": "asbestos_cement",
}

GAS_TYPE_NL_EN: dict[str, str] = {
    "aardgas": "natural_gas",
    "stikstof": "nitrogen",
    "ngl": "natural_gas_liquids",
    "h2": "hydrogen",
    "co2": "co2",
}

RISK_NL_EN: dict[str, str] = {
    "brandbaar": "flammable",
    "giftig": "toxic",
    "brandbaar/giftig": "flammable_toxic",
}

# ──────────────────────────────── Utilities ──────────────────────────────────


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(max(0.0, min(1.0, a))))


def esri_ms_to_year(ts: int | float | None) -> int | None:
    """Convert ESRI millisecond epoch timestamp to a calendar year."""
    if ts is None:
        return None
    try:
        ts_int = int(ts)
        return datetime.fromtimestamp(ts_int / 1000, tz=timezone.utc).year
    except (OSError, ValueError, OverflowError, TypeError):
        return None


def polygon_centroid(rings: list) -> tuple[float, float] | None:
    """Return (lat, lon) centroid of the outer ring of a polygon."""
    if not rings:
        return None
    ring = rings[0]
    if len(ring) < 3:
        return None
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    return sum(lats) / len(lats), sum(lons) / len(lons)


def polyline_endpoints(
    paths: list,
) -> tuple[tuple[float, float], tuple[float, float]] | None:
    """Return (start, end) as (lat, lon) tuples from a polyline geometry."""
    if not paths:
        return None
    first_path = paths[0]
    last_path = paths[-1]
    if not first_path or not last_path:
        return None
    start = (first_path[0][1], first_path[0][0])
    end = (last_path[-1][1], last_path[-1][0])
    return start, end


def snap_coord(lat: float, lon: float, snap: float) -> tuple[float, float]:
    return (round(lat / snap) * snap, round(lon / snap) * snap)


def is_valid_nl_coord(lat: float, lon: float) -> bool:
    """Rough bounding box check for the Netherlands."""
    return 50.5 <= lat <= 54.0 and 3.0 <= lon <= 8.0


# ───────────────────────────── ArcGIS fetching ───────────────────────────────


def fetch_layer(layer_id: int, out_fields: str = "*") -> list[dict] | None:
    """
    Page through a layer's /query endpoint and return all features.
    Returns None on persistent failure so callers can skip gracefully.
    """
    features: list[dict] = []
    offset = 0

    while True:
        url = f"{BASE_URL}/{layer_id}/query"
        params = {
            "where": "1=1",
            "outFields": out_fields,
            "returnGeometry": "true",
            "outSR": "4326",
            "resultRecordCount": PAGE_SIZE,
            "resultOffset": offset,
            "f": "json",
        }

        data: dict | None = None
        for attempt in range(MAX_RETRIES):
            try:
                r = requests.get(url, params=params, timeout=90)
                r.raise_for_status()
                data = r.json()
                break
            except requests.exceptions.RequestException as exc:
                if attempt < MAX_RETRIES - 1:
                    wait = 2**attempt
                    print(
                        f"    Layer {layer_id}: attempt {attempt + 1} failed, "
                        f"retrying in {wait}s… ({exc})"
                    )
                    time.sleep(wait)
                else:
                    print(f"    Layer {layer_id}: all {MAX_RETRIES} retries failed: {exc}")
                    return None

        if data is None:
            return None

        if "error" in data:
            code = data["error"].get("code", "?")
            msg = data["error"].get("message", "")
            print(f"    Layer {layer_id}: API error {code}: {msg}")
            return None

        batch = data.get("features", [])
        features.extend(batch)

        if not data.get("exceededTransferLimit", False) or not batch:
            break

        offset += len(batch)

    return features


# ───────────────────────────── Node builders ─────────────────────────────────


def build_substation_nodes(features: list[dict]) -> list[dict]:
    nodes: list[dict] = []
    seen_ids: set[str] = set()
    for feat in features:
        attrs = feat.get("attributes", {})
        geom = feat.get("geometry", {})

        rings = geom.get("rings", [])
        centroid = polygon_centroid(rings)
        if centroid is None:
            continue

        lat, lon = centroid
        if not is_valid_nl_coord(lat, lon):
            continue

        obj_id = str(
            attrs.get("se_fld23_objectid")
            or attrs.get("esri_oid")
            or ""
        ).strip()
        if not obj_id:
            continue

        node_id = f"sub_{obj_id}"
        if node_id in seen_ids:
            continue
        seen_ids.add(node_id)

        node: dict = {
            "id": node_id,
            "type": "substation",
            "label": f"TenneT substation {obj_id}",
            "operator": "TenneT",
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
        }

        raw_status = (attrs.get("se_fld1_bedrijfsstatus") or "").strip()
        if raw_status:
            node["status"] = translate_status(raw_status)

        voltage = attrs.get("se_fld55_spanningsniveau")
        if voltage is not None:
            node["voltage_kv"] = float(voltage)

        yr = esri_ms_to_year(attrs.get("se_fld4_bouwjaar"))
        if yr and yr < 9000:  # filter sentinel values (e.g. 9998 = unknown)
            node["year_built"] = yr

        nodes.append(node)

    return nodes


def build_wind_turbine_nodes(features: list[dict]) -> list[dict]:
    nodes: list[dict] = []
    for feat in features:
        attrs = feat.get("attributes", {})

        # Prefer explicit lat/long attribute fields; fall back to geometry
        lat = attrs.get("lat")
        lon = attrs.get("long")
        if lat is None or lon is None:
            geom = feat.get("geometry", {})
            lon = geom.get("x")
            lat = geom.get("y")

        if lat is None or lon is None:
            continue
        lat, lon = float(lat), float(lon)
        if not is_valid_nl_coord(lat, lon):
            continue

        # Use objectid (ESRI OID) as the unique node ID — asset_id is a project-level
        # identifier shared by many turbines in the same park and causes duplicates.
        obj_id = attrs.get("objectid")
        if obj_id is None:
            continue
        node_id = f"wind_{obj_id}"

        windpark = (attrs.get("windpark") or "").strip()
        turbine_name = (attrs.get("turbine") or "").strip()
        label = (
            turbine_name
            or (f"{windpark} turbine {obj_id}" if windpark else f"Wind turbine {obj_id}")
        )

        node: dict = {
            "id": node_id,
            "type": "wind_turbine",
            "label": label,
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
        }

        if windpark:
            node["wind_farm"] = windpark

        manufacturer = (attrs.get("fabrikant") or "").strip()
        if manufacturer:
            node["manufacturer"] = manufacturer

        turbine_type = (attrs.get("type") or "").strip()
        if turbine_type:
            node["turbine_type"] = turbine_type

        vermogen = attrs.get("vermogen")
        if vermogen is not None:
            node["capacity_mw"] = round(float(vermogen) / 1000, 4)  # kW → MW

        ashoogte = attrs.get("ashoogte")
        if ashoogte is not None:
            node["hub_height_m"] = float(ashoogte)

        diameter = attrs.get("diameter")
        if diameter is not None:
            node["rotor_diameter_m"] = float(diameter)

        tiphoogte = attrs.get("tiphoogte")
        if tiphoogte is not None:
            node["tip_height_m"] = float(tiphoogte)

        gemeente = (attrs.get("gemeente") or "").strip()
        if gemeente:
            node["municipality"] = gemeente

        yr = esri_ms_to_year(attrs.get("startdatum"))
        if yr:
            node["commissioned_year"] = yr

        netto_prod = attrs.get("netto_prod")
        if netto_prod is not None:
            node["net_production_gwh"] = round(float(netto_prod), 3)

        nodes.append(node)

    return nodes


def build_solar_park_nodes(features: list[dict]) -> list[dict]:
    nodes: list[dict] = []
    for feat in features:
        attrs = feat.get("attributes", {})
        geom = feat.get("geometry", {})

        rings = geom.get("rings", [])
        centroid = polygon_centroid(rings)
        if centroid is None:
            continue

        lat, lon = centroid
        if not is_valid_nl_coord(lat, lon):
            continue

        obj_id = attrs.get("objectid") or attrs.get("OBJECTID")
        node: dict = {
            "id": f"solar_{obj_id}",
            "type": "solar_park",
            "label": f"Solar park {obj_id}",
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
        }

        for raw_key, eng_key in [
            ("naam", "name"),
            ("name", "name"),
            ("gemeente", "municipality"),
            ("provincie", "province"),
            ("vermogen", "capacity_kw"),
            ("oppervlakte", "area_m2"),
        ]:
            val = attrs.get(raw_key)
            if val is not None and val != "":
                node[eng_key] = val

        if "name" in node:
            node["label"] = str(node["name"])

        nodes.append(node)

    return nodes


# ──────────────────────────── Gas network builder ────────────────────────────


def build_gas_network(features: list[dict]) -> tuple[list[dict], list[dict]]:
    """
    Derive gas junction nodes and pipeline edges from Gasunie polyline features.
    Pipeline endpoints within GAS_SNAP_DEG of each other are merged into a
    single junction node.
    """
    pipeline_edges_raw: list[tuple[tuple, tuple, dict]] = []

    for feat in features:
        attrs = feat.get("attributes", {})
        geom = feat.get("geometry", {})
        paths = geom.get("paths", [])

        endpoints = polyline_endpoints(paths)
        if endpoints is None:
            continue

        start, end = endpoints
        if not is_valid_nl_coord(*start) or not is_valid_nl_coord(*end):
            continue

        edge_attrs: dict = {}

        diam = attrs.get("dom_diam")
        if diam is not None:
            edge_attrs["diameter_mm"] = float(diam)

        press = attrs.get("max_werkdr")
        if press is not None:
            edge_attrs["max_pressure_bar"] = float(press)

        mat = (attrs.get("dom_mat") or "").strip().lower()
        if mat:
            edge_attrs["material"] = MATERIAL_NL_EN.get(mat, mat)

        yr = attrs.get("jr_in_gebr")
        if yr is not None:
            try:
                edge_attrs["year_commissioned"] = int(yr)
            except (TypeError, ValueError):
                pass

        gas_type = (attrs.get("type_leid") or "").strip().lower()
        if gas_type:
            edge_attrs["gas_type"] = GAS_TYPE_NL_EN.get(gas_type, gas_type)

        risk = (attrs.get("aard_risic") or "").strip().lower()
        if risk:
            edge_attrs["risk_type"] = RISK_NL_EN.get(risk, risk)

        pipeline_edges_raw.append((start, end, edge_attrs))

    # Cluster endpoints into junction nodes
    snapped: dict[tuple, str] = {}
    junction_coords: dict[str, tuple[float, float]] = {}

    def get_junction(lat: float, lon: float) -> str:
        key = snap_coord(lat, lon, GAS_SNAP_DEG)
        if key not in snapped:
            jid = f"gas_j{len(snapped)}"
            snapped[key] = jid
            junction_coords[jid] = (round(lat, 6), round(lon, 6))
        return snapped[key]

    pipeline_edges: list[dict] = []
    seen_pairs: set[frozenset] = set()

    for start, end, edge_attrs in pipeline_edges_raw:
        src = get_junction(start[0], start[1])
        tgt = get_junction(end[0], end[1])
        if src == tgt:
            continue
        pair = frozenset([src, tgt])
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        pipeline_edges.append({"source": src, "target": tgt, "label": "gas_pipeline", **edge_attrs})

    junction_nodes: list[dict] = []
    for jid, (lat, lon) in junction_coords.items():
        junction_nodes.append({
            "id": jid,
            "type": "gas_junction",
            "label": f"Gas junction {jid[6:]}",
            "operator": "Gasunie",
            "latitude": lat,
            "longitude": lon,
        })

    return junction_nodes, pipeline_edges


# ──────────────────────────── Edge builders ──────────────────────────────────


def build_transmission_edges(
    features: list[dict],
    substation_nodes: list[dict],
    label: str,
    max_match_km: float = 2.5,
    seen: set[frozenset] | None = None,
) -> list[dict]:
    """
    Match each polyline's start/end endpoints to the nearest substation.
    Creates an edge if both endpoints snap within max_match_km.

    Pass a shared ``seen`` set across multiple calls to deduplicate pairs
    across edge types (e.g. overhead + underground on the same substation pair).
    """
    if not features or not substation_nodes:
        return []

    sub_lats = [n["latitude"] for n in substation_nodes]
    sub_lons = [n["longitude"] for n in substation_nodes]
    sub_ids = [n["id"] for n in substation_nodes]

    def nearest_sub(lat: float, lon: float) -> tuple[str, float]:
        best_id, best_dist = "", float("inf")
        for i, (slat, slon) in enumerate(zip(sub_lats, sub_lons)):
            d = haversine_km(lat, lon, slat, slon)
            if d < best_dist:
                best_dist, best_id = d, sub_ids[i]
        return best_id, best_dist

    edges: list[dict] = []
    if seen is None:
        seen = set()

    for feat in features:
        geom = feat.get("geometry", {})
        paths = geom.get("paths", [])
        endpoints = polyline_endpoints(paths)
        if endpoints is None:
            continue

        start, end = endpoints
        src_id, src_dist = nearest_sub(start[0], start[1])
        tgt_id, tgt_dist = nearest_sub(end[0], end[1])

        if src_dist > max_match_km or tgt_dist > max_match_km:
            continue
        if src_id == tgt_id:
            continue

        pair = frozenset([src_id, tgt_id])
        if pair in seen:
            continue
        seen.add(pair)

        attrs = feat.get("attributes", {})
        edge: dict = {"source": src_id, "target": tgt_id, "label": label}

        voltage = attrs.get("se_fld39_spanningsniveau") or attrs.get("spanningsniveau")
        if voltage is not None:
            edge["voltage_kv"] = float(voltage)

        raw_status = (attrs.get("status") or "").strip()
        if raw_status:
            edge["status"] = translate_status(raw_status)

        yr = esri_ms_to_year(attrs.get("se_fld6_bouwjaar"))
        if yr:
            edge["year_built"] = yr

        edges.append(edge)

    return edges


def build_feeds_into_edges(
    generator_nodes: list[dict],
    substation_nodes: list[dict],
    max_km: float,
) -> list[dict]:
    """Connect each generator to its nearest substation within max_km."""
    if not generator_nodes or not substation_nodes:
        return []

    sub_lats = [n["latitude"] for n in substation_nodes]
    sub_lons = [n["longitude"] for n in substation_nodes]
    sub_ids = [n["id"] for n in substation_nodes]

    edges: list[dict] = []
    for gen in generator_nodes:
        best_id, best_dist = "", float("inf")
        for i, (slat, slon) in enumerate(zip(sub_lats, sub_lons)):
            d = haversine_km(gen["latitude"], gen["longitude"], slat, slon)
            if d < best_dist:
                best_dist, best_id = d, sub_ids[i]
        if best_dist <= max_km and best_id:
            edges.append({
                "source": gen["id"],
                "target": best_id,
                "label": "feeds_into",
                "distance_km": round(best_dist, 2),
            })

    return edges


# ────────────────────────────────── Main ─────────────────────────────────────


def main() -> None:
    print("Noord-Holland Energy Infrastructure (Atlas NH Energie)")
    print("=" * 60)

    all_nodes: list[dict] = []
    all_edges: list[dict] = []
    substation_nodes: list[dict] = []
    generator_nodes: list[dict] = []

    # ── TenneT substations (polygon) ──
    print("\n[1/7] TenneT HV substations (layer 5)…")
    feats = fetch_layer(5)
    if feats is not None:
        subs = build_substation_nodes(feats)
        substation_nodes.extend(subs)
        all_nodes.extend(subs)
        print(f"  {len(subs)} substations")
    else:
        print("  Skipped (layer unavailable)")

    # ── Wind turbines (point) ──
    print("\n[2/7] Wind turbines (layer 14)…")
    feats = fetch_layer(14)
    if feats is not None:
        turbines = build_wind_turbine_nodes(feats)
        generator_nodes.extend(turbines)
        all_nodes.extend(turbines)
        print(f"  {len(turbines)} wind turbines")
    else:
        print("  Skipped (layer unavailable)")

    # ── Solar parks (polygon) ──
    print("\n[3/7] Solar parks (layer 17)…")
    feats = fetch_layer(17)
    if feats is not None:
        solar = build_solar_park_nodes(feats)
        generator_nodes.extend(solar)
        all_nodes.extend(solar)
        print(f"  {len(solar)} solar parks")
    else:
        print("  Skipped (layer unavailable)")

    # ── Gasunie gas transport network ──
    print("\n[4/7] Gasunie transport pipelines (layer 10)…")
    feats = fetch_layer(
        10,
        out_fields="objectid,naam_leid,eigenaar,type_leid,dom_diam,max_werkdr,dom_mat,jr_in_gebr,aard_risic",
    )
    if feats is not None:
        gas_nodes, gas_edges = build_gas_network(feats)
        all_nodes.extend(gas_nodes)
        all_edges.extend(gas_edges)
        print(f"  {len(gas_nodes)} gas junctions, {len(gas_edges)} pipeline edges")
    else:
        print("  Skipped (layer unavailable)")

    # ── TenneT underground HV cables ──
    print("\n[5/7] TenneT underground HV cables (layer 40)…")
    hv_seen: set[frozenset] = set()  # shared across both HV layers to avoid parallel edges
    feats = fetch_layer(40)
    if feats is not None and substation_nodes:
        edges = build_transmission_edges(feats, substation_nodes, "hv_underground_cable", seen=hv_seen)
        all_edges.extend(edges)
        print(f"  {len(edges)} underground cable connections")
    else:
        print("  Skipped")

    # ── TenneT overhead HV lines ──
    print("\n[6/7] TenneT overhead HV lines (layer 39)…")
    feats = fetch_layer(39)
    if feats is not None and substation_nodes:
        edges = build_transmission_edges(feats, substation_nodes, "hv_overhead_line", seen=hv_seen)
        all_edges.extend(edges)
        print(f"  {len(edges)} overhead line connections")
    else:
        print("  Skipped")

    # ── Feeds-into: generators → substations ──
    print("\n[7/7] Connecting generators to nearest substation…")
    if generator_nodes and substation_nodes:
        fi = build_feeds_into_edges(generator_nodes, substation_nodes, FEEDS_INTO_MAX_KM)
        all_edges.extend(fi)
        print(f"  {len(fi)} feeds_into connections")
    else:
        print("  Skipped (no generators or substations to connect)")

    if not all_nodes:
        print("\nERROR: No nodes collected — aborting.")
        sys.exit(1)

    connected_ids: set[str] = set()
    for e in all_edges:
        connected_ids.add(e["source"])
        connected_ids.add(e["target"])

    isolated = [n for n in all_nodes if n["id"] not in connected_ids]
    if isolated:
        iso_types = dict(Counter(n["type"] for n in isolated))
        print(f"\nRemoving {len(isolated)} isolated nodes (no edges): {iso_types}")
        all_nodes = [n for n in all_nodes if n["id"] in connected_ids]

    node_types = dict(Counter(n["type"] for n in all_nodes))
    edge_types = dict(Counter(e["label"] for e in all_edges))

    graph_data = {
        "nodes": all_nodes,
        "links": all_edges,
        "metadata": {
            "name": "Noord-Holland Energy Infrastructure (TenneT / Gasunie / RVO)",
            "description": (
                f"Noord-Holland energy infrastructure with {len(all_nodes)} nodes and "
                f"{len(all_edges)} edges. Includes TenneT HV substations connected by "
                "overhead lines and underground cables, wind turbines and solar parks "
                "connected to their nearest substation, and a Gasunie high-pressure gas "
                "pipeline network with derived junction nodes. "
                "All coordinates in WGS84; attributes translated to English."
            ),
            "sources": [
                "Atlas NH Energie — Province of Noord-Holland",
                "https://geoservices.noord-holland.nl/ags/rest/services/"
                "thematische_services/atlasNH_Energie/MapServer",
            ],
            "node_count": len(all_nodes),
            "edge_count": len(all_edges),
            "node_types": node_types,
            "edge_types": edge_types,
        },
    }

    output_path = DATA_DIR / "tennet_nh_energy.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(graph_data, f, indent=2, ensure_ascii=False)

    print(f"\nDataset saved to: {output_path}")
    print(f"  Nodes : {len(all_nodes)}  {node_types}")
    print(f"  Edges : {len(all_edges)}  {edge_types}")


if __name__ == "__main__":
    main()
