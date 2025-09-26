from enum import Enum


class PredicateSpace(Enum):
    ATTRIBUTE = "attribute"
    TOPOLOGY = "topology"


class PredicateOperator(Enum):
    EQUAL = "="
    GREATER_THAN = ">="
    LESS_THAN = "<="
    GREATER = ">"
    LESS = "<"
    MEMBERSHIP = "in"
