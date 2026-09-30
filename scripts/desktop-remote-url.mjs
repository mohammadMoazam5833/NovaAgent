/**
 * Resolve a remote UI URL for thin-desktop mode (no local agent-server stack).
 *
 * Precedence:
 *   1. Env: NOVAAGENT_REMOTE_URL, then OH_REMOTE_UI_URL
 *   2. Baked pack file (electron/remote-client.json next to main.mjs)
 *   3. Persisted user file (optional path)
 *
 * Throws if a candidate is set but not a valid http(s) URL.
 */

import { existsSync, readFileSync } from "node:fs";

const ENV_KEYS = ["NOVAAGENT_REMOTE_URL", "OH_REMOTE_UI_URL"];

/**
 * @param {string} raw
 * @param {string} sourceLabel
 * @returns {string}
 */
export function normalizeDesktopRemoteUiUrl(raw, sourceLabel = "URL") {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    throw new Error(`${sourceLabel} is empty`);
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `${sourceLabel} must be a valid URL (got ${JSON.stringify(trimmed)})`,
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `${sourceLabel} must use http: or https: (got ${parsed.protocol})`,
    );
  }

  const path =
    parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
  return `${parsed.origin}${path}${parsed.search}${parsed.hash}`;
}

/**
 * @param {string | null | undefined} filePath
 * @returns {string | null}
 */
export function readRemoteUiUrlFromConfigFile(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    throw new Error(
      `Invalid remote-client config at ${filePath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  const raw = parsed?.remoteUrl ?? parsed?.url ?? parsed?.NOVAAGENT_REMOTE_URL;
  if (raw == null || String(raw).trim() === "") return null;
  return normalizeDesktopRemoteUiUrl(String(raw), filePath);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ bakedConfigPath?: string | null, userConfigPath?: string | null }} [options]
 * @returns {string | null}
 */
export function resolveDesktopRemoteUiUrl(
  env = process.env,
  options = {},
) {
  for (const key of ENV_KEYS) {
    const raw = env[key];
    if (raw == null) continue;
    const trimmed = String(raw).trim();
    if (!trimmed) continue;
    return normalizeDesktopRemoteUiUrl(trimmed, key);
  }

  const baked = readRemoteUiUrlFromConfigFile(options.bakedConfigPath ?? null);
  if (baked) return baked;

  const user = readRemoteUiUrlFromConfigFile(options.userConfigPath ?? null);
  if (user) return user;

  return null;
}

export const DESKTOP_REMOTE_UI_ENV_KEYS = ENV_KEYS;
