"""Path helpers for mapping agent working_dir paths onto sidecar roots.

Phase 2 uses **identity mapping**: the path the agent-server sees must already
be an absolute path under a sidecar allowlisted root. Relative paths resolve
against ``working_dir``.
"""

from __future__ import annotations

import os
from pathlib import PurePosixPath, PureWindowsPath


def _pure_path(path: str):
    if os.name == "nt" or (len(path) >= 2 and path[1] == ":"):
        return PureWindowsPath(path)
    return PurePosixPath(path)


def is_absolute_path(path: str) -> bool:
    return _pure_path(path).is_absolute()


def join_under_working_dir(working_dir: str, path: str | os.PathLike[str]) -> str:
    """Resolve ``path`` against ``working_dir`` when relative; normalize ``..``."""
    raw = os.fspath(path)
    if not raw:
        raise ValueError("path is required")
    if is_absolute_path(raw):
        # os.path.normpath keeps drive letters / POSIX correctly enough for bridge
        return os.path.normpath(raw)
    return os.path.normpath(os.path.join(working_dir, raw))


def assert_under_roots(absolute_path: str, roots: list[str]) -> str:
    """Return ``absolute_path`` if it sits under one of ``roots``; else raise."""
    if not roots:
        raise PermissionError("no allowlisted roots configured")
    candidate = os.path.normpath(absolute_path)
    for root in roots:
        root_n = os.path.normpath(root)
        if candidate == root_n:
            return candidate
        prefix = root_n if root_n.endswith(os.sep) else root_n + os.sep
        if candidate.startswith(prefix):
            return candidate
    raise PermissionError(f"path denied (outside sidecar roots): {absolute_path}")


def map_agent_path_to_sidecar(
    path: str | os.PathLike[str],
    *,
    working_dir: str,
    roots: list[str] | None = None,
) -> str:
    """Map an agent-facing path to the absolute path the sidecar should see.

    Phase 2: resolve relative paths under ``working_dir``, optionally assert
    allowlist membership when ``roots`` is provided.
    """
    absolute = join_under_working_dir(working_dir, path)
    if roots is not None:
        return assert_under_roots(absolute, roots)
    return absolute
