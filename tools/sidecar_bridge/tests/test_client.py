"""Unit tests for SidecarClient against a tiny mock HTTP sidecar."""

from __future__ import annotations

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

from sidecar_bridge.client import SidecarClient, SidecarClientError, client_from_env


class _Handler(BaseHTTPRequestHandler):
    token = "test-token"
    roots = ["/tmp/demo"]

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._json(200, {"ok": True, "protocol": 1})
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/v1":
            self._json(404, {"error": "not found"})
            return
        auth = self.headers.get("Authorization", "")
        if auth != f"Bearer {self.token}":
            self._json(401, {"v": 1, "id": "x", "type": "error", "ok": False,
                             "error": {"code": "unauthorized", "message": "bad token"}})
            return
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length).decode("utf-8"))
        req_id = body.get("id", "1")
        typ = body.get("type")
        params = body.get("params") or {}
        if typ == "hello":
            self._json(200, {
                "v": 1, "id": req_id, "type": "result", "ok": True,
                "result": {"protocol": 1, "roots": self.roots, "host": "127.0.0.1", "port": 0},
            })
            return
        if typ == "list_dir":
            self._json(200, {
                "v": 1, "id": req_id, "type": "result", "ok": True,
                "result": {
                    "path": params.get("path"),
                    "entries": [{"name": "a.txt", "type": "file", "size": 3}],
                },
            })
            return
        if typ == "read_file":
            self._json(200, {
                "v": 1, "id": req_id, "type": "result", "ok": True,
                "result": {"path": params.get("path"), "encoding": "utf-8", "content": "hi\n"},
            })
            return
        if typ == "write_file":
            content = params.get("content") or ""
            self._json(200, {
                "v": 1, "id": req_id, "type": "result", "ok": True,
                "result": {
                    "path": params.get("path"),
                    "bytes_written": len(str(content).encode("utf-8")),
                },
            })
            return
        if typ == "exec":
            self._json(200, {
                "v": 1, "id": req_id, "type": "result", "ok": True,
                "result": {
                    "exit_code": 0,
                    "stdout": "ok\n",
                    "stderr": "",
                    "timed_out": False,
                },
            })
            return
        self._json(200, {
            "v": 1, "id": req_id, "type": "error", "ok": False,
            "error": {"code": "invalid_request", "message": f"unknown {typ}"},
        })

    def _json(self, status: int, payload: dict) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class SidecarClientTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._httpd = HTTPServer(("127.0.0.1", 0), _Handler)
        cls._port = cls._httpd.server_address[1]
        cls._thread = threading.Thread(target=cls._httpd.serve_forever, daemon=True)
        cls._thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls._httpd.shutdown()

    def _client(self) -> SidecarClient:
        return SidecarClient(
            base_url=f"http://127.0.0.1:{self._port}",
            token="test-token",
        )

    def test_health(self) -> None:
        self.assertEqual(self._client().health()["ok"], True)

    def test_hello_list_read_write_exec(self) -> None:
        c = self._client()
        hello = c.hello()
        self.assertEqual(hello["protocol"], 1)
        listing = c.list_dir("/tmp/demo")
        self.assertEqual(listing["entries"][0]["name"], "a.txt")
        self.assertEqual(c.read_file("/tmp/demo/a.txt")["content"], "hi\n")
        written = c.write_file("/tmp/demo/b.txt", "bye")
        self.assertEqual(written["bytes_written"], 3)
        exe = c.exec(["echo", "ok"], cwd="/tmp/demo")
        self.assertEqual(exe["exit_code"], 0)
        self.assertIn("ok", exe["stdout"])

    def test_unauthorized(self) -> None:
        bad = SidecarClient(base_url=f"http://127.0.0.1:{self._port}", token="nope")
        with self.assertRaises(SidecarClientError) as ctx:
            bad.hello()
        self.assertEqual(ctx.exception.code, "unauthorized")

    def test_client_from_env(self) -> None:
        self.assertIsNone(client_from_env({}))
        c = client_from_env({
            "NOVAAGENT_LOCAL_TOOLS_URL": f"http://127.0.0.1:{self._port}",
            "NOVAAGENT_LOCAL_TOOLS_TOKEN": "test-token",
        })
        assert c is not None
        self.assertTrue(c.health()["ok"])

    def test_client_from_env_sidecar_flag_defaults_url(self) -> None:
        c = client_from_env({
            "NOVAAGENT_LOCAL_TOOLS_SIDECAR": "1",
            "NOVAAGENT_LOCAL_TOOLS_TOKEN": "t",
            "NOVAAGENT_LOCAL_TOOLS_HOST": "127.0.0.1",
            "NOVAAGENT_LOCAL_TOOLS_PORT": "18765",
        })
        assert c is not None
        self.assertEqual(c.base_url, "http://127.0.0.1:18765/")

    def test_client_from_env_gateway_flag_defaults_company_local_url(self) -> None:
        c = client_from_env({
            "NOVAAGENT_CUSTOMER_WORKSPACE_GATEWAY": "1",
            "NOVAAGENT_LOCAL_TOOLS_TOKEN": "t",
        })
        assert c is not None
        self.assertEqual(c.base_url, "http://127.0.0.1:18766/")


if __name__ == "__main__":
    unittest.main()
