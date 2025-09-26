from __future__ import annotations

import contextlib
import threading
from typing import Optional

from uvicorn import Config, Server

__all__ = [
    "ensure_server",
    "stop_server",
    "running_port",
    "put_session_graph",
    "get_session_graph",
]

_STATE = {
    "thread": None,
    "server": None,
    "port": None,
    "sessions": {},
}


def ensure_server(port: int) -> None:
    if _STATE["server"] and _STATE["port"] == port:
        return
    if _STATE["server"]:
        stop_server()

    from app import build_app

    app = build_app()

    cfg = Config(app=app, host="127.0.0.1", port=port, log_level="warning")
    srv = Server(cfg)

    t = threading.Thread(target=srv.run, daemon=True)
    t.start()

    _STATE.update({"thread": t, "server": srv, "port": port})


def stop_server():
    srv = _STATE.get("server")
    if not srv:
        return
    with contextlib.suppress(Exception):
        srv.should_exit = True
    t = _STATE.get("thread")
    if t and t.is_alive():
        t.join(timeout=2)
    _STATE.update({"thread": None, "server": None, "port": None, "sessions": {}})


def running_port() -> Optional[int]:
    return _STATE["port"]


def put_session_graph(sid: str, node_link_json: dict) -> None:
    _STATE["sessions"][sid] = node_link_json


def get_session_graph(sid: str) -> Optional[dict]:
    return _STATE["sessions"].get(sid)
