from dataclasses import dataclass
from typing import Literal

from .predicate_enums import PredicateOperator, PredicateSpace


@dataclass
class PredicateTemplate:
    space: PredicateSpace
    predicate_type: Literal["equality", "inequality", "membership", "range"]
    attribute: str
    operator: PredicateOperator
    threshold_strategy: Literal["percentile", "statistical", "exact"]


class PredicateTemplateLibrary:
    def __init__(self):
        self.attribute_templates = self._build_attribute_templates()
        self.topology_templates = self._build_topology_templates()

    def _build_attribute_templates(self) -> list[PredicateTemplate]:
        return [
            PredicateTemplate(
                PredicateSpace.ATTRIBUTE,
                "equality",
                "{attr}",
                PredicateOperator.EQUAL,
                "exact",
            ),
            PredicateTemplate(
                PredicateSpace.ATTRIBUTE,
                "membership",
                "{attr}",
                PredicateOperator.MEMBERSHIP,
                "exact",
            ),
            PredicateTemplate(
                PredicateSpace.ATTRIBUTE,
                "inequality",
                "{attr}",
                PredicateOperator.GREATER_THAN,
                "percentile",
            ),
            PredicateTemplate(
                PredicateSpace.ATTRIBUTE,
                "range",
                "{attr}",
                PredicateOperator.EQUAL,
                "statistical",
            ),
        ]

    def _build_topology_templates(self) -> list[PredicateTemplate]:
        return [
            PredicateTemplate(
                PredicateSpace.TOPOLOGY,
                "inequality",
                "degree",
                PredicateOperator.GREATER_THAN,
                "percentile",
            ),
            PredicateTemplate(
                PredicateSpace.TOPOLOGY,
                "inequality",
                "betweenness",
                PredicateOperator.GREATER_THAN,
                "percentile",
            ),
            PredicateTemplate(
                PredicateSpace.TOPOLOGY,
                "inequality",
                "closeness",
                PredicateOperator.GREATER_THAN,
                "percentile",
            ),
            PredicateTemplate(
                PredicateSpace.TOPOLOGY,
                "inequality",
                "clustering",
                PredicateOperator.GREATER_THAN,
                "percentile",
            ),
            PredicateTemplate(
                PredicateSpace.TOPOLOGY,
                "inequality",
                "pagerank",
                PredicateOperator.GREATER_THAN,
                "percentile",
            ),
            PredicateTemplate(
                PredicateSpace.TOPOLOGY,
                "range",
                "clustering",
                PredicateOperator.EQUAL,
                "statistical",
            ),
        ]

    def get_templates_for_space(self, space: PredicateSpace) -> list[PredicateTemplate]:
        if space == PredicateSpace.ATTRIBUTE:
            return self.attribute_templates
        elif space == PredicateSpace.TOPOLOGY:
            return self.topology_templates
        return []
