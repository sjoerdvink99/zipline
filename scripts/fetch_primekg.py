

import json
import sys
from pathlib import Path
from typing import Dict, List, Any, Set
import pandas as pd
import networkx as nx
import requests
from collections import Counter

PROJECT_ROOT = Path(__file__).parent.parent
sys.path.append(str(PROJECT_ROOT / "backend" / "src"))
def download_primekg_data() -> pd.DataFrame:
    print("Downloading PrimeKG knowledge graph from Harvard Dataverse...")

    url = "https://dataverse.harvard.edu/api/access/datafile/6180620"

    try:
        response = requests.get(url, stream=True, timeout=300)
        response.raise_for_status()

        kg_path = PROJECT_ROOT / "data" / "kg_primekg_raw.csv"
        kg_path.parent.mkdir(parents=True, exist_ok=True)
        print(f"Saving raw data to {kg_path}")
        with open(kg_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        print("Loading CSV data...")
        df = pd.read_csv(kg_path, low_memory=False)
        print(f"Loaded {len(df)} edges from PrimeKG")
        return df
    except Exception as e:
        print(f"Error downloading PrimeKG data: {e}")
        print("Falling back to existing data if available...")

        kg_path = PROJECT_ROOT / "data" / "kg_primekg_raw.csv"
        if kg_path.exists():
            return pd.read_csv(kg_path, low_memory=False)
        else:
            raise
def create_cancer_focused_subset(df: pd.DataFrame) -> pd.DataFrame:
    print("Creating cancer-focused subset with all 10 node types...")

    # Step 1: Identify cancer-related diseases
    cancer_keywords = ['cancer', 'carcinoma', 'tumor', 'tumour', 'oncology', 'malignant',
                      'neoplasm', 'lymphoma', 'leukemia', 'sarcoma', 'melanoma', 'glioma']

    cancer_pattern = '|'.join(cancer_keywords)
    cancer_diseases = df[
        (df['x_type'] == 'disease') &
        df['x_name'].str.contains(cancer_pattern, na=False, regex=True, case=False)
    ]['x_id'].tolist()

    cancer_diseases += df[
        (df['y_type'] == 'disease') &
        df['y_name'].str.contains(cancer_pattern, na=False, regex=True, case=False)
    ]['y_id'].tolist()

    cancer_diseases = list(set(cancer_diseases))[:200]  # Limit to top 200 cancer diseases
    print(f"Identified {len(cancer_diseases)} cancer-related diseases")

    # Step 2: Get all edges connected to cancer diseases (1-hop)
    cancer_related_edges = df[
        (df['x_id'].isin(cancer_diseases)) |
        (df['y_id'].isin(cancer_diseases))
    ].copy()

    # Step 3: Collect all nodes connected to cancer diseases
    connected_nodes = set(cancer_related_edges['x_id'].tolist() + cancer_related_edges['y_id'].tolist())

    # Step 4: For each node type, ensure representation with cancer relevance
    target_per_type = {
        'disease': 200,      # Cancer diseases + related diseases
        'drug': 300,         # Cancer drugs + related drugs
        'gene/protein': 800, # Cancer-related genes/proteins
        'effect/phenotype': 200,  # Cancer phenotypes/side effects
        'anatomy': 150,      # Affected anatomical structures
        'biological_process': 200,  # Cancer-related processes
        'pathway': 150,      # Cancer pathways
        'molecular_function': 150,  # Related molecular functions
        'cellular_component': 150,  # Related cellular components
        'exposure': 100      # Environmental/chemical exposures
    }

    selected_nodes_by_type = {}

    # Get nodes of each type that are connected to cancer (more efficiently)
    for node_type in target_per_type.keys():
        # Get cancer-connected nodes of this type
        type_nodes_x = cancer_related_edges[cancer_related_edges['x_type'] == node_type]['x_id'].unique()
        type_nodes_y = cancer_related_edges[cancer_related_edges['y_type'] == node_type]['y_id'].unique()
        type_nodes_in_cancer = list(set(list(type_nodes_x) + list(type_nodes_y)))

        # If we don't have enough cancer-connected nodes, sample more from the full dataset
        if len(type_nodes_in_cancer) < target_per_type[node_type]:
            additional_nodes_x = df[df['x_type'] == node_type]['x_id'].drop_duplicates()
            additional_nodes_y = df[df['y_type'] == node_type]['y_id'].drop_duplicates()
            all_type_nodes = list(set(list(additional_nodes_x) + list(additional_nodes_y)))

            # Remove already selected nodes
            remaining_nodes = [n for n in all_type_nodes if n not in type_nodes_in_cancer]
            needed = target_per_type[node_type] - len(type_nodes_in_cancer)
            type_nodes_in_cancer.extend(remaining_nodes[:needed])

        # Limit to target size
        selected_nodes_by_type[node_type] = type_nodes_in_cancer[:target_per_type[node_type]]
        print(f"Selected {len(selected_nodes_by_type[node_type])} nodes of type '{node_type}'")

    # Step 5: Combine all selected nodes
    all_selected_nodes = set()
    for nodes in selected_nodes_by_type.values():
        all_selected_nodes.update(nodes)

    print(f"Total selected nodes: {len(all_selected_nodes)} (target: <2500)")

    # Step 6: Filter edges to only include selected nodes
    final_subset = df[
        (df['x_id'].isin(all_selected_nodes)) &
        (df['y_id'].isin(all_selected_nodes))
    ].copy()

    print(f"Created cancer-focused subset with {len(final_subset)} edges")
    return final_subset
def convert_to_graphbridge_format(df: pd.DataFrame) -> Dict[str, Any]:
    print("Converting to GraphBridge format...")

    nodes_dict = {}
    for idx, row in df.iterrows():
        if pd.notna(row['x_id']) and row['x_id'] not in nodes_dict:
            nodes_dict[row['x_id']] = {
                'id': str(row['x_id']),
                'label': str(row['x_name']) if pd.notna(row['x_name']) else str(row['x_id']),
                'type': str(row['x_type']) if pd.notna(row['x_type']) else 'entity',
                'node_source': str(row['x_source']) if pd.notna(row['x_source']) else 'unknown'
            }
    for idx, row in df.iterrows():
        if pd.notna(row['y_id']) and row['y_id'] not in nodes_dict:
            nodes_dict[row['y_id']] = {
                'id': str(row['y_id']),
                'label': str(row['y_name']) if pd.notna(row['y_name']) else str(row['y_id']),
                'type': str(row['y_type']) if pd.notna(row['y_type']) else 'entity',
                'node_source': str(row['y_source']) if pd.notna(row['y_source']) else 'unknown'
            }

    edges = []
    for idx, row in df.iterrows():
        if pd.notna(row['x_id']) and pd.notna(row['y_id']):
            edge = {
                'source': str(row['x_id']),
                'target': str(row['y_id']),
                'label': str(row['relation']) if pd.notna(row['relation']) else 'relationship'
            }
            if pd.notna(row.get('evidence')):
                edge['evidence'] = str(row['evidence'])

            edges.append(edge)

    nodes_list = list(nodes_dict.values())
    for i, node in enumerate(nodes_list):
        node['node_index'] = i

    node_type_counts = Counter(node['type'] for node in nodes_list)
    edge_type_counts = Counter(edge['label'] for edge in edges)

    metadata = {
        'name': 'PrimeKG Cancer-Focused Network',
        'description': 'Comprehensive cancer-focused biomedical knowledge graph with all 10 PrimeKG node types for cross-space predicate demonstration',
        'source': 'PrimeKG (Harvard Medical School)',
        'url': 'https://github.com/mims-harvard/PrimeKG',
        'data_url': 'https://doi.org/10.7910/DVN/IXA7BM',
        'focus': 'Cancer and related biomedical entities',
        'node_count': len(nodes_list),
        'edge_count': len(edges),
        'node_types': dict(node_type_counts),
        'relationship_types': dict(edge_type_counts),
        'representational_spaces': {
            'topology': 'Cancer-focused multi-scale biomedical network with diverse entity relationships',
            'attributes': 'Cancer drugs, affected anatomy, molecular processes, pathways, exposures, and phenotypes',
            'patterns': 'Cancer treatment patterns, disease mechanisms, drug-target interactions, and biological pathways'
        }
    }
    return {
        'nodes': nodes_list,
        'links': edges,
        'metadata': metadata
    }
def main():
    print("PrimeKG Dataset Generation for GraphBridge")
    print("=" * 50)

    try:
        df = download_primekg_data()
        print(f"Original dataset: {len(df)} relationships")
        print(f"\nRelationship types: {sorted(df['relation'].unique())[:20]}...")
        print(f"Node types (x): {sorted(df['x_type'].unique())}")
        print(f"Node types (y): {sorted(df['y_type'].unique())}")

        subset_df = create_cancer_focused_subset(df)

        graph_data = convert_to_graphbridge_format(subset_df)

        output_path = PROJECT_ROOT / "data" / "primekg_drug_repurposing.json"
        print(f"\nSaving to {output_path}")

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(graph_data, f, indent=2, ensure_ascii=False)

        metadata = graph_data['metadata']
        print(f"\nDataset Summary:")
        print(f"- Nodes: {metadata['node_count']}")
        print(f"- Edges: {metadata['edge_count']}")
        print(f"- Node Types: {list(metadata['node_types'].keys())}")
        print(f"- Relationship Types: {len(metadata['relationship_types'])} types")
        print(f"- Most Common Node Types: {dict(sorted(metadata['node_types'].items(), key=lambda x: x[1], reverse=True)[:5])}")
        print(f"\n✅ PrimeKG cancer-focused dataset created successfully!")
        print(f"Dataset available at: {output_path}")
        print(f"All 10 PrimeKG node types included for rich cross-space predicate demonstration")
    except Exception as e:
        print(f"❌ Error creating PrimeKG dataset: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
if __name__ == "__main__":
    main()
