#!/usr/bin/env node
/**
 * Local Tools Sidecar — Phase 1 CLI entry.
 *
 * Lightweight Node process: local FS + exec under allowlisted roots.
 * Binds 127.0.0.1 by default. No Python / litellm / agent-server.
 *
 * Env:
 *   NOVAAGENT_LOCAL_TOOLS_HOST   (default 127.0.0.1)
 *   NOVAAGENT_LOCAL_TOOLS_PORT   (default 18765)
 *   NOVAAGENT_LOCAL_TOOLS_TOKEN  (generated if unset)
 *   NOVAAGENT_LOCAL_TOOLS_ROOTS  (colon/comma-separated; default cwd)
 *
 * Usage: node scripts/local-tools-sidecar.mjs
 *    or: npm run sidecar:local-tools
 */

import {
  DEFAULT_LOCAL_TOOLS_HOST,
  DEFAULT_LOCAL_TOOLS_PORT,
  ENV_LOCAL_TOOLS_HOST,
  ENV_LOCAL_TOOLS_PORT,
  ENV_LOCAL_TOOLS_ROOTS,
  ENV_LOCAL_TOOLS_TOKEN,
  LOCAL_TOOLS_PROTOCOL_VERSION,
} from "./local-tools-sidecar/constants.mjs";
import { parseRoots } from "./local-tools-sidecar/paths.mjs";
import { createLocalToolsSidecarServer } from "./local-tools-sidecar/server.mjs";
import { generateToken } from "./local-tools-sidecar/ws.mjs";

export {
  LOCAL_TOOLS_PROTOCOL_VERSION,
  parseRoots,
  createLocalToolsSidecarServer,
  generateToken,
};

export { resolveUnderRoots, isPathInsideRoot } from "./local-tools-sidecar/paths.mjs";
export { parseRequest, makeResult, makeError, REQUEST_TYPES } from "./local-tools-sidecar/protocol.mjs";

function main() {
  const host =
    process.env[ENV_LOCAL_TOOLS_HOST]?.trim() || DEFAULT_LOCAL_TOOLS_HOST;
  const portRaw = process.env[ENV_LOCAL_TOOLS_PORT]?.trim();
  const port = portRaw ? Number(portRaw) : DEFAULT_LOCAL_TOOLS_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(
      `[local-tools-sidecar] Invalid ${ENV_LOCAL_TOOLS_PORT}: ${portRaw}`,
    );
    process.exit(1);
  }

  let token = process.env[ENV_LOCAL_TOOLS_TOKEN]?.trim() || "";
  let generated = false;
  if (!token) {
    token = generateToken();
    generated = true;
  }

  const roots = parseRoots(process.env[ENV_LOCAL_TOOLS_ROOTS]);

  const sidecar = createLocalToolsSidecarServer({
    host,
    port,
    token,
    roots,
  });

  sidecar.listen(() => {
    console.log(
      `[local-tools-sidecar] protocol v${LOCAL_TOOLS_PROTOCOL_VERSION} listening on http://${host}:${port}`,
    );
    console.log(`[local-tools-sidecar] roots: ${roots.join(", ")}`);
    if (generated) {
      console.log(
        `[local-tools-sidecar] generated token (set ${ENV_LOCAL_TOOLS_TOKEN} to pin):\n  ${token}`,
      );
    } else {
      console.log(`[local-tools-sidecar] token: (from ${ENV_LOCAL_TOOLS_TOKEN})`);
    }
    console.log(
      `[local-tools-sidecar] health: GET http://${host}:${port}/health`,
    );
  });

  const shutdown = () => {
    console.log("[local-tools-sidecar] shutting down…");
    sidecar
      .close()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const isDirect =
  process.argv[1] &&
  (process.argv[1].endsWith("local-tools-sidecar.mjs") ||
    process.argv[1].includes("local-tools-sidecar.mjs"));

if (isDirect) {
  main();
}
