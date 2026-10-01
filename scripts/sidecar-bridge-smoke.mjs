#!/usr/bin/env node
/**
 * Phase 2 smoke: start Local Tools Sidecar → exercise SidecarWorkspace
 * (list / read / write / exec) via the Python bridge.
 *
 * Usage:
 *   npm run sidecar:bridge-smoke
 *
 * Requires a Python that can import openhands.sdk (the uv tool install of
 * openhands-agent-server is auto-detected when present).
 */

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const toolsDir = join(repoRoot, "tools");
const sidecarScript = join(repoRoot, "scripts", "local-tools-sidecar.mjs");

const TOKEN = process.env.NOVAAGENT_LOCAL_TOOLS_TOKEN || "phase2-smoke-token";
const HOST = "127.0.0.1";

function findPythonWithSdk() {
  const candidates = [];
  if (process.env.SIDECAR_BRIDGE_PYTHON) {
    candidates.push(process.env.SIDECAR_BRIDGE_PYTHON);
  }
  const uvTool = join(
    homedir(),
    ".local/share/uv/tools/openhands-agent-server/bin/python",
  );
  if (existsSync(uvTool)) candidates.push(uvTool);
  candidates.push("python3", "python");

  for (const bin of candidates) {
    const check = spawnSync(bin, ["-c", "import openhands.sdk; print('ok')"], {
      encoding: "utf8",
    });
    if (check.status === 0 && String(check.stdout).includes("ok")) return bin;
  }
  return null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, HOST, () => {
      const addr = s.address();
      if (!addr || typeof addr === "string") {
        s.close();
        reject(new Error("no port"));
        return;
      }
      const { port } = addr;
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function waitHealth(url, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("health timeout");
}

async function main() {
  const root = mkdtempSync(join(tmpdir(), "sidecar-bridge-smoke-"));
  writeFileSync(join(root, "hello.txt"), "phase2-hello\n", "utf8");

  const port = await freePort();
  const url = `http://${HOST}:${port}`;

  console.log(`[smoke] root=${root}`);
  console.log(`[smoke] sidecar ${url}`);

  const sidecar = spawn(process.execPath, [sidecarScript], {
    env: {
      ...process.env,
      NOVAAGENT_LOCAL_TOOLS_HOST: HOST,
      NOVAAGENT_LOCAL_TOOLS_PORT: String(port),
      NOVAAGENT_LOCAL_TOOLS_TOKEN: TOKEN,
      NOVAAGENT_LOCAL_TOOLS_ROOTS: root,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const cleanup = () => {
    try {
      sidecar.stdout?.destroy();
      sidecar.stderr?.destroy();
      sidecar.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    try {
      if (sidecar.exitCode === null && !sidecar.killed) {
        sidecar.kill("SIGKILL");
      }
    } catch {
      /* ignore */
    }
    rmSync(root, { recursive: true, force: true });
  };

  try {
    await waitHealth(url);
  } catch (err) {
    cleanup();
    throw err;
  }

  const py = findPythonWithSdk();
  if (!py) {
    cleanup();
    console.error(
      "[smoke] No Python with openhands.sdk found.\n" +
        "  Install/run agent-server once (npm run dev) or set SIDECAR_BRIDGE_PYTHON.",
    );
    process.exit(1);
  }

  const smokePy = `
import json, sys
sys.path.insert(0, ${JSON.stringify(toolsDir)})
from sidecar_bridge.workspace import SidecarWorkspace
from sidecar_bridge.client import SidecarClient

client = SidecarClient(base_url=${JSON.stringify(url)}, token=${JSON.stringify(TOKEN)})
ws = SidecarWorkspace(
    working_dir=${JSON.stringify(root)},
    client=client,
    sidecar_roots=[${JSON.stringify(root)}],
)
listing = ws.list_dir()
names = [e["name"] for e in listing.get("entries", [])]
assert "hello.txt" in names, listing
text = ws.read_text("hello.txt")
assert "phase2-hello" in text, text
ws.write_text("from-bridge.txt", "written-via-sidecar\\n")
assert "written-via-sidecar" in ws.read_text("from-bridge.txt")
cmd = ws.execute_command("printf sidecar-exec-ok")
assert cmd.exit_code == 0, cmd
assert "sidecar-exec-ok" in cmd.stdout, cmd
print(json.dumps({"ok": True, "entries": names, "exec": cmd.stdout.strip()}))
`;

  const result = spawnSync(py, ["-c", smokePy], {
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONPATH: toolsDir,
      OPENHANDS_SUPPRESS_BANNER: "1",
    },
  });

  cleanup();

  if (result.status !== 0) {
    console.error("[smoke] Python bridge failed");
    console.error(result.stdout);
    console.error(result.stderr);
    process.exit(result.status || 1);
  }
  console.log("[smoke] OK", result.stdout.trim());
  // Sidecar child stdio can keep the event loop alive after SIGTERM; exit explicitly.
  process.exit(0);
}

main().catch((err) => {
  console.error("[smoke] failed:", err);
  process.exit(1);
});
