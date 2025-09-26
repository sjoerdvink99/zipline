from __future__ import annotations

from typing import Any, List

import networkx as nx

__all__ = [
    "GraphAnalysisSession",
    "get_session",
    "create_session",
    "delete_session",
]


class GraphAnalysisSession:
    def __init__(self, graph: nx.Graph | None = None, dataset_name: str = "social"):
        self.graph = graph
        self.dataset_name = dataset_name
        self.detected_patterns: List[Any] = []

_sessions: dict[str, GraphAnalysisSession] = {}
_default_session_id = "default"


def get_session(session_id: str = _default_session_id) -> GraphAnalysisSession:
    if session_id not in _sessions:
        _sessions[session_id] = GraphAnalysisSession()
    return _sessions[session_id]


def create_session(
    graph: nx.Graph | None = None, dataset_name: str = "social", session_id: str | None = None
) -> tuple[str, GraphAnalysisSession]:
    sid = session_id or _default_session_id
    _sessions[sid] = GraphAnalysisSession(graph, dataset_name)
    return sid, _sessions[sid]


def delete_session(session_id: str) -> bool:
    return _sessions.pop(session_id, None) is not None
