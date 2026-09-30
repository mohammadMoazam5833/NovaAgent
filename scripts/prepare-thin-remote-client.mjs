#!/usr/bin/env node
/**
 * Write electron/remote-client.json for thin Client packs.
 *
 * Usage:
 *   NOVAAGENT_REMOTE_URL=https://nova.example.com node scripts/prepare-thin-remote-client.mjs
 *
 * If the env var is unset, writes `{ "remoteUrl": null }` so packaged Client
 * builds still ship a config file and fall back to first-run prompt / userData.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeDesktopRemoteUiUrl } from "./desktop-remote-url.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outPath = join(repoRoot, "electron", "remote-client.json");

const raw =
  process.env.NOVAAGENT_REMOTE_URL?.trim() ||
  process.env.OH_REMOTE_UI_URL?.trim() ||
  "";

let remoteUrl = null;
if (raw) {
  remoteUrl = normalizeDesktopRemoteUiUrl(raw, "NOVAAGENT_REMOTE_URL");
}

const workspaceToken = process.env.NOVAAGENT_WORKSPACE_TOKEN?.trim() || "";

const payload = {
  remoteUrl,
  ...(workspaceToken ? { workspaceToken } : {}),
  bakedAt: new Date().toISOString(),
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(
  remoteUrl
    ? `[thin-client] Baked remote URL → ${outPath}\n  ${remoteUrl}`
    : `[thin-client] No NOVAAGENT_REMOTE_URL set — wrote empty bake to ${outPath} (first-run prompt)`,
);
console.log(
  workspaceToken
    ? `[thin-client] Baked workspace token (customer auth) → ${outPath}`
    : "[thin-client] No NOVAAGENT_WORKSPACE_TOKEN set — no workspace token baked",
);
