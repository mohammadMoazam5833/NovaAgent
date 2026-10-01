/**
 * Central workspace-scan exclusion policy — automatic by default.
 *
 * Mirrors what VS Code / Cursor do for hang prevention, but Canvas applies
 * it without requiring the user to maintain an ignore file:
 *
 * 1. Built-in name list for dependency/build/cache/ML dump directories.
 * 2. Automatic fat-directory detection: any directory with too many
 *    immediate children is pruned at scan time (no user config).
 * 3. Optional extras from `.gitignore` / `.agentcanvasignore` when present
 *    (reuse, never required).
 * 4. Hard wall-clock timeout on every scan so a miss still cannot hang.
 *
 * All of the above are assembled into one bash script and run as a single
 * agent-server round-trip.
 */

/** Optional Canvas-specific ignore file (never required). */
export const WORKSPACE_IGNORE_FILE = ".agentcanvasignore";

/**
 * Immediate-child count at/above which a directory is treated as "fat"
 * and pruned automatically. Chosen so normal source trees stay intact
 * while `node_modules`-scale dumps are skipped even under unfamiliar names.
 */
export const AUTO_HEAVY_DIR_THRESHOLD = 400;

/** Wall-clock budget for a workspace file listing (seconds). */
export const WORKSPACE_LIST_TIMEOUT_SECONDS = 8;

/** Wall-clock budget for the nested-git probe find (seconds). */
export const WORKSPACE_GIT_PROBE_TIMEOUT_SECONDS = 5;

/**
 * Heavy dependency / build / ML directory names that workspace walks must
 * never descend into. Does **not** include `.git` — nested-repo probes need
 * to discover `.git` entries; file listings add it via
 * {@link WORKSPACE_EXCLUDED_DIRS}.
 */
export const WORKSPACE_HEAVY_DIRS = [
  // JS / frontend
  "node_modules",
  ".next",
  ".nuxt",
  ".turbo",
  ".parcel-cache",
  ".vite",
  // Python
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".tox",
  "site-packages",
  // Build / package outputs
  "dist",
  "build",
  "out",
  "target",
  "coverage",
  // IDE / tool caches
  ".cache",
  ".gradle",
  ".idea",
  // ML / model / dataset dumps (common hang sources)
  "models",
  "checkpoints",
  "weights",
  "datasets",
  "blobs",
  ".huggingface",
  "huggingface",
  ".torch",
  "wandb",
  "mlruns",
] as const;

/**
 * Directories skipped by full workspace file listings (heavy dirs + `.git`).
 */
export const WORKSPACE_EXCLUDED_DIRS = [
  ".git",
  ...WORKSPACE_HEAVY_DIRS,
] as const;

/**
 * Emit bash that seeds a prune-name array from built-in defaults, then
 * appends simple basename lines from optional ignore files when present.
 *
 * Values from ignore files are appended as quoted array elements so they
 * cannot inject shell syntax.
 */
export function buildIgnoreAwarePruneScript(
  varName: string,
  defaultDirs: readonly string[] = WORKSPACE_EXCLUDED_DIRS,
): string {
  const seed = defaultDirs
    .map((dir, i) => (i === 0 ? `-name '${dir}'` : `-o -name '${dir}'`))
    .join(" ");
  return [
    `${varName}=( ${seed} )`,
    `for _oh_ig in '${WORKSPACE_IGNORE_FILE}' '.gitignore'; do`,
    '[ -f "$_oh_ig" ] || continue',
    'while IFS= read -r _oh_p || [ -n "$_oh_p" ]; do',
    "_oh_p=\"${_oh_p%$'\\r'}\"",
    '_oh_p="${_oh_p%/}"',
    'case "$_oh_p" in ""|"#"*|"!"*|*/*|".git") continue ;; esac',
    `${varName}+=( -o -name "$_oh_p" )`,
    'done < "$_oh_ig"',
    "done",
  ].join("\n");
}

/**
 * Emit bash that discovers "fat" directories automatically and appends
 * `-o -path DIR` terms to `pathVar` (paired with an outer `-prune` on the
 * combined name+path group).
 *
 * A directory is fat when it has ≥ {@link AUTO_HEAVY_DIR_THRESHOLD}
 * immediate children. The pass itself skips already-named heavy dirs so
 * the detection walk stays cheap. No user configuration required.
 *
 * `namePrunesVar` must already hold name-based prune tests (from
 * {@link buildIgnoreAwarePruneScript}).
 */
export function buildAutoFatDirDetectionScript(
  namePrunesVar: string,
  pathVar: string,
  threshold: number = AUTO_HEAVY_DIR_THRESHOLD,
): string {
  return [
    `${pathVar}=()`,
    `while IFS= read -r -d '' _oh_d; do`,
    `  _oh_n=$(find "$_oh_d" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l)`,
    `  if [ "$_oh_n" -ge ${threshold} ]; then`,
    `    ${pathVar}+=( -o -path "$_oh_d" )`,
    "  fi",
    `done < <(find . -mindepth 1 -maxdepth 3 \\( "\${${namePrunesVar}[@]}" \\) -prune -o -type d -print0 2>/dev/null)`,
  ].join("\n");
}

/**
 * Run `find <args>` with a hard wall-clock timeout, optionally piping
 * through a suffix like `| sort | head`. Arrays in `findArgs` expand in
 * the current shell (do not wrap in `bash -c`).
 */
export function findWithTimeout(
  findArgs: string,
  seconds: number,
  pipelineSuffix = "",
): string {
  const timed = `timeout ${seconds}s find ${findArgs} 2>/dev/null${pipelineSuffix} || true`;
  const bare = `find ${findArgs} 2>/dev/null${pipelineSuffix}`;
  return [
    `if command -v timeout >/dev/null 2>&1; then`,
    `  ${timed}`,
    `else`,
    `  ${bare}`,
    `fi`,
  ].join("\n");
}

/**
 * Capture `find <args>` stdout into `varName`, with a hard wall-clock timeout.
 */
export function captureFindWithTimeout(
  varName: string,
  findArgs: string,
  seconds: number,
  pipelineSuffix = "",
): string {
  const timed = `${varName}=$(timeout ${seconds}s find ${findArgs} 2>/dev/null${pipelineSuffix} || true)`;
  const bare = `${varName}=$(find ${findArgs} 2>/dev/null${pipelineSuffix})`;
  return [
    `if command -v timeout >/dev/null 2>&1; then`,
    `  ${timed}`,
    `else`,
    `  ${bare}`,
    `fi`,
  ].join("\n");
}
