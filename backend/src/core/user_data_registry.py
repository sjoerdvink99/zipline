from __future__ import annotations

import json
from pathlib import Path

from models.data_source_models import UserDataSourceMeta
from utils.logging_config import get_logger

logger = get_logger("user_data_registry")

_DEFAULT_STORAGE_DIR = Path.home() / ".zipline"
_REGISTRY_FILE = "data_sources.json"
_UPLOADS_SUBDIR = "uploads"


class UserDataRegistry:
    def __init__(self, storage_dir: Path | None = None) -> None:
        self._base = storage_dir or _DEFAULT_STORAGE_DIR
        self._registry_path = self._base / _REGISTRY_FILE
        self._uploads_dir = self._base / _UPLOADS_SUBDIR
        self._sources: dict[str, UserDataSourceMeta] = {}
        self._ensure_dirs()
        self._load()

    def _ensure_dirs(self) -> None:
        try:
            self._base.mkdir(parents=True, exist_ok=True)
            self._uploads_dir.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            logger.warning(f"Cannot create storage directory {self._base}: {e}")

    def _load(self) -> None:
        if not self._registry_path.exists():
            return
        try:
            with open(self._registry_path) as f:
                raw = json.load(f)
            self._sources = {
                k: UserDataSourceMeta.model_validate(v) for k, v in raw.items()
            }
        except Exception as e:
            logger.warning(f"Failed to load data source registry: {e}")
            self._sources = {}

    def _persist(self) -> None:
        try:
            payload = {k: v.model_dump() for k, v in self._sources.items()}
            tmp = self._registry_path.with_suffix(".tmp")
            with open(tmp, "w") as f:
                json.dump(payload, f, indent=2)
            tmp.replace(self._registry_path)
        except OSError as e:
            logger.warning(f"Failed to persist data source registry: {e}")

    def list_sources(self) -> list[UserDataSourceMeta]:
        return sorted(self._sources.values(), key=lambda s: s.created_at, reverse=True)

    def save_source(self, meta: UserDataSourceMeta) -> None:
        self._sources[meta.id] = meta
        self._persist()

    def delete_source(self, source_id: str) -> bool:
        if source_id not in self._sources:
            return False
        del self._sources[source_id]
        self._persist()
        return True

    def get_source(self, source_id: str) -> UserDataSourceMeta | None:
        return self._sources.get(source_id)

    def save_upload(self, source_id: str, content: bytes, ext: str) -> Path:
        path = self._uploads_dir / f"{source_id}.{ext.lstrip('.')}"
        path.write_bytes(content)
        return path

    def get_upload_path(self, source_id: str) -> Path | None:
        for ext in ("json", "graphml", "xml"):
            path = self._uploads_dir / f"{source_id}.{ext}"
            if path.exists():
                return path
        return None

    def delete_upload(self, source_id: str) -> None:
        for ext in ("json", "graphml", "xml"):
            path = self._uploads_dir / f"{source_id}.{ext}"
            if path.exists():
                path.unlink()
