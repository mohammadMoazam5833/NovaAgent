"""Unit tests for sidecar_bridge.tools_proxy helpers (stdlib + optional SDK)."""

from __future__ import annotations

import unittest
from unittest.mock import Mock

from sidecar_bridge.client import SidecarClientError
from sidecar_bridge.tools_proxy import _is_customer_absolute, sidecar_path_kind


class CustomerAbsoluteTests(unittest.TestCase):
    def test_posix(self) -> None:
        self.assertTrue(_is_customer_absolute("/home/alice/proj"))
        self.assertFalse(_is_customer_absolute("proj"))
        self.assertFalse(_is_customer_absolute(""))

    def test_windows(self) -> None:
        self.assertTrue(_is_customer_absolute(r"C:\Users\alice"))
        self.assertTrue(_is_customer_absolute("D:/work"))
        self.assertTrue(_is_customer_absolute(r"\\server\share"))


class SidecarPathKindTests(unittest.TestCase):
    def test_dir(self) -> None:
        client = Mock()
        client.list_dir.return_value = {"entries": []}
        self.assertEqual(sidecar_path_kind(client, "/tmp"), "dir")

    def test_file(self) -> None:
        client = Mock()
        client.list_dir.side_effect = SidecarClientError(
            "invalid_request", "path is not a directory"
        )
        self.assertEqual(sidecar_path_kind(client, "/tmp/a.txt"), "file")

    def test_missing(self) -> None:
        client = Mock()
        client.list_dir.side_effect = SidecarClientError("not_found", "nope")
        self.assertEqual(sidecar_path_kind(client, "/tmp/missing"), "missing")


if __name__ == "__main__":
    unittest.main()
