from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

__all__ = ["PropertyNode", "PropertyEdge", "PropertyGraph", "Node", "Link", "NodeLinkGraph"]


class PropertyNode(BaseModel):
    id: str = Field(..., description="Unique node identifier")
    label: str = Field(..., description="Node type/classification")
    attributes: Dict[str, Any] = Field(default_factory=dict, description="Additional properties")

    class Config:
        extra = "forbid"

    @classmethod
    def from_flat(cls, data: Dict[str, Any]) -> "PropertyNode":
        node_id = str(data.get("id", ""))
        label = str(data.get("label", data.get("kind", data.get("type", node_id))))
        attrs = {k: v for k, v in data.items() if k not in ("id", "label")}
        return cls(id=node_id, label=label, attributes=attrs)

    def to_flat(self) -> Dict[str, Any]:
        result = {"id": self.id, "label": self.label}
        result.update(self.attributes)
        return result


class PropertyEdge(BaseModel):
    id: str = Field(..., description="Unique edge identifier")
    source: str = Field(..., description="Source node id")
    target: str = Field(..., description="Target node id")
    label: str = Field(default="", description="Edge type/relationship")
    attributes: Dict[str, Any] = Field(default_factory=dict, description="Additional properties")

    class Config:
        extra = "forbid"

    @classmethod
    def from_flat(cls, data: Dict[str, Any], index: int = 0) -> "PropertyEdge":
        source = str(data.get("source", ""))
        target = str(data.get("target", ""))
        edge_id = str(data.get("id", f"e{index}:{source}->{target}"))
        label = str(data.get("label", data.get("kind", data.get("type", ""))))
        attrs = {k: v for k, v in data.items() if k not in ("id", "source", "target", "label")}
        return cls(id=edge_id, source=source, target=target, label=label, attributes=attrs)

    def to_flat(self) -> Dict[str, Any]:
        result = {"id": self.id, "source": self.source, "target": self.target, "label": self.label}
        result.update(self.attributes)
        return result


class PropertyGraph(BaseModel):
    nodes: List[PropertyNode]
    edges: List[PropertyEdge]
    directed: bool = False
    metadata: Dict[str, Any] = Field(default_factory=dict)


class Node(BaseModel):
    id: Any = Field(..., description="Node identifier")

    class Config:
        extra = "allow"


class Link(BaseModel):
    source: Any
    target: Any

    class Config:
        extra = "allow"


class NodeLinkGraph(BaseModel):
    nodes: List[Node]
    links: List[Link]
    directed: Optional[bool] = None
    multigraph: Optional[bool] = None
    graph: Optional[Dict[str, Any]] = None
