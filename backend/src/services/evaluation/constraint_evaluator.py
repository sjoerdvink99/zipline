"""Constraint evaluation service for path queries and hop constraints."""

from __future__ import annotations

from typing import Any

import networkx as nx

from models import HopConstraint


def evaluate_constraint(value: Any, constraint: HopConstraint) -> bool:
    """Evaluate a single constraint against a value.

    Args:
        value: The value to test against the constraint
        constraint: The constraint specification

    Returns:
        True if the value satisfies the constraint, False otherwise
    """
    if value is None:
        return False

    try:
        op = constraint.operator
        target_val = constraint.value

        if op in (">", "<", ">=", "<=", "between"):
            try:
                num_value = float(value)
                num_target = float(target_val)
            except (ValueError, TypeError):
                return False

            if op == ">":
                return num_value > num_target
            elif op == "<":
                return num_value < num_target
            elif op == ">=":
                return num_value >= num_target
            elif op == "<=":
                return num_value <= num_target
            elif op == "between":
                val2 = constraint.value2
                if val2 is None:
                    return False
                return num_target <= num_value <= val2

        if op == "=":
            return str(value) == str(target_val)
        elif op == "!=":
            return str(value) != str(target_val)

        if op == "in":
            if isinstance(target_val, str):
                target_list = [s.strip() for s in target_val.split(",")]
            else:
                target_list = [str(target_val)]
            return str(value) in target_list

        return False
    except Exception:
        return False


def check_path_constraints(
    G: nx.Graph, path: list[str], constraints: list[HopConstraint], combine_op: str
) -> bool:
    """Check if a path satisfies the given constraints.

    Args:
        G: NetworkX graph
        path: List of node IDs representing the path
        constraints: List of hop constraints to check
        combine_op: How to combine constraint results ('intersection', 'union', 'difference')

    Returns:
        True if the path satisfies all constraints according to combine_op
    """
    if not constraints:
        return True

    results = []

    for constraint in constraints:
        hop_idx = constraint.hop_index
        target_type = constraint.target

        if target_type == "node":
            if hop_idx == "any":
                nodes_to_check = path
            else:
                idx = int(hop_idx)
                if idx < 0 or idx >= len(path):
                    results.append(False)
                    continue
                nodes_to_check = [path[idx]]

            node_results = []
            for node_id in nodes_to_check:
                node_attrs = G.nodes.get(node_id, {})
                attr_value = node_attrs.get(constraint.attribute)
                node_results.append(evaluate_constraint(attr_value, constraint))

            if hop_idx == "any":
                results.append(any(node_results) if node_results else False)
            else:
                results.append(all(node_results) if node_results else False)

        elif target_type == "edge":
            path_edges = [(path[i], path[i + 1]) for i in range(len(path) - 1)]

            if hop_idx == "any":
                edges_to_check = path_edges
            else:
                idx = int(hop_idx) - 1
                if idx < 0 or idx >= len(path_edges):
                    results.append(False)
                    continue
                edges_to_check = [path_edges[idx]]

            edge_results = []
            for u, v in edges_to_check:
                edge_data = G.get_edge_data(u, v) or {}
                attr_value = edge_data.get(constraint.attribute)
                edge_results.append(evaluate_constraint(attr_value, constraint))

            if hop_idx == "any":
                results.append(any(edge_results) if edge_results else False)
            else:
                results.append(all(edge_results) if edge_results else False)

    if combine_op == "union":
        return any(results) if results else True
    elif combine_op == "difference":
        if len(results) < 2:
            return results[0] if results else True
        return results[0] and not any(results[1:])
    else:  # intersection
        return all(results) if results else True


def validate_neighbor_constraint(
    G: nx.Graph, node_ids: list[str], attribute: str, operator: str, value: str
) -> dict[str, Any]:
    """Validate a constraint against neighbors of given nodes.

    Args:
        G: NetworkX graph
        node_ids: List of node IDs to check neighbors of
        attribute: Attribute to check on neighbors
        operator: Comparison operator ('=', '!=', '>', '>=', '<', '<=')
        value: Value to compare against

    Returns:
        Dictionary with validation results
    """
    if not node_ids:
        return {"valid": False, "matching_neighbors": 0, "error": "No target nodes"}

    matching_neighbors = 0
    all_neighbors = set()

    # Collect all neighbors
    for node_id in node_ids:
        if node_id in G.nodes:
            all_neighbors.update(G.neighbors(node_id))

    try:
        # Check each neighbor against the constraint
        for neighbor in all_neighbors:
            if neighbor in G.nodes:
                node_attrs = dict(G.nodes[neighbor])
                if attribute in node_attrs:
                    attr_value = node_attrs[attribute]

                    if operator == "=":
                        if str(attr_value) == str(value):
                            matching_neighbors += 1
                    elif operator == "!=":
                        if str(attr_value) != str(value):
                            matching_neighbors += 1
                    elif operator in [">", ">=", "<", "<="]:
                        try:
                            attr_num = float(attr_value)
                            val_num = float(value)
                            if operator == ">" and attr_num > val_num:
                                matching_neighbors += 1
                            elif operator == ">=" and attr_num >= val_num:
                                matching_neighbors += 1
                            elif operator == "<" and attr_num < val_num:
                                matching_neighbors += 1
                            elif operator == "<=" and attr_num <= val_num:
                                matching_neighbors += 1
                        except ValueError:
                            continue

        return {
            "valid": matching_neighbors > 0,
            "matching_neighbors": matching_neighbors,
            "total_neighbors": len(all_neighbors),
            "will_have_results": matching_neighbors > 0,
        }

    except Exception as e:
        return {"valid": False, "matching_neighbors": 0, "error": str(e)}
