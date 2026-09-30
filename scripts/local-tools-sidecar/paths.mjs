/**
 * Path allowlist helpers for the Local Tools Sidecar.
 */

import { realpathSync, existsSync } from "node:fs";
import { resolve, sep, normalize } from "node:path";

/**
 * Parse `NOVAAGENT_LOCAL_TOOLS_ROOTS` (colon- or comma-separated) into absolute roots.
 * Falls back to `[fallbackCwd]` when empty.
 *
 * @param {string | undefined} raw
 * @param {string} [fallbackCwd=process.cwd()]
 * @param {RegExp} [splitRe]
 * @returns {string[]}
 */
export function parseRoots(
  raw,
  fallbackCwd = process.cwd(),
  splitRe = undefined,
) {
  // Windows roots use drive-letter colons (`C:\Users`); split on comma/semicolon
  // there. POSIX still accepts colon- or comma-separated lists.
  const splitter =
    splitRe ?? (process.platform === "win32" ? /[,;]/ : /[,:]/);
  const parts = String(raw ?? "")
    .split(splitter)
    .map((p) => p.trim())
    .filter(Boolean);
  const roots = (parts.length > 0 ? parts : [fallbackCwd]).map((p) =>
    resolve(p),
  );
  // Dedupe while preserving order
  return [...new Set(roots)];
}

/**
 * True when `candidate` is exactly `root` or a path under `root`.
 * Avoids `/home/foo` matching `/home/foobar`.
 *
 * @param {string} candidate Absolute path
 * @param {string} root Absolute root
 */
export function isPathInsideRoot(candidate, root) {
  const c = normalize(candidate);
  const r = normalize(root);
  if (c === r) return true;
  const prefix = r.endsWith(sep) ? r : r + sep;
  return c.startsWith(prefix);
}

/**
 * Resolve `inputPath` (absolute or relative to `cwd`) and ensure it stays under
 * one of `roots`. When the path exists, use realpath to defeat symlink escapes.
 *
 * @param {string} inputPath
 * @param {string[]} roots Absolute allowlisted roots
 * @param {{ cwd?: string, mustExist?: boolean }} [opts]
 * @returns {{ absolute: string, root: string }}
 */
export function resolveUnderRoots(inputPath, roots, opts = {}) {
  if (typeof inputPath !== "string" || inputPath.trim() === "") {
    const err = new Error("path is required");
    err.code = "invalid_request";
    throw err;
  }
  if (!Array.isArray(roots) || roots.length === 0) {
    const err = new Error("no allowlisted roots configured");
    err.code = "path_denied";
    throw err;
  }

  const cwd = opts.cwd ? resolve(opts.cwd) : process.cwd();
  let absolute = resolve(cwd, inputPath);

  // Reject null bytes early
  if (absolute.includes("\0") || inputPath.includes("\0")) {
    const err = new Error("path contains null byte");
    err.code = "path_denied";
    throw err;
  }

  if (existsSync(absolute)) {
    try {
      absolute = realpathSync(absolute);
    } catch {
      // Fall through with resolve() result
    }
  }

  const root = roots.find((r) => {
    let rootAbs = r;
    if (existsSync(r)) {
      try {
        rootAbs = realpathSync(r);
      } catch {
        rootAbs = r;
      }
    }
    return isPathInsideRoot(absolute, rootAbs);
  });

  if (!root) {
    const err = new Error("path escapes allowlisted roots");
    err.code = "path_denied";
    throw err;
  }

  if (opts.mustExist && !existsSync(absolute)) {
    const err = new Error(`path not found: ${absolute}`);
    err.code = "not_found";
    throw err;
  }

  return { absolute, root };
}
