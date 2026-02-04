from __future__ import annotations

import logging

import networkx as nx

logger = logging.getLogger(__name__)


class NodeValidationResult:
    def __init__(
        self,
        valid_nodes: list[str],
        invalid_nodes: list[str],
        mappings_applied: dict[str, str] | None = None,
    ):
        self.valid_nodes = valid_nodes
        self.invalid_nodes = invalid_nodes
        self.mappings_applied = mappings_applied or {}
        self.success = len(valid_nodes) > 0

    @property
    def mapping_count(self) -> int:
        return len(self.mappings_applied)

    @property
    def had_mappings(self) -> bool:
        return self.mapping_count > 0


def validate_and_map_node_ids(
    graph: nx.Graph, node_ids: list[str], context: str = "unknown"
) -> NodeValidationResult:
    if not node_ids:
        return NodeValidationResult([], [])

    graph_nodes = set(graph.nodes())
    valid_direct = [n for n in node_ids if n in graph_nodes]
    invalid_direct = [n for n in node_ids if n not in graph_nodes]

    if not invalid_direct:
        logger.debug(f"All {len(node_ids)} node IDs valid for {context}")
        return NodeValidationResult(valid_direct, [])

    logger.warning(
        f"Node ID mismatch detected in {context} - attempting to find mapping for {len(invalid_direct)} nodes"
    )

    mappings = _find_semantic_to_numeric_mappings(graph, invalid_direct)

    if mappings:
        mapped_nodes = [mappings.get(n, n) for n in invalid_direct]
        valid_mapped = [n for n in mapped_nodes if n in graph_nodes]
        still_invalid = [
            original
            for original, mapped in zip(invalid_direct, mapped_nodes, strict=False)
            if mapped not in graph_nodes
        ]

        final_valid = valid_direct + valid_mapped

        logger.info(
            f"Applied node ID mapping for {context}: {len(mappings)} mappings found, "
            f"{len(valid_mapped)} nodes recovered"
        )

        return NodeValidationResult(final_valid, still_invalid, mappings)

    else:
        logger.error(f"No node ID mapping found for {context}")
        return NodeValidationResult(valid_direct, invalid_direct)


def _find_semantic_to_numeric_mappings(
    graph: nx.Graph, semantic_ids: list[str]
) -> dict[str, str]:
    semantic_to_numeric = {}
    semantic_ids_set = set(semantic_ids)

    id_attributes = ["id", "original_id", "semantic_id", "name", "label"]

    for node_id, node_data in graph.nodes(data=True):
        if not isinstance(node_data, dict):
            continue

        for attr in id_attributes:
            attr_value = node_data.get(attr)
            if attr_value and str(attr_value) in semantic_ids_set:
                semantic_to_numeric[str(attr_value)] = node_id
                break

    return semantic_to_numeric


def validate_single_node_id(
    graph: nx.Graph, node_id: str, context: str = "unknown"
) -> str | None:
    result = validate_and_map_node_ids(graph, [node_id], context)
    return result.valid_nodes[0] if result.valid_nodes else None
