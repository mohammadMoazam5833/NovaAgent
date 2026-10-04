/**
 * Resolve a company-managed LLM gateway URL for Hybrid desktop builds.
 *
 * Precedence:
 *   1. Env: NOVAAGENT_COMPANY_LLM_URL
 *   2. Baked pack file (electron/company-llm.json next to main.mjs)
 *   3. Persisted user file (optional path)
 *
 * Throws if a candidate is set but not a valid http(s) URL.
 * Returns null when unset (company-managed mode off).
 */

import { existsSync, readFileSync } from "node:fs";

const ENV_KEYS = ["NOVAAGENT_COMPANY_LLM_URL"];

/**
 * @param {string} raw
 * @param {string} sourceLabel
 * @returns {string}
 */
export function normalizeCompanyLlmUrl(raw, sourceLabel = "URL") {
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
export function readCompanyLlmUrlFromConfigFile(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    throw new Error(
      `Invalid company-llm config at ${filePath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  const raw =
    parsed?.companyLlmUrl ??
    parsed?.url ??
    parsed?.NOVAAGENT_COMPANY_LLM_URL;
  if (raw == null || String(raw).trim() === "") return null;
  return normalizeCompanyLlmUrl(String(raw), filePath);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ bakedConfigPath?: string | null, userConfigPath?: string | null }} [options]
 * @returns {string | null}
 */
export function resolveDesktopCompanyLlmUrl(env = process.env, options = {}) {
  for (const key of ENV_KEYS) {
    const raw = env[key];
    if (raw == null) continue;
    const trimmed = String(raw).trim();
    if (!trimmed) continue;
    return normalizeCompanyLlmUrl(trimmed, key);
  }

  const baked = readCompanyLlmUrlFromConfigFile(options.bakedConfigPath ?? null);
  if (baked) return baked;

  const user = readCompanyLlmUrlFromConfigFile(options.userConfigPath ?? null);
  if (user) return user;

  return null;
}

export const DESKTOP_COMPANY_LLM_ENV_KEYS = ENV_KEYS;
