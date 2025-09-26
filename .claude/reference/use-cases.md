# GraphBridge Use Cases

This document describes representative use cases for GraphBridge. It provides contextual grounding for autonomous coding agents by outlining the types of analytical questions, graph schemas, and pattern structures the system is designed to support. Each use case has a dataset that will be used in the showcase section of the publication, so ensure the system is built around these datasets.

## 1. Cybersecurity Risk Analysis

This use case is demonstrated in the publication using the MIT BRON knowledge graph.

Dataset source: https://github.com/ALFA-group/BRON
Dataset location: `data/bron_threat_intel.json`

Cybersecurity analysis often requires understanding how software platforms are connected to vulnerabilities, exploit techniques, and attacker groups. Rather than computing shortest paths, analysts seek to characterize attack-relevant connection structures that support prioritization of security patches and explanation.

Common tasks include:

- Identifying high-severity vulnerabilities affecting a specific platform
- Understanding which exploit techniques target those vulnerabilities
- Determining which attacker groups are associated with those techniques
- Prioritizing patches based on severity, recency, and attacker activity

A typical pattern in GraphBridge:

- Select a platform of interest
- Constrain neighboring vulnerabilities by severity or recency
- Constrain further neighbors by exploit techniques and attacker groups

The result is a bounded, multi-hop relational pattern that captures an attack-relevant structure rather than an arbitrary path.

## 2. Drug Repurposing Analysis

This use case is demonstrated in the publication using the PrimeKG knowledge graph.

Dataset source: https://github.com/mims-harvard/PrimeKG
Dataset location: `data/primekg_drug_repurposing.json`

Drug repurposing seeks to identify existing therapeutics that may be effective for diseases beyond their original indication. Analysts focus on biologically plausible mechanisms linking diseases and drugs, rather than enumerating all possible connections.

Common tasks include:

- Identifying drugs connected to a disease via known biomarkers or targets
- Comparing candidate drugs by the number or type of supporting mechanisms
- Prioritizing candidates for further experimental validation

A typical pattern in GraphBridge:

- Start from a disease node
- Traverse to associated biomarkers or genes
- Constrain those entities to connect to known drug targets
- Optionally restrict drugs by approval status or specificity

These patterns encode explicit hypotheses about how a drug may influence disease-relevant biological processes.

These two use cases provide comprehensive coverage of GraphBridge's cross-space predicate capabilities across cybersecurity and biomedical domains, demonstrating the system's versatility for IEEE VIS publication.
