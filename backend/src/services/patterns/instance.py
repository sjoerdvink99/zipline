import hashlib
import json
from dataclasses import dataclass, field
from typing import Any


@dataclass
class PatternInstance:
    pattern_type: str
    pattern_id: str
    node_ids: set[str]
    confidence: float
    features: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError(
                f"Confidence must be between 0.0 and 1.0, got {self.confidence}"
            )
        if not self.node_ids:
            raise ValueError("Pattern instance must contain at least one node")
        if not self.pattern_id:
            raise ValueError("Pattern instance must have a valid pattern_id")

    @property
    def size(self) -> int:
        return len(self.node_ids)

    @property
    def signature(self) -> str:
        signature_data = {
            "type": self.pattern_type,
            "size": self.size,
            "density": self.features.get("density", 0.0),
            "avg_degree": self.features.get("avg_degree", 0.0),
        }
        signature_str = json.dumps(signature_data, sort_keys=True)
        return hashlib.md5(signature_str.encode()).hexdigest()[:12]

    def compute_similarity(
        self, other: "PatternInstance", weights: dict[str, float] | None = None
    ) -> float:
        if other.pattern_type != self.pattern_type:
            return 0.0

        if weights is None:
            weights = {"size": 0.4, "density": 0.3, "features": 0.3}

        size_diff = abs(self.size - other.size)
        max_size = max(self.size, other.size)
        size_similarity = 1.0 - (size_diff / max_size) if max_size > 0 else 1.0

        self_density = self.features.get("density", 0.0)
        other_density = other.features.get("density", 0.0)
        density_diff = abs(self_density - other_density)
        density_similarity = 1.0 - min(density_diff, 1.0)

        feature_similarity = self._compute_feature_similarity(other)

        total_similarity = (
            weights.get("size", 0.4) * size_similarity
            + weights.get("density", 0.3) * density_similarity
            + weights.get("features", 0.3) * feature_similarity
        )

        return min(max(total_similarity, 0.0), 1.0)

    def _compute_feature_similarity(self, other: "PatternInstance") -> float:
        common_features = set(self.features.keys()) & set(other.features.keys())

        if not common_features:
            return 0.5

        similarities = []
        for feature in common_features:
            if feature in ["density", "avg_degree"]:
                try:
                    val1, val2 = (
                        float(self.features[feature]),
                        float(other.features[feature]),
                    )
                    max_val = max(abs(val1), abs(val2), 1e-6)
                    similarity = 1.0 - abs(val1 - val2) / max_val
                    similarities.append(similarity)
                except (ValueError, TypeError):
                    continue

        return sum(similarities) / len(similarities) if similarities else 0.5

    def to_dict(self) -> dict[str, Any]:
        return {
            "pattern_type": self.pattern_type,
            "pattern_id": self.pattern_id,
            "node_ids": list(self.node_ids),
            "confidence": self.confidence,
            "features": self.features,
            "signature": self.signature,
            "size": self.size,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "PatternInstance":
        return cls(
            pattern_type=data["pattern_type"],
            pattern_id=data["pattern_id"],
            node_ids=set(data["node_ids"]),
            confidence=data["confidence"],
            features=data.get("features", {}),
        )
