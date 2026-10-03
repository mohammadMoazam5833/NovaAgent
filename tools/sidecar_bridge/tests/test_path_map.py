"""Unit tests for sidecar_bridge.path_map (stdlib only)."""

from __future__ import annotations

import os
import unittest

from sidecar_bridge.path_map import (
    assert_under_roots,
    join_under_working_dir,
    map_agent_path_to_sidecar,
)


class PathMapTests(unittest.TestCase):
    def test_join_relative(self) -> None:
        got = join_under_working_dir("/tmp/ws", "src/a.txt")
        self.assertEqual(got, os.path.normpath("/tmp/ws/src/a.txt"))

    def test_join_absolute(self) -> None:
        got = join_under_working_dir("/tmp/ws", "/tmp/ws/b.txt")
        self.assertEqual(got, os.path.normpath("/tmp/ws/b.txt"))

    def test_join_rejects_empty(self) -> None:
        with self.assertRaises(ValueError):
            join_under_working_dir("/tmp/ws", "")

    def test_assert_under_roots_ok(self) -> None:
        path = assert_under_roots("/tmp/ws/a", ["/tmp/ws"])
        self.assertEqual(path, os.path.normpath("/tmp/ws/a"))

    def test_assert_under_roots_denies_sibling_prefix(self) -> None:
        with self.assertRaises(PermissionError):
            assert_under_roots("/tmp/ws2/x", ["/tmp/ws"])

    def test_map_with_roots(self) -> None:
        got = map_agent_path_to_sidecar(
            "hello.txt",
            working_dir="/home/u/project",
            roots=["/home/u/project"],
        )
        self.assertEqual(got, os.path.normpath("/home/u/project/hello.txt"))

    def test_map_escape_denied(self) -> None:
        with self.assertRaises(PermissionError):
            map_agent_path_to_sidecar(
                "../secret",
                working_dir="/home/u/project",
                roots=["/home/u/project"],
            )


if __name__ == "__main__":
    unittest.main()
