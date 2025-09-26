from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime
from typing import Any

import networkx as nx


def compute_attribute_distributions(graph: nx.Graph) -> dict[str, Any]:
    if not graph.nodes():
        return {
            "distributions_by_label": {},
            "shared_attributes": {},
            "label_distribution": {
                "type": "categorical",
                "values": [],
                "total_unique": 0,
            },
        }

    nodes_with_attrs = dict(graph.nodes(data=True))
    nodes_by_label: dict[str, list] = defaultdict(list)
    label_counter: Counter = Counter()

    for node_id, attrs in nodes_with_attrs.items():
        label = attrs.get("node_type", attrs.get("type", attrs.get("label", "default")))
        nodes_by_label[label].append(node_id)
        label_counter[label] += 1

    distributions_by_label = {}
    all_attributes: set[str] = set()

    for label, node_ids in nodes_by_label.items():
        label_attributes: dict[str, list] = {}
        for node_id in node_ids:
            attrs = nodes_with_attrs[node_id]
            for attr_name, attr_value in attrs.items():
                if attr_name not in ["node_type", "type", "label"]:
                    if attr_name not in label_attributes:
                        label_attributes[attr_name] = []
                    label_attributes[attr_name].append((node_id, attr_value))
                    all_attributes.add(attr_name)

        attr_distributions = {}
        for attr_name, attr_values in label_attributes.items():
            distribution = compute_single_attribute_distribution(attr_name, attr_values)
            if distribution:
                attr_distributions[attr_name] = distribution

        distributions_by_label[label] = {
            "label_count": len(node_ids),
            "node_ids": node_ids,
            "attributes": attr_distributions,
        }

    shared_attributes = {}
    if len(nodes_by_label) > 1:
        for attr_name in all_attributes:
            labels_with_attr = []
            all_attr_values = []

            for label, node_ids in nodes_by_label.items():
                label_values = []
                for node_id in node_ids:
                    attrs = nodes_with_attrs[node_id]
                    if attr_name in attrs:
                        value = attrs[attr_name]
                        label_values.append((node_id, value))
                        all_attr_values.append((node_id, value))

                if label_values:
                    labels_with_attr.append(label)

            if len(labels_with_attr) > 1 and all_attr_values:
                distribution = compute_single_attribute_distribution(
                    attr_name, all_attr_values
                )
                if distribution:
                    distribution["labels"] = labels_with_attr
                    shared_attributes[attr_name] = distribution

    label_distribution_values = []
    for label, count in label_counter.items():
        label_distribution_values.append(
            {
                "label": label,
                "count": count,
                "node_ids": nodes_by_label[label],
            }
        )

    label_distribution = {
        "type": "categorical",
        "values": sorted(
            label_distribution_values, key=lambda x: x["count"], reverse=True
        ),
        "total_unique": len(label_counter),
    }

    return {
        "distributions_by_label": distributions_by_label,
        "shared_attributes": shared_attributes,
        "label_distribution": label_distribution,
    }


def is_temporal_value(value: Any) -> bool:
    if not isinstance(value, str):
        return False

    if "T" in value:
        try:
            if (
                value.endswith("Z")
                or "+" in value[-6:]
                or value[-6:-3] in ["+00", "-00", "+01", "-01"]
            ):
                datetime.fromisoformat(value.replace("Z", "+00:00"))
                return True
            else:
                datetime.fromisoformat(value)
                return True
        except ValueError:
            pass

    import re

    date_patterns = [
        r"\d{4}-\d{2}-\d{2}",
        r"\d{2}/\d{2}/\d{4}",
        r"\d{2}-\d{2}-\d{4}",
        r"\d{1,2}/\d{1,2}/\d{2,4}",
    ]

    for pattern in date_patterns:
        if re.fullmatch(pattern, value.strip()):
            return True

    return False


def parse_temporal_value(value: str) -> datetime | None:
    try:
        if value.endswith("Z"):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        elif "T" in value:
            return datetime.fromisoformat(value)
        else:
            import re

            if re.match(r"\d{4}-\d{2}-\d{2}", value):
                return datetime.fromisoformat(value)
            elif re.match(r"\d{2}/\d{2}/\d{4}", value):
                return datetime.strptime(value, "%m/%d/%Y")
            elif re.match(r"\d{2}-\d{2}-\d{4}", value):
                return datetime.strptime(value, "%m-%d-%Y")
    except (ValueError, TypeError):
        pass
    return None


def compute_single_attribute_distribution(
    attr_name: str, attr_values: list[tuple]
) -> dict[str, Any] | None:
    if not attr_values:
        return None

    values = [val for _, val in attr_values]
    sample_value = values[0]

    temporal_check_values = values[: min(5, len(values))]
    temporal_count = sum(
        1 for val in temporal_check_values if val is not None and is_temporal_value(val)
    )

    if temporal_count >= len(temporal_check_values) * 0.6:
        return compute_temporal_distribution(attr_name, attr_values)

    if isinstance(sample_value, int | float) and not isinstance(sample_value, bool):
        try:
            numeric_values = [float(v) for v in values if v is not None]
            if not numeric_values:
                return None
            return compute_numeric_distribution(attr_name, attr_values, numeric_values)
        except (ValueError, TypeError):
            pass

    if isinstance(sample_value, bool) or all(
        str(v).lower() in ["true", "false", "1", "0"] for v in values
    ):
        return compute_boolean_distribution(attr_name, attr_values)

    return compute_categorical_distribution(attr_name, attr_values)


def compute_numeric_distribution(
    attr_name: str, attr_values: list[tuple], numeric_values: list[float]
) -> dict[str, Any] | None:
    if len(numeric_values) == 0:
        return None

    min_val = min(numeric_values)
    max_val = max(numeric_values)

    num_bins = min(10, len(set(numeric_values)))
    if num_bins < 2:
        num_bins = 1

    if min_val == max_val:
        bins = [
            {
                "min": min_val,
                "max": max_val,
                "count": len(attr_values),
                "node_ids": [node_id for node_id, _ in attr_values],
            }
        ]
    else:
        bin_width = (max_val - min_val) / num_bins
        bins = []

        for i in range(num_bins):
            bin_min = min_val + i * bin_width
            bin_max = min_val + (i + 1) * bin_width if i < num_bins - 1 else max_val

            bin_node_ids = []
            for node_id, value in attr_values:
                if value is not None:
                    num_val = float(value)
                    if i == num_bins - 1:
                        if bin_min <= num_val <= bin_max:
                            bin_node_ids.append(node_id)
                    else:
                        if bin_min <= num_val < bin_max:
                            bin_node_ids.append(node_id)

            bins.append(
                {
                    "min": bin_min,
                    "max": bin_max,
                    "count": len(bin_node_ids),
                    "node_ids": bin_node_ids,
                }
            )

    return {
        "type": "numeric",
        "min": min_val,
        "max": max_val,
        "bins": bins,
    }


def compute_categorical_distribution(
    attr_name: str, attr_values: list[tuple]
) -> dict[str, Any]:
    value_groups: dict[str, list] = defaultdict(list)

    for node_id, value in attr_values:
        if value is None:
            value_groups["null"].append(node_id)
        elif isinstance(value, list):
            if not value:
                value_groups["[empty array]"].append(node_id)
            else:
                for item in value:
                    if item is not None:
                        str_item = str(item).strip()
                        if str_item:  # Only include non-empty items
                            value_groups[str_item].append(node_id)
                        else:
                            value_groups["[empty string]"].append(node_id)
                    else:
                        value_groups["null"].append(node_id)
        else:
            str_value = str(value).strip()
            if str_value:  # Only include non-empty strings
                value_groups[str_value].append(node_id)
            else:
                value_groups["[empty string]"].append(node_id)

    values = []
    for value, node_ids in value_groups.items():
        values.append(
            {
                "label": value,
                "count": len(node_ids),
                "node_ids": node_ids,
            }
        )

    values.sort(key=lambda x: x["count"], reverse=True)

    return {
        "type": "categorical",
        "values": values,
        "total_unique": len(value_groups),
    }


def compute_temporal_distribution(
    attr_name: str, attr_values: list[tuple]
) -> dict[str, Any] | None:
    if not attr_values:
        return None

    temporal_data = []
    for node_id, value in attr_values:
        if value is None:
            continue
        parsed_dt = parse_temporal_value(str(value))
        if parsed_dt is not None:
            temporal_data.append((node_id, parsed_dt, str(value)))

    if not temporal_data:
        return compute_categorical_distribution(attr_name, attr_values)

    temporal_data.sort(key=lambda x: x[1])

    min_dt = temporal_data[0][1]
    max_dt = temporal_data[-1][1]

    time_range = max_dt - min_dt

    if time_range.days < 1:
        num_bins = min(12, len(temporal_data))
        bin_label = "hours"
    elif time_range.days <= 31:
        num_bins = min(10, time_range.days + 1)
        bin_label = "days"
    elif time_range.days <= 365:
        num_bins = min(12, (time_range.days // 30) + 1)
        bin_label = "months"
    else:
        num_bins = min(10, (time_range.days // 365) + 1)
        bin_label = "years"

    num_bins = max(1, min(num_bins, len({dt for _, dt, _ in temporal_data})))

    if num_bins <= 1 or min_dt == max_dt:
        bins = [
            {
                "min_date": min_dt.isoformat(),
                "max_date": max_dt.isoformat(),
                "label": min_dt.strftime("%Y-%m-%d"),
                "count": len(temporal_data),
                "node_ids": [node_id for node_id, _, _ in temporal_data],
            }
        ]
    else:
        bin_duration = time_range / num_bins
        bins = []

        for i in range(num_bins):
            bin_start = min_dt + (bin_duration * i)
            bin_end = min_dt + (bin_duration * (i + 1)) if i < num_bins - 1 else max_dt

            bin_nodes = []
            for node_id, dt, _ in temporal_data:
                if i == num_bins - 1:
                    if bin_start <= dt <= bin_end:
                        bin_nodes.append(node_id)
                else:
                    if bin_start <= dt < bin_end:
                        bin_nodes.append(node_id)

            if bin_label == "hours":
                label = bin_start.strftime("%H:%M")
            elif bin_label == "days":
                label = bin_start.strftime("%m/%d")
            elif bin_label == "months":
                label = bin_start.strftime("%Y-%m")
            else:
                label = bin_start.strftime("%Y")

            bins.append(
                {
                    "min_date": bin_start.isoformat(),
                    "max_date": bin_end.isoformat(),
                    "label": label,
                    "count": len(bin_nodes),
                    "node_ids": bin_nodes,
                }
            )

    return {
        "type": "temporal",
        "min_date": min_dt.isoformat(),
        "max_date": max_dt.isoformat(),
        "bins": bins,
        "bin_type": bin_label,
    }


def compute_boolean_distribution(
    attr_name: str, attr_values: list[tuple]
) -> dict[str, Any]:
    true_nodes = []
    false_nodes = []

    for node_id, value in attr_values:
        if isinstance(value, bool):
            if value:
                true_nodes.append(node_id)
            else:
                false_nodes.append(node_id)
        else:
            str_val = str(value).lower()
            if str_val in ["true", "1"]:
                true_nodes.append(node_id)
            elif str_val in ["false", "0"]:
                false_nodes.append(node_id)

    values = []
    if true_nodes:
        values.append(
            {
                "label": "true",
                "count": len(true_nodes),
                "node_ids": true_nodes,
            }
        )
    if false_nodes:
        values.append(
            {
                "label": "false",
                "count": len(false_nodes),
                "node_ids": false_nodes,
            }
        )

    values.sort(key=lambda x: x["count"], reverse=True)

    return {
        "type": "boolean",
        "values": values,
    }
