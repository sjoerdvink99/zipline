#!/usr/bin/env python3
"""
Download the BRON (Linked Threat Intelligence) dataset.

BRON links CVE vulnerabilities to CWE weaknesses, CAPEC attack patterns,
and MITRE ATT&CK techniques/tactics.

Source: https://data.mendeley.com/datasets/s2sw4ck42n/1
Paper: https://arxiv.org/abs/2010.00533
"""

import io
import json
import zipfile
from pathlib import Path

import requests

URL = "https://prod-dcd-datasets-cache-zipfiles.s3.eu-west-1.amazonaws.com/s2sw4ck42n-1.zip"
OUTPUT_DIR = Path(__file__).parent.parent / "examples"
OUTPUT_FILE = OUTPUT_DIR / "BRON.json"


def download_bron():
    """Download and extract the BRON dataset."""
    if OUTPUT_FILE.exists():
        print(f"BRON dataset already exists at {OUTPUT_FILE}")
        response = input("Do you want to re-download? [y/N]: ").strip().lower()
        if response != "y":
            print("Skipping download.")
            return

    print(f"Downloading BRON dataset from {URL}...")
    print("This may take a few minutes (~60MB compressed)...")

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

    print("\nExtracting...")

    # Extract the zip file
    zip_data = b"".join(chunks)
    with zipfile.ZipFile(io.BytesIO(zip_data)) as zf:
        # List contents
        file_list = zf.namelist()
        print(f"Archive contains: {file_list}")

        # Find the JSON file (BRON graph data)
        json_files = [f for f in file_list if f.endswith(".json")]
        if not json_files:
            raise ValueError("No JSON file found in archive")

        # Look for the main BRON graph file
        bron_file = None
        for f in json_files:
            if "BRON" in f.upper() or "graph" in f.lower():
                bron_file = f
                break

        if not bron_file:
            # Just use the first JSON file
            bron_file = json_files[0]

        print(f"Extracting {bron_file}...")

        # Read and save
        with zf.open(bron_file) as src:
            data = json.load(src)

        # Ensure output directory exists
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        # Save to examples directory
        with open(OUTPUT_FILE, "w") as f:
            json.dump(data, f)

    # Print stats
    file_size = OUTPUT_FILE.stat().st_size / (1024 * 1024)
    print(f"\nSaved to: {OUTPUT_FILE}")
    print(f"File size: {file_size:.1f}MB")

    # Quick validation
    with open(OUTPUT_FILE) as f:
        data = json.load(f)

    n_nodes = len(data.get("nodes", []))
    n_edges = len(data.get("edges", data.get("links", [])))
    print(f"Nodes: {n_nodes:,}")
    print(f"Edges: {n_edges:,}")
    print("\nBRON dataset ready!")


if __name__ == "__main__":
    download_bron()
