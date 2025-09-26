import json
import requests
from pathlib import Path
from collections import defaultdict
from datetime import datetime


def download_mitre_attack():
    url = "https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json"
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    return response.json()


def extract_mitre_id(obj):
    for ref in obj.get('external_references', []):
        if ref.get('source_name') == 'mitre-attack':
            return ref.get('external_id')
    return None


def extract_tactics(obj):
    tactics = []
    for phase in obj.get('kill_chain_phases', []):
        if phase.get('kill_chain_name') == 'mitre-attack':
            tactics.append(phase.get('phase_name', ''))
    return tactics


def process_attack_pattern(obj, id_mapping):
    if obj.get('revoked', False) or obj.get('x_mitre_deprecated', False):
        return None

    mitre_id = extract_mitre_id(obj)
    if not mitre_id:
        return None

    node_id = f"technique_{mitre_id}"
    id_mapping[obj['id']] = node_id

    return {
        'id': node_id,
        'label': f"{mitre_id}: {obj.get('name', 'Unknown')}",
        'type': 'technique',
        'mitre_id': mitre_id,
        'name': obj.get('name', 'Unknown'),
        'description': obj.get('description', ''),
        'tactics': extract_tactics(obj),
        'platforms': obj.get('x_mitre_platforms', []),
        'is_subtechnique': obj.get('x_mitre_is_subtechnique', False),
        'created': obj.get('created', ''),
        'modified': obj.get('modified', '')
    }


def process_intrusion_set(obj, id_mapping):
    if obj.get('revoked', False) or obj.get('x_mitre_deprecated', False):
        return None

    mitre_id = extract_mitre_id(obj)
    if not mitre_id:
        return None

    node_id = f"apt_{mitre_id}"
    id_mapping[obj['id']] = node_id

    return {
        'id': node_id,
        'label': obj.get('name', 'Unknown Group'),
        'type': 'apt_group',
        'mitre_id': mitre_id,
        'name': obj.get('name', 'Unknown Group'),
        'description': obj.get('description', ''),
        'aliases': obj.get('aliases', []),
        'created': obj.get('created', ''),
        'modified': obj.get('modified', '')
    }


def process_malware_or_tool(obj, id_mapping):
    if obj.get('revoked', False) or obj.get('x_mitre_deprecated', False):
        return None

    mitre_id = extract_mitre_id(obj)
    if not mitre_id:
        return None

    software_type = obj['type']
    node_id = f"{software_type}_{mitre_id}"
    id_mapping[obj['id']] = node_id

    return {
        'id': node_id,
        'label': obj.get('name', 'Unknown Software'),
        'type': software_type,
        'mitre_id': mitre_id,
        'name': obj.get('name', 'Unknown Software'),
        'description': obj.get('description', ''),
        'software_category': software_type,
        'platforms': obj.get('x_mitre_platforms', []),
        'aliases': obj.get('x_mitre_aliases', []),
        'labels': obj.get('labels', []),
        'created': obj.get('created', ''),
        'modified': obj.get('modified', '')
    }


def process_mitigation(obj, id_mapping):
    if obj.get('revoked', False) or obj.get('x_mitre_deprecated', False):
        return None

    mitre_id = extract_mitre_id(obj)
    if not mitre_id:
        return None

    node_id = f"mitigation_{mitre_id}"
    id_mapping[obj['id']] = node_id

    return {
        'id': node_id,
        'label': f"{mitre_id}: {obj.get('name', 'Unknown')}",
        'type': 'mitigation',
        'mitre_id': mitre_id,
        'name': obj.get('name', 'Unknown'),
        'description': obj.get('description', ''),
        'created': obj.get('created', ''),
        'modified': obj.get('modified', '')
    }


def process_campaign(obj, id_mapping):
    if obj.get('revoked', False) or obj.get('x_mitre_deprecated', False):
        return None

    mitre_id = extract_mitre_id(obj)
    if not mitre_id:
        return None

    node_id = f"campaign_{mitre_id}"
    id_mapping[obj['id']] = node_id

    return {
        'id': node_id,
        'label': obj.get('name', 'Unknown Campaign'),
        'type': 'campaign',
        'mitre_id': mitre_id,
        'name': obj.get('name', 'Unknown Campaign'),
        'description': obj.get('description', ''),
        'aliases': obj.get('aliases', []),
        'first_seen': obj.get('first_seen', ''),
        'last_seen': obj.get('last_seen', ''),
        'created': obj.get('created', ''),
        'modified': obj.get('modified', '')
    }


def process_relationship(obj, id_mapping):
    if obj.get('revoked', False):
        return None

    source_id = obj.get('source_ref')
    target_id = obj.get('target_ref')

    source_node = id_mapping.get(source_id)
    target_node = id_mapping.get(target_id)

    if not source_node or not target_node or source_node == target_node:
        return None

    return {
        'source': source_node,
        'target': target_node,
        'label': obj.get('relationship_type', 'related'),
        'relationship_type': obj.get('relationship_type', 'related'),
        'description': obj.get('description', ''),
        'created': obj.get('created', '')
    }


def create_mitre_attack_dataset():
    attack_data = download_mitre_attack()

    objects_by_type = defaultdict(list)
    for obj in attack_data['objects']:
        objects_by_type[obj['type']].append(obj)

    nodes = []
    id_mapping = {}

    processors = {
        'attack-pattern': process_attack_pattern,
        'intrusion-set': process_intrusion_set,
        'malware': process_malware_or_tool,
        'tool': process_malware_or_tool,
        'course-of-action': process_mitigation,
        'campaign': process_campaign
    }

    for obj_type, processor in processors.items():
        for obj in objects_by_type.get(obj_type, []):
            node = processor(obj, id_mapping)
            if node:
                nodes.append(node)

    relationships = []
    for rel_obj in objects_by_type.get('relationship', []):
        relationship = process_relationship(rel_obj, id_mapping)
        if relationship:
            relationships.append(relationship)

    return nodes, relationships


def create_dataset_metadata(nodes, relationships):
    node_counts = defaultdict(int)
    for node in nodes:
        node_counts[node['type']] += 1

    return {
        "name": "MITRE ATT&CK Enterprise Dataset",
        "description": "Pure MITRE ATT&CK Enterprise framework data with techniques, threat actors, malware, tools, mitigations, and campaigns",
        "domain": "cybersecurity",
        "source": "mitre_attack_enterprise",
        "node_count": len(nodes),
        "edge_count": len(relationships),
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "data_sources": ["MITRE ATT&CK Enterprise Framework"],
        "schema_version": "2.0",
        "node_distribution": dict(node_counts),
        "representational_spaces": {
            "topology": "APT group attack chains, malware-technique relationships, and mitigation coverage patterns",
            "attributes": "Platform targeting, tactic classifications, temporal intelligence, and threat actor aliases",
            "patterns": "Real-world APT behaviors, campaign structures, and defensive countermeasure networks"
        }
    }


def main():
    try:
        nodes, relationships = create_mitre_attack_dataset()
        metadata = create_dataset_metadata(nodes, relationships)

        dataset = {
            "nodes": nodes,
            "links": relationships,
            "metadata": metadata
        }

        output_file = Path(__file__).parent.parent / "data" / "bron_threat_intel.json"
        output_file.parent.mkdir(parents=True, exist_ok=True)

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(dataset, f, indent=2, ensure_ascii=False)

        print(f"Dataset created: {len(nodes)} nodes, {len(relationships)} relationships")
        print(f"Output: {output_file}")

        return dataset

    except Exception as e:
        print(f"Error: {e}")
        raise


if __name__ == "__main__":
    main()
