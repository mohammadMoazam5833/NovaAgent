#!/usr/bin/env node
/**
 * Pre-download a portable CPython + site-packages for the Electron desktop pack
 * so first launch does not need network access to install openhands-agent-server
 * / openhands-automation via uvx from PyPI.
 *
 * Cross-compile (Linux host → Windows package):
 *   ELECTRON_DOWNLOAD_PLATFORM=win32 ELECTRON_DOWNLOAD_ARCH=x64 \
 *     node scripts/download-python-runtime.mjs
 *
 * Output:
 *   resources/python/          — uv-managed CPython for the target platform
 *   resources/python-env/      — flat site-packages (--target, --no-cache)
 *   resources/python-runtime.json — manifest consumed by electron/main.mjs
 *
 * Runtime spawn (packaged): python.exe -m openhands.agent_server with
 * PYTHONPATH pointing at python-env/ (see buildAgentServerCommand).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const pythonOutDir = join(projectRoot, "resources", "python");
const envOutDir = join(projectRoot, "resources", "python-env");
const manifestPath = join(projectRoot, "resources", "python-runtime.json");

const SHARED_DEFAULTS = JSON.parse(
  readFileSync(join(projectRoot, "config", "defaults.json"), "utf8"),
);

const ALLOWED_PLATFORMS = new Set(["darwin", "linux", "win32"]);
const ALLOWED_ARCHES = new Set(["x64", "arm64"]);

/** CPython minor used for desktop offline packs (matches typical uvx default). */
const PYTHON_MINOR = process.env.OH_BUNDLED_PYTHON_VERSION || "3.12";

function resolveDownloadTarget() {
  const platform = process.env.ELECTRON_DOWNLOAD_PLATFORM || process.platform;
  const arch = process.env.ELECTRON_DOWNLOAD_ARCH || process.arch;
  if (!ALLOWED_PLATFORMS.has(platform)) {
    throw new Error(
      `Unsupported ELECTRON_DOWNLOAD_PLATFORM / platform for python runtime: ${platform}`,
    );
  }
  if (!ALLOWED_ARCHES.has(arch)) {
    throw new Error(
      `Unsupported ELECTRON_DOWNLOAD_ARCH / arch for python runtime: ${arch}`,
    );
  }
  return { platform, arch };
}

/**
 * Map Electron platform/arch → uv python install key + pip --python-platform.
 * Desktop Windows packs are x64 only today (build:desktop:win).
 */
function getPlatformSpec(platform, arch) {
  if (platform === "win32") {
    if (arch !== "x64") {
      throw new Error(`Windows python runtime only supports x64 (got ${arch})`);
    }
    return {
      pythonKey: `cpython-${PYTHON_MINOR}-windows-x86_64-none`,
      pipPlatform: "x86_64-pc-windows-msvc",
      pythonRelPathHint: "python.exe",
    };
  }
  if (platform === "linux") {
    if (arch !== "x64") {
      throw new Error(`Linux python runtime only supports x64 (got ${arch})`);
    }
    return {
      pythonKey: `cpython-${PYTHON_MINOR}-linux-x86_64-gnu`,
      pipPlatform: "x86_64-unknown-linux-gnu",
      pythonRelPathHint: join("bin", "python3"),
    };
  }
  if (platform === "darwin") {
    const uvArch = arch === "arm64" ? "aarch64" : "x86_64";
    return {
      pythonKey: `cpython-${PYTHON_MINOR}-macos-${uvArch}-none`,
      pipPlatform:
        arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin",
      pythonRelPathHint: join("bin", "python3"),
    };
  }
  throw new Error(`Unsupported platform for python runtime: ${platform}`);
}

function findUv() {
  const candidates =
    process.platform === "win32"
      ? ["uv.exe", "uv"]
      : ["uv", join(projectRoot, "resources", "bin", "uv")];
  for (const cmd of candidates) {
    const r = spawnSync(cmd, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return cmd;
  }
  throw new Error(
    "uv not found on PATH. Install uv (https://docs.astral.sh/uv/) before downloading the python runtime.",
  );
}

function runUv(uv, args, env = {}) {
  console.log(`[download-python-runtime] $ ${uv} ${args.join(" ")}`);
  const r = spawnSync(uv, args, {
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    throw new Error(
      `uv exited with code ${r.status}: ${args.join(" ")}\n${r.stderr || r.stdout || ""}`,
    );
  }
  return r;
}

function findPythonExecutable(pythonRoot, hintBasename) {
  /** @type {string[]} */
  const candidates = [];
  const stack = [pythonRoot];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".temp") continue;
        stack.push(full);
        continue;
      }
      // Skip broken symlinks uv leaves for POSIX names on Windows trees
      // (e.g. `python` → missing `python3.12`); prefer real python.exe.
      if (entry.isSymbolicLink() && !existsSync(full)) continue;
      if (
        entry.name === hintBasename ||
        entry.name === "python.exe" ||
        entry.name === "python3" ||
        entry.name === "python"
      ) {
        candidates.push(full);
      }
    }
  }
  // Prefer a real .exe when cross-building Windows from Linux.
  const exe = candidates.find((p) => p.endsWith(".exe") && existsSync(p));
  if (exe) return exe;
  return candidates.find((p) => existsSync(p)) ?? null;
}

function relativeFromResources(absPath) {
  const resourcesRoot = join(projectRoot, "resources");
  if (!absPath.startsWith(resourcesRoot)) {
    throw new Error(`Expected path under resources/: ${absPath}`);
  }
  return absPath.slice(resourcesRoot.length + 1).replace(/\\/g, "/");
}

function buildPackageList() {
  const agentVer = SHARED_DEFAULTS.versions.agentServer;
  const autoVer = SHARED_DEFAULTS.versions.automation;
  const constraints = Object.entries(SHARED_DEFAULTS.constraints ?? {})
    .filter(
      ([key, value]) =>
        !key.startsWith("_") && typeof value === "string" && value.length > 0,
    )
    .map(([, value]) => value);

  return [
    `${SHARED_DEFAULTS.packages.agentServer}==${agentVer}`,
    `openhands-sdk==${agentVer}`,
    `openhands-tools==${agentVer}`,
    `openhands-workspace==${agentVer}`,
    `${SHARED_DEFAULTS.packages.automation}==${autoVer}`,
    // Explicit so uvicorn console entry is always present for automation.
    "uvicorn",
    ...constraints,
  ];
}

function main() {
  const { platform, arch } = resolveDownloadTarget();
  const spec = getPlatformSpec(platform, arch);
  const uv = findUv();
  const packages = buildPackageList();

  console.log(
    `[download-python-runtime] Target ${platform}/${arch} python=${spec.pythonKey}`,
  );
  console.log(
    `[download-python-runtime] Packages: ${packages.join(", ")}`,
  );

  // Wipe prior downloads so a Linux→Windows cross-pack does not leave a
  // host-platform CPython tree beside a Windows one.
  if (existsSync(pythonOutDir)) {
    rmSync(pythonOutDir, { recursive: true, force: true });
  }
  if (existsSync(envOutDir)) {
    rmSync(envOutDir, { recursive: true, force: true });
  }
  mkdirSync(pythonOutDir, { recursive: true });
  mkdirSync(envOutDir, { recursive: true });

  runUv(uv, [
    "python",
    "install",
    spec.pythonKey,
    "--install-dir",
    pythonOutDir,
  ]);

  const pythonExe = findPythonExecutable(
    pythonOutDir,
    platform === "win32" ? "python.exe" : "python3",
  );
  if (!pythonExe || !existsSync(pythonExe)) {
    throw new Error(
      `Installed CPython but could not find interpreter under ${pythonOutDir}`,
    );
  }

  // --no-cache: materialize a self-contained site-packages tree (no hardlinks
  // into the build host's UV_CACHE_DIR). --python-platform selects win/linux
  // wheels while installing from a Linux CI host.
  runUv(
    uv,
    [
      "pip",
      "install",
      "--no-cache",
      "--python-platform",
      spec.pipPlatform,
      "--python-version",
      PYTHON_MINOR,
      "--target",
      envOutDir,
      ...packages,
    ],
    // Keep host UV_CACHE_DIR from polluting / linking into the tree.
    { UV_NO_CACHE: "1" },
  );

  // Sanity: console-script modules must resolve from the target tree.
  if (!existsSync(join(envOutDir, "openhands"))) {
    throw new Error("python-env missing openhands/ package tree");
  }
  if (!existsSync(join(envOutDir, "uvicorn"))) {
    throw new Error("python-env missing uvicorn/");
  }
  const distInfos = readdirSync(envOutDir).filter((n) => n.endsWith(".dist-info"));
  const hasAgent = distInfos.some((n) => n.startsWith("openhands_agent_server-"));
  const hasAuto = distInfos.some((n) => n.startsWith("openhands_automation-"));
  if (!hasAgent) {
    throw new Error("python-env missing openhands_agent_server-*.dist-info");
  }
  if (!hasAuto) {
    throw new Error("python-env missing openhands_automation-*.dist-info");
  }

  const manifest = {
    platform,
    arch,
    pythonMinor: PYTHON_MINOR,
    pythonKey: spec.pythonKey,
    pipPlatform: spec.pipPlatform,
    pythonRelative: relativeFromResources(pythonExe),
    envRelative: "python-env",
    agentServerVersion: SHARED_DEFAULTS.versions.agentServer,
    automationVersion: SHARED_DEFAULTS.versions.automation,
    packages,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  console.log(
    `[download-python-runtime] ✓ Python: ${manifest.pythonRelative}`,
  );
  console.log(`[download-python-runtime] ✓ Env:    ${envOutDir}`);
  console.log(`[download-python-runtime] ✓ Manifest: ${manifestPath}`);
  console.log("[download-python-runtime] Done. Ready for electron-builder.");
}

main();
