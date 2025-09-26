import uuid

from models.pattern_models import Pattern, PatternCreate, PatternType


class PatternLibrary:
    def __init__(self):
        self._patterns: dict[str, Pattern] = {}
        self._domain_patterns: dict[str, list[str]] = {}
        self._initialize_default_patterns()

    def _initialize_default_patterns(self):
        default_patterns = [
            PatternCreate(
                name="Central Hub",
                description="High-degree node serving as a central connection point",
                node_ids=[],
                pattern_type=PatternType.HUB,
                domain="network",
                metadata={"min_degree": 10, "centrality_threshold": 0.8},
            ),
            PatternCreate(
                name="Bridge Node",
                description="Node connecting separate components or communities",
                node_ids=[],
                pattern_type=PatternType.BRIDGE,
                domain="network",
                metadata={"betweenness_threshold": 0.5},
            ),
            PatternCreate(
                name="Star Formation",
                description="Central node with multiple peripheral connections",
                node_ids=[],
                pattern_type=PatternType.STAR,
                domain="network",
                metadata={"min_leaves": 3, "max_inner_edges": 0},
            ),
            PatternCreate(
                name="Dense Cluster",
                description="Tightly connected group of nodes",
                node_ids=[],
                pattern_type=PatternType.CLUSTER,
                domain="general",
                metadata={"min_density": 0.7, "min_size": 4},
            ),
        ]

        for pattern_data in default_patterns:
            self._create_pattern_instance(pattern_data)

    def _create_pattern_instance(self, pattern_data: PatternCreate) -> Pattern:
        pattern_id = str(uuid.uuid4())
        pattern = Pattern(
            id=pattern_id,
            name=pattern_data.name,
            description=pattern_data.description,
            node_ids=pattern_data.node_ids,
            pattern_type=pattern_data.pattern_type,
            domain=pattern_data.domain,
            metadata=pattern_data.metadata,
            confidence=pattern_data.confidence,
        )

        self._patterns[pattern_id] = pattern

        if pattern.domain:
            if pattern.domain not in self._domain_patterns:
                self._domain_patterns[pattern.domain] = []
            self._domain_patterns[pattern.domain].append(pattern_id)

        return pattern

    def get_domain_patterns(self, domain: str) -> list[Pattern]:
        pattern_ids = self._domain_patterns.get(domain, [])
        return [self._patterns[pid] for pid in pattern_ids if pid in self._patterns]

    def get_all_patterns(self) -> list[Pattern]:
        return list(self._patterns.values())

    def get_pattern_by_id(self, pattern_id: str) -> Pattern | None:
        return self._patterns.get(pattern_id)

    def create_custom_pattern(
        self,
        name: str,
        description: str,
        node_ids: list[str],
        domain: str | None = None,
    ) -> Pattern:
        pattern_data = PatternCreate(
            name=name,
            description=description,
            node_ids=node_ids,
            pattern_type=PatternType.CUSTOM,
            domain=domain,
            metadata={"created_by": "user", "node_count": len(node_ids)},
        )
        return self._create_pattern_instance(pattern_data)

    def save_pattern(self, pattern_data: PatternCreate) -> Pattern:
        return self._create_pattern_instance(pattern_data)

    def delete_pattern(self, pattern_id: str) -> bool:
        if pattern_id not in self._patterns:
            return False

        pattern = self._patterns[pattern_id]

        if pattern.domain and pattern.domain in self._domain_patterns:
            if pattern_id in self._domain_patterns[pattern.domain]:
                self._domain_patterns[pattern.domain].remove(pattern_id)

        del self._patterns[pattern_id]
        return True

    def search_patterns(self, query: str) -> list[Pattern]:
        query_lower = query.lower()
        results = []

        for pattern in self._patterns.values():
            if (
                query_lower in pattern.name.lower()
                or query_lower in pattern.description.lower()
                or query_lower in pattern.pattern_type.value.lower()
            ):
                results.append(pattern)

        return results

    def get_patterns_by_type(self, pattern_type: PatternType) -> list[Pattern]:
        return [
            pattern
            for pattern in self._patterns.values()
            if pattern.pattern_type == pattern_type
        ]

    def update_pattern(
        self, pattern_id: str, updates: dict[str, any]
    ) -> Pattern | None:
        if pattern_id not in self._patterns:
            return None

        pattern = self._patterns[pattern_id]

        for key, value in updates.items():
            if hasattr(pattern, key) and key != "id":
                setattr(pattern, key, value)

        return pattern

    def get_domain_list(self) -> list[str]:
        return list(self._domain_patterns.keys())

    def get_pattern_statistics(self) -> dict[str, any]:
        return {
            "total_patterns": len(self._patterns),
            "patterns_by_type": {
                pattern_type.value: len(self.get_patterns_by_type(pattern_type))
                for pattern_type in PatternType
            },
            "patterns_by_domain": {
                domain: len(patterns)
                for domain, patterns in self._domain_patterns.items()
            },
            "domains": self.get_domain_list(),
        }
