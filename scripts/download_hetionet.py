#!/usr/bin/env python3
"""
Download the Hetionet dataset.

Hetionet is a biomedical knowledge graph that integrates 47,031 nodes of 11 types
and 2,250,197 edges of 24 types from 29 public databases.

Source: https://github.com/hetio/hetionet
Paper: https://doi.org/10.7554/eLife.26726
"""

import bz2
import json
from pathlib import Path

import requests

URL = "https://github.com/hetio/hetionet/raw/refs/tags/master/hetnet/json/hetionet-v1.0.json.bz2"
OUTPUT_DIR = Path(__file__).parent.parent / "examples"
OUTPUT_FILE = OUTPUT_DIR / "hetionet.json"


def download_hetionet():
    """Download and extract the Hetionet dataset."""
    if OUTPUT_FILE.exists():
        print(f"Hetionet dataset already exists at {OUTPUT_FILE}")
        response = input("Do you want to re-download? [y/N]: ").strip().lower()
        if response != "y":
            print("Skipping download.")
            return

    print(f"Downloading Hetionet from {URL}...")
    print("This may take a minute (~50MB compressed)...")

    response = requests.get(URL, stream=True)
    response.raise_for_status()

    # Get total size for progress
    total_size = int(response.headers.get("content-length", 0))
    downloaded = 0
    chunks = []

    for chunk in response.iter_content(chunk_size=8192):
        chunks.append(chunk)
        downloaded += len(chunk)
        if total_size:
            pct = (downloaded / total_size) * 100
            print(f"\rDownloading: {pct:.1f}% ({downloaded // 1024 // 1024}MB)", end="", flush=True)

    print("\nDecompressing...")

    # Decompress bz2
    compressed_data = b"".join(chunks)
    decompressed_data = bz2.decompress(compressed_data)

    # Parse JSON to validate
    print("Parsing JSON...")
    data = json.loads(decompressed_data.decode("utf-8"))

    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Save to examples directory
    print("Saving...")
    with open(OUTPUT_FILE, "w") as f:
        json.dump(data, f)

    # Print stats
    file_size = OUTPUT_FILE.stat().st_size / (1024 * 1024)
    print(f"\nSaved to: {OUTPUT_FILE}")
    print(f"File size: {file_size:.1f}MB")

    # Quick validation
    n_nodes = len(data.get("nodes", []))
    n_edges = len(data.get("edges", data.get("links", [])))
    print(f"Nodes: {n_nodes:,}")
    print(f"Edges: {n_edges:,}")

    # Show node types if available
    if data.get("nodes"):
        node_kinds = {}
        for node in data["nodes"]:
            if isinstance(node, dict):
                kind = node.get("kind", node.get("type", "unknown"))
            elif isinstance(node, list) and len(node) >= 2:
                attrs = node[1] if isinstance(node[1], dict) else {}
                kind = attrs.get("kind", attrs.get("type", "unknown"))
            else:
                kind = "unknown"
            node_kinds[kind] = node_kinds.get(kind, 0) + 1

        print("\nNode types:")
        for kind, count in sorted(node_kinds.items(), key=lambda x: -x[1])[:10]:
            print(f"  {kind}: {count:,}")

    print("\nHetionet dataset ready!")


if __name__ == "__main__":
    download_hetionet()
