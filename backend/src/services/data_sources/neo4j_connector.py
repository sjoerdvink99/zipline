from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import networkx as nx
from neo4j import GraphDatabase
from neo4j import exceptions as neo4j_exc

from models.data_source_models import (
    ConnectionTestResult,
    LabelSchema,
    Neo4jConnectionConfig,
    Neo4jQueryConfig,
    Neo4jSchemaInfo,
    QueryPreviewResult,
    RelationshipTypeInfo,
)

_CONNECTION_TIMEOUT = 30
_WRITE_KEYWORDS = re.compile(
    r"\b(CREATE|DELETE|DETACH|SET|REMOVE|MERGE|DROP)\b",
    re.IGNORECASE,
)
# Strip string literals before keyword check to avoid false positives
_STRING_LITERAL = re.compile(r"'[^']*'|\"[^\"]*\"")

# Module-level driver cache keyed by (uri, username)
_driver_cache: dict[tuple[str, str], Any] = {}


def _get_driver(config: Neo4jConnectionConfig) -> Any:
    key = (config.uri, config.username)
    if key not in _driver_cache:
        _driver_cache[key] = GraphDatabase.driver(
            config.uri,
            auth=(config.username, config.password),
            connection_timeout=_CONNECTION_TIMEOUT,
        )
    return _driver_cache[key]


def close_driver(config: Neo4jConnectionConfig) -> None:
    key = (config.uri, config.username)
    driver = _driver_cache.pop(key, None)
    if driver is not None:
        driver.close()


def _escape(name: str) -> str:
    return name.replace("`", "``")


def _parse_version(raw: str) -> tuple[int, ...]:
    try:
        parts = raw.split(".")
        return tuple(int(p.split("-")[0]) for p in parts[:2])
    except (ValueError, IndexError):
        return (5, 0)


def _get_version(session: Any) -> tuple[str, tuple[int, ...]]:
    row = session.run(
        "CALL dbms.components() YIELD versions RETURN versions[0] AS v"
    ).single()
    raw = str(row["v"]) if row else "5.0.0"
    return raw, _parse_version(raw)


def _use_element_id(version: tuple[int, ...]) -> bool:
    return version >= (5, 0)


def _node_key(node: Any, eid: bool) -> str:
    return str(node.element_id) if eid else str(node.id)


def _normalize_node(node: Any, eid: bool) -> tuple[str, dict[str, Any]]:
    nid = _node_key(node, eid)
    labels = list(node.labels)
    node_type = labels[0] if labels else "node"
    props = dict(node.items())

    display_name = (
        props.get("name")
        or props.get("title")
        or props.get("label")
        or props.get("display_name")
        or nid
    )

    serialized: dict[str, Any] = {}
    for k, v in props.items():
        if v is None:
            continue
        serialized[k] = str(v) if isinstance(v, list | dict) else v

    return nid, {
        "node_type": node_type,
        "display_name": str(display_name),
        **serialized,
    }


def _normalize_edge_props(props: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for k, v in props.items():
        if v is None:
            continue
        result[k] = str(v) if isinstance(v, list | dict) else v
    return result


def _validate_read_only(query: str) -> None:
    """Raise ValueError if the query contains write keywords (outside string literals)."""
    sanitized = _STRING_LITERAL.sub("''", query)
    m = _WRITE_KEYWORDS.search(sanitized)
    if m:
        raise ValueError(
            f"Query contains write keyword '{m.group()}' — only read queries are allowed"
        )


def _append_limit(query: str, limit: int) -> str:
    """Append a LIMIT clause if the query doesn't already have one."""
    stripped = query.rstrip().rstrip(";")
    if re.search(r"\bLIMIT\b", stripped, re.IGNORECASE):
        return stripped
    return f"{stripped}\nLIMIT {limit}"


def test_connection(config: Neo4jConnectionConfig) -> ConnectionTestResult:
    driver = _get_driver(config)
    try:
        with driver.session() as session:
            raw_version, _ = _get_version(session)
        return ConnectionTestResult(
            success=True,
            message=f"Connected to Neo4j {raw_version}",
            neo4j_version=raw_version,
        )
    except neo4j_exc.AuthError:
        return ConnectionTestResult(
            success=False,
            message="Authentication failed — check username and password",
        )
    except neo4j_exc.ServiceUnavailable:
        return ConnectionTestResult(
            success=False,
            message="Cannot connect — verify the URI and ensure Neo4j is running",
        )
    except Exception as e:
        return ConnectionTestResult(success=False, message=f"Connection error: {e}")


def get_schema(config: Neo4jConnectionConfig) -> Neo4jSchemaInfo:
    driver = _get_driver(config)
    _LABEL_BATCH = 50
    _REL_BATCH = 50
    _PROP_SAMPLE = 100

    with driver.session() as session:
        raw_version, _ = _get_version(session)

        # Collect label names
        label_names: list[str] = [
            row["label"]
            for row in session.run(
                "CALL db.labels() YIELD label RETURN label ORDER BY label"
            ).data()
        ]

        # Batch-count labels using UNION ALL
        label_counts: dict[str, int] = {}
        for i in range(0, len(label_names), _LABEL_BATCH):
            chunk = label_names[i : i + _LABEL_BATCH]
            parts = [
                f"MATCH (n:`{_escape(lbl)}`) RETURN '{_escape(lbl)}' AS lbl, count(n) AS cnt"
                for lbl in chunk
            ]
            union_query = "\nUNION ALL\n".join(parts)
            for row in session.run(union_query).data():
                label_counts[row["lbl"]] = int(row["cnt"])

        # Per-label property keys (sample 100 nodes per label)
        label_props: dict[str, list[str]] = {}
        for lbl in label_names:
            safe = _escape(lbl)
            prop_rows = session.run(
                f"MATCH (n:`{safe}`) WITH n LIMIT {_PROP_SAMPLE}"
                f" UNWIND keys(n) AS k RETURN DISTINCT k ORDER BY k"
            ).data()
            label_props[lbl] = [row["k"] for row in prop_rows]

        node_labels = [
            LabelSchema(
                label=lbl,
                count=label_counts.get(lbl, 0),
                properties=label_props.get(lbl, []),
            )
            for lbl in label_names
        ]
        node_labels.sort(key=lambda x: x.count, reverse=True)

        # Collect relationship type names
        rel_type_names: list[str] = [
            row["relationshipType"]
            for row in session.run(
                "CALL db.relationshipTypes() YIELD relationshipType"
                " RETURN relationshipType ORDER BY relationshipType"
            ).data()
        ]

        # Batch-count rel types
        rel_counts: dict[str, int] = {}
        for i in range(0, len(rel_type_names), _REL_BATCH):
            chunk = rel_type_names[i : i + _REL_BATCH]
            parts = [
                f"MATCH ()-[r:`{_escape(rt)}`]->() RETURN '{_escape(rt)}' AS rt, count(r) AS cnt"
                for rt in chunk
            ]
            union_query = "\nUNION ALL\n".join(parts)
            for row in session.run(union_query).data():
                rel_counts[row["rt"]] = int(row["cnt"])

        rel_types = [
            RelationshipTypeInfo(type=rt, count=rel_counts.get(rt, 0))
            for rt in rel_type_names
        ]
        rel_types.sort(key=lambda x: x.count, reverse=True)

    return Neo4jSchemaInfo(
        node_labels=node_labels,
        relationship_types=rel_types,
        neo4j_version=raw_version,
    )


def preview_query(config: Neo4jQueryConfig) -> QueryPreviewResult:
    _validate_read_only(config.query)
    driver = _get_driver(config.connection)

    with driver.session() as session:
        _, version = _get_version(session)
        eid = _use_element_id(version)

        # Run with max_nodes + 1 to detect capping
        probe_limit = config.max_nodes + 1
        query_with_limit = _append_limit(config.query, probe_limit)

        node_ids: set[str] = set()
        for record in session.run(query_with_limit):
            for value in record.values():
                if hasattr(value, "labels"):  # Neo4j Node
                    nid = str(value.element_id) if eid else str(value.id)
                    node_ids.add(nid)
                    if len(node_ids) > config.max_nodes:
                        return QueryPreviewResult(
                            node_count=config.max_nodes, capped=True
                        )

    return QueryPreviewResult(node_count=len(node_ids), capped=False)


@dataclass
class ExtractionMeta:
    edge_limit_reached: bool
    node_types: list[str]


def execute_query(config: Neo4jQueryConfig) -> tuple[nx.Graph, ExtractionMeta]:
    _validate_read_only(config.query)
    driver = _get_driver(config.connection)

    with driver.session() as session:
        _, version = _get_version(session)
        eid = _use_element_id(version)
        id_fn = "elementId" if eid else "id"

        # Step 1: collect nodes from query results
        query_with_limit = _append_limit(config.query, config.max_nodes)
        node_attrs: dict[str, dict[str, Any]] = {}

        for record in session.run(query_with_limit):
            for value in record.values():
                if hasattr(value, "labels"):  # Neo4j Node
                    nid, attrs = _normalize_node(value, eid)
                    if nid not in node_attrs:
                        node_attrs[nid] = attrs
                    if len(node_attrs) >= config.max_nodes:
                        break

        G = nx.Graph()
        for nid, attrs in node_attrs.items():
            G.add_node(nid, **attrs)

        # Step 2: extract edges between collected nodes
        edge_limit_reached = False
        if node_attrs:
            node_id_list: list[Any] = (
                list(node_attrs.keys()) if eid else [int(k) for k in node_attrs]
            )

            seen: set[tuple[str, str]] = set()
            edge_query = f"""
                UNWIND $node_ids AS nid
                CALL {{
                    WITH nid
                    MATCH (a) WHERE {id_fn}(a) = nid
                    MATCH (a)-[r]->(b)
                    WHERE {id_fn}(b) IN $node_ids
                    RETURN {id_fn}(a) AS src, {id_fn}(b) AS tgt,
                           type(r) AS rel_type, properties(r) AS props
                    LIMIT 500
                }}
                RETURN src, tgt, rel_type, props
                LIMIT $max_edges
            """
            results = list(
                session.run(
                    edge_query, node_ids=node_id_list, max_edges=config.max_edges
                )
            )
            if len(results) >= config.max_edges:
                edge_limit_reached = True

            for record in results:
                src = str(record["src"])
                tgt = str(record["tgt"])
                key = (min(src, tgt), max(src, tgt))
                if key not in seen:
                    seen.add(key)
                    edge_attrs = _normalize_edge_props(dict(record["props"]))
                    edge_attrs["edge_type"] = record["rel_type"]
                    G.add_edge(src, tgt, **edge_attrs)

    node_types = sorted(
        {data.get("node_type", "node") for _, data in G.nodes(data=True)}
    )
    meta = ExtractionMeta(edge_limit_reached=edge_limit_reached, node_types=node_types)
    return G, meta
