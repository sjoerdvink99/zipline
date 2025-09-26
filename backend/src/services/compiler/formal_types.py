from enum import Enum


class PredicateType(Enum):
    ATTRIBUTE = "attribute"
    TOPOLOGY = "topology"
    PATTERN = "pattern"


class LogicalOperator(Enum):
    AND = "and"
    OR = "or"
    NOT = "not"


class AttributeType(Enum):
    NUMERIC = "numeric"
    CATEGORICAL = "categorical"
    BOOLEAN = "boolean"
    ARRAY = "array"
    TEMPORAL = "temporal"


class NumericOperator(Enum):
    EQUALS = "="
    NOT_EQUALS = "!="
    GREATER = ">"
    GREATER_EQUAL = ">="
    LESS = "<"
    LESS_EQUAL = "<="
    BETWEEN = "between"


class CategoricalOperator(Enum):
    EQUALS = "="
    NOT_EQUALS = "!="
    IN = "in"
    NOT_IN = "not_in"


class BooleanOperator(Enum):
    EQUALS = "="
    NOT_EQUALS = "!="


class TemporalOperator(Enum):
    EQUALS = "="
    NOT_EQUALS = "!="
    BEFORE = "<"
    AFTER = ">"
    ON_OR_BEFORE = "<="
    ON_OR_AFTER = ">="
    BETWEEN = "between"
    WITHIN_DAYS = "within_days"
    WITHIN_MONTHS = "within_months"
    WITHIN_YEARS = "within_years"
    SAME_DAY = "same_day"
    SAME_MONTH = "same_month"
    SAME_YEAR = "same_year"


class ArrayOperator(Enum):
    CONTAINS = "contains"
    CONTAINS_ALL = "contains_all"
    CONTAINS_ANY = "contains_any"
    LENGTH_EQ = "length_eq"
    LENGTH_GT = "length_gt"
    LENGTH_LT = "length_lt"
    INTERSECTS = "intersects"
    SUBSET_OF = "subset_of"
    SUPERSET_OF = "superset_of"
    EQUALS = "="
    NOT_EQUALS = "!="


class PatternType(Enum):
    ISOLATE = "isolate"
    LEAF = "leaf"
    HUB = "hub"
    STAR = "star"
    TRIANGLE = "triangle"
    CLIQUE = "clique"
    BRIDGE = "bridge"
    ARTICULATION = "articulation"


STRUCTURAL_FEATURES = [
    "degree",
    "clustering_coefficient",
    "betweenness_centrality",
    "closeness_centrality",
    "eigenvector_centrality",
    "k_core",
    "pagerank",
]
