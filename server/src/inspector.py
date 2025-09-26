from __future__ import annotations

import socket
import uuid
import webbrowser
from typing import Optional

import networkx as nx
from IPython.display import IFrame, display
from networkx.readwrite import json_graph

from runtime import ensure_server, put_session_graph, running_port

__all__ = ["inspect", "is_running", "stop"]


def _find_free_port(preferred: int = 5178) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", preferred))
            return preferred
        except OSError:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]


def inspect(
    g: nx.Graph,
    *,
    port: Optional[int] = None,
    open_browser: bool = True,
    in_notebook_iframe: bool = True,
    height: int = 720,
) -> str:
    sid = str(uuid.uuid4())
    data = json_graph.node_link_data(g)
    port = port or running_port() or _find_free_port()

    ensure_server(port=port)
    put_session_graph(sid, data)

    url = f"http://127.0.0.1:{port}/?session={sid}"
    try:
        if in_notebook_iframe:
            display(IFrame(src=url, width="100%", height=height))
        if open_browser:
            webbrowser.open(url, new=2)
    except Exception:
        pass
    return url


def is_running() -> bool:
    return running_port() is not None


def stop():
    from runtime import stop_server

    stop_server()
