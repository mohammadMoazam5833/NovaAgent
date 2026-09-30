"""Optional SidecarWorkspace tests (require openhands-sdk on PYTHONPATH)."""

from __future__ import annotations

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

try:
    from openhands.sdk.workspace.local import LocalWorkspace

    from sidecar_bridge.client import SidecarClient
    from sidecar_bridge.workspace import SidecarWorkspace

    HAS_SDK = True
except ImportError:  # pragma: no cover
    HAS_SDK = False


@unittest.skipUnless(HAS_SDK, "openhands-sdk not installed")
class SidecarWorkspaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, format: str, *args) -> None:  # noqa: A003
                return

            def do_GET(self) -> None:  # noqa: N802
                self._json(200, {"ok": True, "protocol": 1})

            def do_POST(self) -> None:  # noqa: N802
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length).decode("utf-8"))
                typ = body.get("type")
                params = body.get("params") or {}
                req_id = body.get("id", "1")
                if typ == "read_file":
                    result = {
                        "path": params.get("path"),
                        "encoding": "utf-8",
                        "content": "from-sidecar",
                    }
                elif typ == "write_file":
                    result = {
                        "path": params.get("path"),
                        "bytes_written": len(str(params.get("content") or "").encode()),
                    }
                elif typ == "list_dir":
                    result = {"path": params.get("path"), "entries": []}
                elif typ == "exec":
                    result = {
                        "exit_code": 0,
                        "stdout": "pong\n",
                        "stderr": "",
                        "timed_out": False,
                    }
                else:
                    result = {}
                self._json(200, {
                    "v": 1, "id": req_id, "type": "result", "ok": True, "result": result,
                })

            def _json(self, status: int, payload: dict) -> None:
                data = json.dumps(payload).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        cls._httpd = HTTPServer(("127.0.0.1", 0), Handler)
        cls._port = cls._httpd.server_address[1]
        cls._thread = threading.Thread(target=cls._httpd.serve_forever, daemon=True)
        cls._thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls._httpd.shutdown()

    def test_isinstance_local_workspace(self) -> None:
        client = SidecarClient(
            base_url=f"http://127.0.0.1:{self._port}",
            token="t",
        )
        ws = SidecarWorkspace(working_dir="/tmp/ws", client=client)
        self.assertIsInstance(ws, LocalWorkspace)
        self.assertEqual(ws.read_text("a.txt"), "from-sidecar")
        result = ws.execute_command("echo pong", cwd="/tmp/ws")
        self.assertEqual(result.exit_code, 0)
        self.assertIn("pong", result.stdout)

    def test_file_download_upload(self) -> None:
        client = SidecarClient(
            base_url=f"http://127.0.0.1:{self._port}",
            token="t",
        )
        ws = SidecarWorkspace(working_dir="/tmp/ws", client=client)
        dest = Path(self._httpd.server_address[0])  # unused placeholder
        # write a local source then upload
        import tempfile

        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "local.txt"
            src.write_text("upload-me", encoding="utf-8")
            up = ws.file_upload(src, "/tmp/ws/remote.txt")
            self.assertTrue(up.success)
            out = Path(td) / "out.txt"
            down = ws.file_download("/tmp/ws/remote.txt", out)
            self.assertTrue(down.success)
            self.assertEqual(out.read_text(encoding="utf-8"), "from-sidecar")
            _ = dest


if __name__ == "__main__":
    unittest.main()
