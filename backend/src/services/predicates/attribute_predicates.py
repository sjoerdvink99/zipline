from datetime import datetime
from typing import Any

import networkx as nx

from ..compiler.base_predicates import BasePredicate, NodeTypeConstraint
from ..compiler.formal_types import (
    ArrayOperator,
    AttributeType,
    BooleanOperator,
    CategoricalOperator,
    NumericOperator,
    TemporalOperator,
)


def make_hashable(value: Any) -> Any:
    if isinstance(value, list):
        try:
            if all(isinstance(x, str | int | float | bool | type(None)) for x in value):
                return tuple(sorted(value))
            else:
                return str(sorted(value))
        except (TypeError, ValueError):
            return str(value)
    elif isinstance(value, dict):
        try:
            return tuple(sorted(value.items()))
        except (TypeError, ValueError):
            return str(value)
    return value


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


def detect_attribute_type(value: Any) -> AttributeType:
    if isinstance(value, bool):
        return AttributeType.BOOLEAN
    elif isinstance(value, int | float):
        return AttributeType.NUMERIC
    elif isinstance(value, list | tuple):
        return AttributeType.ARRAY
    elif is_temporal_value(value):
        return AttributeType.TEMPORAL
    else:
        return AttributeType.CATEGORICAL


def normalize_array_value(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    elif isinstance(value, tuple):
        return list(value)
    elif isinstance(value, str):
        if "," in value:
            return [item.strip() for item in value.split(",")]
        return [value]
    else:
        return [value]


class AttributePredicate(BasePredicate):
    def __init__(
        self,
        attribute: str,
        operator: NumericOperator
        | CategoricalOperator
        | BooleanOperator
        | ArrayOperator
        | TemporalOperator,
        value: Any,
        value2: Any | None = None,
        attribute_type: AttributeType = AttributeType.NUMERIC,
        node_types: list | None = None,
        description: str | None = None,
    ):
        self.attribute = attribute
        self.operator = operator
        self.value = value
        self.value2 = value2
        self.attribute_type = attribute_type
        self.node_constraint = NodeTypeConstraint(node_types)

        super().__init__(
            f"attr_{attribute}_{operator.value}_{value}",
            description or self._generate_description(),
        )

    def _generate_description(self) -> str:
        node_type_suffix = ""
        if self.node_constraint.allowed_types:
            node_type_suffix = f" ({', '.join(self.node_constraint.allowed_types)})"

        if self.operator == NumericOperator.BETWEEN:
            return f"{self.attribute} between {self.value} and {self.value2}{node_type_suffix}"
        elif self.operator in [CategoricalOperator.IN, CategoricalOperator.NOT_IN]:
            op_word = "in" if self.operator == CategoricalOperator.IN else "not in"
            return f"{self.attribute} {op_word} {self.value}{node_type_suffix}"
        else:
            return (
                f"{self.attribute} {self.operator.value} {self.value}{node_type_suffix}"
            )

    def evaluate(self, graph: nx.Graph, node_id: str) -> bool:
        if not self.node_constraint.is_applicable(graph, node_id):
            return False

        node_data = graph.nodes[node_id]
        if self.attribute not in node_data:
            return False

        node_value = node_data[self.attribute]

        return self._evaluate_by_type(node_value)

    def _evaluate_by_type(self, node_value: Any) -> bool:
        if self.attribute_type == AttributeType.NUMERIC:
            return self._evaluate_numeric(float(node_value))
        elif self.attribute_type == AttributeType.CATEGORICAL:
            return self._evaluate_categorical(str(node_value))
        elif self.attribute_type == AttributeType.BOOLEAN:
            return self._evaluate_boolean(bool(node_value))
        elif self.attribute_type == AttributeType.ARRAY:
            return self._evaluate_array(node_value)
        elif self.attribute_type == AttributeType.TEMPORAL:
            return self._evaluate_temporal(str(node_value))
        else:
            raise ValueError(f"Unknown attribute type: {self.attribute_type}")

    def _evaluate_numeric(self, node_value: float) -> bool:
        target = float(self.value)

        if self.operator == NumericOperator.EQUALS:
            return abs(node_value - target) < 1e-9
        elif self.operator == NumericOperator.NOT_EQUALS:
            return abs(node_value - target) >= 1e-9
        elif self.operator == NumericOperator.GREATER:
            return node_value > target
        elif self.operator == NumericOperator.GREATER_EQUAL:
            return node_value >= target
        elif self.operator == NumericOperator.LESS:
            return node_value < target
        elif self.operator == NumericOperator.LESS_EQUAL:
            return node_value <= target
        elif self.operator == NumericOperator.BETWEEN:
            return float(self.value) <= node_value <= float(self.value2)
        else:
            raise ValueError(f"Unsupported numeric operator: {self.operator}")

    def _evaluate_categorical(self, node_value: str) -> bool:
        if self.operator == CategoricalOperator.EQUALS:
            return node_value == str(self.value)
        elif self.operator == CategoricalOperator.NOT_EQUALS:
            return node_value != str(self.value)
        elif self.operator == CategoricalOperator.IN:
            if isinstance(self.value, list):
                return node_value in [str(v) for v in self.value]
            return node_value == str(self.value)
        elif self.operator == CategoricalOperator.NOT_IN:
            if isinstance(self.value, list):
                return node_value not in [str(v) for v in self.value]
            return node_value != str(self.value)
        else:
            raise ValueError(f"Unsupported categorical operator: {self.operator}")

    def _evaluate_boolean(self, node_value: bool) -> bool:
        target = bool(self.value)
        if self.operator == BooleanOperator.EQUALS:
            return node_value == target
        elif self.operator == BooleanOperator.NOT_EQUALS:
            return node_value != target
        else:
            raise ValueError(f"Unsupported boolean operator: {self.operator}")

    def _evaluate_temporal(self, node_value: str) -> bool:
        node_dt = parse_temporal_value(node_value)
        if node_dt is None:
            return False

        if self.operator == TemporalOperator.EQUALS:
            target_dt = parse_temporal_value(str(self.value))
            if target_dt is None:
                return False
            return node_dt.date() == target_dt.date()

        elif self.operator == TemporalOperator.NOT_EQUALS:
            target_dt = parse_temporal_value(str(self.value))
            if target_dt is None:
                return False
            return node_dt.date() != target_dt.date()

        elif self.operator == TemporalOperator.BEFORE:
            target_dt = parse_temporal_value(str(self.value))
            if target_dt is None:
                return False
            return node_dt < target_dt

        elif self.operator == TemporalOperator.AFTER:
            target_dt = parse_temporal_value(str(self.value))
            if target_dt is None:
                return False
            return node_dt > target_dt

        elif self.operator == TemporalOperator.ON_OR_BEFORE:
            target_dt = parse_temporal_value(str(self.value))
            if target_dt is None:
                return False
            return node_dt <= target_dt

        elif self.operator == TemporalOperator.ON_OR_AFTER:
            target_dt = parse_temporal_value(str(self.value))
            if target_dt is None:
                return False
            return node_dt >= target_dt

        elif self.operator == TemporalOperator.BETWEEN:
            start_dt = parse_temporal_value(str(self.value))
            end_dt = parse_temporal_value(str(self.value2))
            if start_dt is None or end_dt is None:
                return False
            return start_dt <= node_dt <= end_dt

        elif self.operator == TemporalOperator.SAME_DAY:
            target_dt = parse_temporal_value(str(self.value))
            if target_dt is None:
                return False
            return node_dt.date() == target_dt.date()

        elif self.operator == TemporalOperator.SAME_MONTH:
            target_dt = parse_temporal_value(str(self.value))
            if target_dt is None:
                return False
            return node_dt.year == target_dt.year and node_dt.month == target_dt.month

        elif self.operator == TemporalOperator.SAME_YEAR:
            target_dt = parse_temporal_value(str(self.value))
            if target_dt is None:
                return False
            return node_dt.year == target_dt.year

        elif self.operator == TemporalOperator.WITHIN_DAYS:
            target_dt = parse_temporal_value(str(self.value))
            if target_dt is None:
                return False
            days_diff = abs((node_dt.date() - target_dt.date()).days)
            return days_diff <= int(self.value2 or 0)

        elif self.operator == TemporalOperator.WITHIN_MONTHS:
            target_dt = parse_temporal_value(str(self.value))
            if target_dt is None:
                return False
            months_diff = abs(
                (node_dt.year - target_dt.year) * 12 + (node_dt.month - target_dt.month)
            )
            return months_diff <= int(self.value2 or 0)

        elif self.operator == TemporalOperator.WITHIN_YEARS:
            target_dt = parse_temporal_value(str(self.value))
            if target_dt is None:
                return False
            years_diff = abs(node_dt.year - target_dt.year)
            return years_diff <= int(self.value2 or 0)

        else:
            raise ValueError(f"Unsupported temporal operator: {self.operator}")

    def _evaluate_array(self, node_value: Any) -> bool:
        node_array = normalize_array_value(node_value)

        if self.operator == ArrayOperator.EQUALS:
            target_array = normalize_array_value(self.value)
            return sorted(node_array) == sorted(target_array)

        elif self.operator == ArrayOperator.NOT_EQUALS:
            target_array = normalize_array_value(self.value)
            return sorted(node_array) != sorted(target_array)

        elif self.operator == ArrayOperator.CONTAINS:
            return self.value in node_array

        elif self.operator == ArrayOperator.CONTAINS_ALL:
            target_items = normalize_array_value(self.value)
            return all(item in node_array for item in target_items)

        elif self.operator == ArrayOperator.CONTAINS_ANY:
            target_items = normalize_array_value(self.value)
            return any(item in node_array for item in target_items)

        elif self.operator == ArrayOperator.LENGTH_EQ:
            return len(node_array) == int(self.value)

        elif self.operator == ArrayOperator.LENGTH_GT:
            return len(node_array) > int(self.value)

        elif self.operator == ArrayOperator.LENGTH_LT:
            return len(node_array) < int(self.value)

        elif self.operator == ArrayOperator.INTERSECTS:
            target_array = normalize_array_value(self.value)
            return bool(set(node_array) & set(target_array))

        elif self.operator == ArrayOperator.SUBSET_OF:
            target_array = normalize_array_value(self.value)
            return set(node_array).issubset(set(target_array))

        elif self.operator == ArrayOperator.SUPERSET_OF:
            target_array = normalize_array_value(self.value)
            return set(node_array).issuperset(set(target_array))

        else:
            raise ValueError(f"Unsupported array operator: {self.operator}")

    def get_applicable_nodes(self, graph: nx.Graph) -> set[str]:
        applicable_nodes = set()

        for node_id in graph.nodes():
            try:
                if self.evaluate(graph, str(node_id)):
                    applicable_nodes.add(str(node_id))
            except (ValueError, TypeError, KeyError):
                continue

        return applicable_nodes

    def validate(self, graph: nx.Graph) -> bool:
        has_attribute = False
        for _node, data in graph.nodes(data=True):
            if self.attribute in data:
                has_attribute = True
                break

        if not has_attribute:
            return False

        if self.node_constraint.allowed_types:
            valid_types = set()
            for _node, data in graph.nodes(data=True):
                node_type = data.get("type", "unknown")
                valid_types.add(node_type)

            invalid_types = self.node_constraint.allowed_types - valid_types
            if invalid_types:
                return False

        return True
