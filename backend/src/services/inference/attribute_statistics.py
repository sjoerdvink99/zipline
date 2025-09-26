from collections import Counter, defaultdict
from typing import Any

import networkx as nx
import numpy as np

from ..compiler.formal_types import AttributeType
from ..predicates.attribute_predicates import detect_attribute_type


class AttributeStatistics:
    def __init__(self, graph: nx.Graph):
        self.graph = graph
        self.node_count = len(graph.nodes())

        self.categorical_distributions: dict[str, dict[str, int]] = {}
        self.numerical_quartiles: dict[str, dict[str, float]] = {}
        self.array_membership_index: dict[str, dict[str, list[str]]] = {}
        self.boolean_counts: dict[str, dict[bool, int]] = {}
        self.attribute_types: dict[str, AttributeType] = {}

        self._build_attribute_statistics()

    def _build_attribute_statistics(self) -> None:
        all_attributes = set()
        for _node_id, attrs in self.graph.nodes(data=True):
            all_attributes.update(attrs.keys())

        for attr_name in all_attributes:
            if attr_name == "id":
                continue

            values = []
            for _node_id, attrs in self.graph.nodes(data=True):
                if attr_name in attrs:
                    values.append(attrs[attr_name])

            if not values:
                continue

            sample_values = values[:100]
            if sample_values:
                attr_type = self._detect_attribute_type_from_samples(sample_values)
                self.attribute_types[attr_name] = attr_type

                if attr_type == AttributeType.CATEGORICAL:
                    self._build_categorical_stats(attr_name, values)
                elif attr_type == AttributeType.NUMERIC:
                    self._build_numerical_stats(attr_name, values)
                elif attr_type == AttributeType.BOOLEAN:
                    self._build_boolean_stats(attr_name, values)
                elif attr_type == AttributeType.ARRAY:
                    self._build_array_stats(attr_name, values)

    def _detect_attribute_type_from_samples(self, values: list[Any]) -> AttributeType:
        non_none_values = [v for v in values if v is not None]
        if not non_none_values:
            return AttributeType.CATEGORICAL

        sample = non_none_values[:10]
        type_counts = Counter()

        for value in sample:
            type_counts[detect_attribute_type(value)] += 1

        return type_counts.most_common(1)[0][0]

    def _build_categorical_stats(self, attr_name: str, values: list[Any]) -> None:
        distribution = Counter(str(v) for v in values if v is not None)
        self.categorical_distributions[attr_name] = dict(distribution)

    def _build_numerical_stats(self, attr_name: str, values: list[Any]) -> None:
        numeric_values = []
        for v in values:
            if v is not None:
                try:
                    numeric_values.append(float(v))
                except (ValueError, TypeError):
                    continue

        if numeric_values:
            self.numerical_quartiles[attr_name] = {
                "min": np.min(numeric_values),
                "q25": np.percentile(numeric_values, 25),
                "median": np.percentile(numeric_values, 50),
                "q75": np.percentile(numeric_values, 75),
                "max": np.max(numeric_values),
                "mean": np.mean(numeric_values),
                "std": np.std(numeric_values),
            }

    def _build_boolean_stats(self, attr_name: str, values: list[Any]) -> None:
        bool_counter = Counter()
        for v in values:
            if v is not None:
                if isinstance(v, bool):
                    bool_counter[v] += 1
                elif str(v).lower() in ("true", "1", "yes"):
                    bool_counter[True] += 1
                elif str(v).lower() in ("false", "0", "no"):
                    bool_counter[False] += 1

        self.boolean_counts[attr_name] = dict(bool_counter)

    def _build_array_stats(self, attr_name: str, values: list[Any]) -> None:
        membership_index = defaultdict(list)

        for i, (node_id, _) in enumerate(self.graph.nodes(data=True)):
            node_value = values[i] if i < len(values) else None
            if node_value is not None:
                if isinstance(node_value, list | tuple):
                    for item in node_value:
                        membership_index[str(item)].append(node_id)
                else:
                    membership_index[str(node_value)].append(node_id)

        self.array_membership_index[attr_name] = dict(membership_index)

    def get_categorical_coverage(
        self, nodes: list[str], attr: str, value: str
    ) -> float:
        if attr not in self.attribute_types:
            return 0.0

        matching_count = 0
        for node_id in nodes:
            node_attrs = self.graph.nodes[node_id]
            if attr in node_attrs and str(node_attrs[attr]) == value:
                matching_count += 1

        return matching_count / len(nodes) if nodes else 0.0

    def get_array_coverage(self, nodes: list[str], attr: str, member: str) -> float:
        if attr not in self.array_membership_index:
            return 0.0

        member_nodes = set(self.array_membership_index[attr].get(member, []))
        matching_count = sum(1 for node in nodes if node in member_nodes)

        return matching_count / len(nodes) if nodes else 0.0

    def get_numerical_coverage(
        self, nodes: list[str], attr: str, operator: str, threshold: float
    ) -> float:
        if attr not in self.attribute_types:
            return 0.0

        matching_count = 0
        for node_id in nodes:
            node_attrs = self.graph.nodes[node_id]
            if attr in node_attrs:
                try:
                    value = float(node_attrs[attr])
                    if operator == ">=":
                        matches = value >= threshold
                    elif operator == "<=":
                        matches = value <= threshold
                    elif operator == ">":
                        matches = value > threshold
                    elif operator == "<":
                        matches = value < threshold
                    else:
                        matches = False

                    if matches:
                        matching_count += 1
                except (ValueError, TypeError):
                    continue

        return matching_count / len(nodes) if nodes else 0.0
