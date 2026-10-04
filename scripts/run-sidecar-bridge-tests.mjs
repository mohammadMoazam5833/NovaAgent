#!/usr/bin/env node
/**
 * Run tools/sidecar_bridge Python unit tests with the best available interpreter
 * (uv tool openhands-agent-server python when present, else python3).
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const toolsDir = join(repoRoot, "tools");

function findPython() {
  if (process.env.SIDECAR_BRIDGE_PYTHON) return process.env.SIDECAR_BRIDGE_PYTHON;
  const uvTool = join(
    homedir(),
    ".local/share/uv/tools/openhands-agent-server/bin/python",
  );
  if (existsSync(uvTool)) return uvTool;
  return "python3";
}

const py = findPython();
  const result = spawnSync(
  py,
  ["-m", "unittest", "discover", "-s", "tools/sidecar_bridge/tests", "-v"],
  {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONPATH: toolsDir,
      OPENHANDS_SUPPRESS_BANNER: "1",
    },
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
