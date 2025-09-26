#!/usr/bin/env python3

import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent
CLIENT = ROOT / "client"
PYPROJECT = CLIENT / "pyproject.toml"
INIT = CLIENT / "graphbridge" / "__init__.py"
ENV_FILE = ROOT / ".env"


def load_env() -> None:
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ[key.strip()] = value.strip()


def get_version() -> str:
    text = PYPROJECT.read_text()
    match = re.search(r'version = "(.+?)"', text)
    return match.group(1) if match else "0.0.0"


def set_version(version: str) -> None:
    # Update pyproject.toml
    text = PYPROJECT.read_text()
    text = re.sub(r'version = ".+?"', f'version = "{version}"', text)
    PYPROJECT.write_text(text)

    # Update __init__.py
    text = INIT.read_text()
    text = re.sub(r'__version__ = ".+?"', f'__version__ = "{version}"', text)
    INIT.write_text(text)


def bump(part: str) -> str:
    current = get_version()
    major, minor, patch = map(int, current.split("."))

    if part == "major":
        return f"{major + 1}.0.0"
    elif part == "minor":
        return f"{major}.{minor + 1}.0"
    else:
        return f"{major}.{minor}.{patch + 1}"


def build() -> None:
    subprocess.run([sys.executable, "-m", "build"], cwd=CLIENT, check=True)


def publish() -> None:
    load_env()
    env = os.environ.copy()
    env["TWINE_USERNAME"] = "__token__"
    subprocess.run([sys.executable, "-m", "twine", "upload", "dist/*"], cwd=CLIENT, env=env, shell=False)


def main() -> None:
    if len(sys.argv) < 2:
        print(f"Current version: {get_version()}")
        print("Usage: python release.py [patch|minor|major]")
        print("       python release.py publish")
        return

    cmd = sys.argv[1]

    if cmd == "publish":
        build()
        publish()
    elif cmd in ("patch", "minor", "major"):
        new_version = bump(cmd)
        set_version(new_version)
        print(f"Version bumped to {new_version}")
    else:
        print(f"Unknown command: {cmd}")


if __name__ == "__main__":
    main()
