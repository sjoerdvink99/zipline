from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class DataSourceType(str, Enum):
    sample = "sample"
    neo4j = "neo4j"
    file = "file"


class Neo4jConnectionConfig(BaseModel):
    uri: str
    username: str
    password: str


class LabelSchema(BaseModel):
    label: str
    count: int
    properties: list[str]


class RelationshipTypeInfo(BaseModel):
    type: str
    count: int


class Neo4jSchemaInfo(BaseModel):
    node_labels: list[LabelSchema]
    relationship_types: list[RelationshipTypeInfo]
    neo4j_version: str | None = None


class Neo4jQueryConfig(BaseModel):
    connection: Neo4jConnectionConfig
    query: str
    max_nodes: int = Field(default=5000, ge=100, le=50_000)
    max_edges: int = Field(default=200_000, ge=1000, le=1_000_000)
    name: str
    description: str = ""


class QueryPreviewResult(BaseModel):
    node_count: int
    capped: bool


class ExtractionResult(BaseModel):
    success: bool
    dataset_id: str
    nodes: int
    edges: int
    node_types: list[str]
    edge_limit_reached: bool


class ConnectionTestResult(BaseModel):
    success: bool
    message: str
    neo4j_version: str | None = None


class UserDataSourceMeta(BaseModel):
    id: str
    type: DataSourceType
    name: str
    description: str
    node_count: int
    edge_count: int
    node_types: list[str]
    created_at: str
    connection_uri: str | None = None
    file_name: str | None = None
