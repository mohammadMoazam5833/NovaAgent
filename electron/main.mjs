/**
 * Electron Main Process — NovaAgent Desktop
 *
 * Starts the full NovaAgent stack (agent-server + automation via uvx,
 * static frontend, ingress proxy), then opens a native BrowserWindow once
 * the ingress is ready. Shows a loading screen while backends start.
 *
 * Path layout (electron-builder uses directories.app: 'electron'):
 *
 *   Packaged (macOS example):
 *     Contents/Resources/app/     ← __dirname (main.mjs lives here)
 *       main.mjs
 *       loading.html
 *       scripts/                  ← copied from repo scripts/
 *       config/                   ← copied from repo config/
 *       build/                    ← static frontend
 *     Contents/Resources/bin/     ← process.resourcesPath/bin
 *       uv  uvx                   ← bundled via extraResources
 *
 *   Dev (npm run desktop  →  electron electron/main.mjs):
 *     electron/main.mjs           ← __dirname = <repo>/electron/
 *     scripts/ config/ build/     ← one level up: <repo>/
 *     system uvx from PATH
 *
 * When packaged, scripts/config/build are siblings of main.mjs so
 * projectRoot === __dirname. In dev they are one level up.
 */

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  shell,
} from "electron";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Linux packaged (AppImage / .deb): Chromium's SUID sandbox helper is often
// unusable — AppImage mounts are FUSE-backed, and VMs (esp. VMware without 3D)
// fail chrome-sandbox ownership checks.
//
// NOTE: appendSwitch alone is NOT enough on Ubuntu 24 AppImage — Chromium
// can abort on chrome-sandbox *before* this JS runs. Packaging also:
//   1) deletes chrome-sandbox in afterPack
//   2) wraps the binary / launcher with --no-sandbox on argv
// These switches remain as a belt-and-suspenders for renderer children.
const isLinuxPackagedRuntime =
  process.platform === "linux" &&
  (app.isPackaged ||
    Boolean(process.env.APPIMAGE) ||
    Boolean(process.env.APPDIR));
if (isLinuxPackagedRuntime) {
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-setuid-sandbox");
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-software-rasterizer");
  app.disableHardwareAcceleration();
}

// ── Path resolution ───────────────────────────────────────────────────────────
// Packaged (directories.app: 'electron'): scripts/config/build are SIBLINGS of
// main.mjs inside Resources/app/, so projectRoot === __dirname.
// Dev (electron electron/main.mjs): those directories are one level UP in the
// repo root, so projectRoot === join(__dirname, '..').

const projectRoot = app.isPackaged ? __dirname : join(__dirname, "..");
const buildDir = join(projectRoot, "build");
const scriptsDir = join(projectRoot, "scripts");

const { resolveDesktopRemoteUiUrl, normalizeDesktopRemoteUiUrl } =
  await import(
    pathToFileURL(join(scriptsDir, "desktop-remote-url.mjs")).href
  );

const { resolveDesktopCompanyLlmUrl } = await import(
  pathToFileURL(join(scriptsDir, "desktop-company-llm-url.mjs")).href
);

/** Opt-in Local Tools Sidecar child (NOVAAGENT_LOCAL_TOOLS_SIDECAR=1). */
let localToolsSidecarChild = null;
let customerWorkspaceClientChild = null;

/**
 * Spawn the lightweight Node local-tools sidecar and share URL/token with
 * the agent-server bridge. Full desktop: opt-in via NOVAAGENT_LOCAL_TOOLS_SIDECAR=1.
 * Thin Client always starts it (local FS/shell) plus the reverse WS client.
 * See docs/LOCAL_TOOLS_SIDECAR.md.
 */
function maybeStartLocalToolsSidecar(options = {}) {
  const force = Boolean(options.force);
  if (!force && process.env.NOVAAGENT_LOCAL_TOOLS_SIDECAR !== "1") return;
  if (localToolsSidecarChild) return;

  const script = join(scriptsDir, "local-tools-sidecar.mjs");
  if (!existsSync(script)) {
    console.warn(
      "[desktop] local tools sidecar script missing:",
      script,
    );
    return;
  }

  if (options.roots && !process.env.NOVAAGENT_LOCAL_TOOLS_ROOTS) {
    process.env.NOVAAGENT_LOCAL_TOOLS_ROOTS = options.roots;
  }

  // Ensure agent-server bridge env is set before startStack() inherits process.env.
  if (
    !process.env.NOVAAGENT_LOCAL_TOOLS_TOKEN &&
    process.env.NOVAAGENT_CUSTOMER_WORKSPACE_TOKEN
  ) {
    process.env.NOVAAGENT_LOCAL_TOOLS_TOKEN =
      process.env.NOVAAGENT_CUSTOMER_WORKSPACE_TOKEN;
  }
  if (!process.env.NOVAAGENT_LOCAL_TOOLS_TOKEN) {
    process.env.NOVAAGENT_LOCAL_TOOLS_TOKEN = randomBytes(24).toString("hex");
  }
  const host = process.env.NOVAAGENT_LOCAL_TOOLS_HOST || "127.0.0.1";
  const port = process.env.NOVAAGENT_LOCAL_TOOLS_PORT || "18765";
  if (!process.env.NOVAAGENT_LOCAL_TOOLS_URL) {
    process.env.NOVAAGENT_LOCAL_TOOLS_URL = `http://${host}:${port}`;
  }

  console.log("[desktop] Starting local tools sidecar…");
  console.log(
    `[desktop] Sidecar URL=${process.env.NOVAAGENT_LOCAL_TOOLS_URL} roots=${process.env.NOVAAGENT_LOCAL_TOOLS_ROOTS || "(cwd)"}`,
  );
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
  const child = spawn(process.execPath, [script], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  localToolsSidecarChild = child;

  const forward = (level) => (chunk) => {
    const line = String(chunk).trimEnd();
    if (!line) return;
    if (level === "error") console.error(`[local-tools-sidecar] ${line}`);
    else console.log(`[local-tools-sidecar] ${line}`);
  };
  child.stdout?.on("data", forward("info"));
  child.stderr?.on("data", forward("error"));
  child.on("exit", (code, signal) => {
    if (localToolsSidecarChild === child) localToolsSidecarChild = null;
    console.log(
      `[desktop] local tools sidecar exited (code=${code}, signal=${signal})`,
    );
  });
}

function startCustomerWorkspaceReverseClient(remoteUiUrl) {
  if (customerWorkspaceClientChild) return;
  const script = join(scriptsDir, "customer-workspace-client.mjs");
  if (!existsSync(script)) {
    console.warn("[desktop] customer-workspace-client.mjs missing:", script);
    return;
  }
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NOVAAGENT_REMOTE_URL: remoteUiUrl,
  };
  console.log(
    `[desktop] Starting customer workspace reverse client → ${remoteUiUrl}/customer-workspace`,
  );
  const child = spawn(process.execPath, [script], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  customerWorkspaceClientChild = child;
  const forward = (level) => (chunk) => {
    const line = String(chunk).trimEnd();
    if (!line) return;
    if (level === "error") {
      console.error(`[customer-workspace-client] ${line}`);
    } else {
      console.log(`[customer-workspace-client] ${line}`);
    }
  };
  child.stdout?.on("data", forward("info"));
  child.stderr?.on("data", forward("error"));
  child.on("exit", (code, signal) => {
    if (customerWorkspaceClientChild === child) {
      customerWorkspaceClientChild = null;
    }
    console.log(
      `[desktop] customer workspace client exited (code=${code}, signal=${signal})`,
    );
  });
}

function stopLocalToolsSidecar() {
  const child = localToolsSidecarChild;
  if (!child || child.killed) return;
  localToolsSidecarChild = null;
  try {
    child.kill("SIGTERM");
  } catch (err) {
    console.warn("[desktop] Failed to stop local tools sidecar:", err);
  }
}

function stopCustomerWorkspaceReverseClient() {
  const child = customerWorkspaceClientChild;
  if (!child || child.killed) return;
  customerWorkspaceClientChild = null;
  try {
    child.kill("SIGTERM");
  } catch (err) {
    console.warn("[desktop] Failed to stop customer workspace client:", err);
  }
}

function isThinClientPack() {
  if (process.env.NOVAAGENT_THIN_CLIENT === "1") return true;
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "package.json"), "utf8"),
    );
    return pkg.name === "novaagent-client";
  } catch {
    return false;
  }
}

function getThinClientConfigPaths() {
  return {
    bakedConfigPath: join(__dirname, "remote-client.json"),
    userConfigPath: join(app.getPath("userData"), "remote-client.json"),
  };
}

function getCompanyLlmConfigPaths() {
  return {
    bakedConfigPath: join(__dirname, "company-llm.json"),
    userConfigPath: join(app.getPath("userData"), "company-llm.json"),
  };
}

/**
 * Ensure NOVAAGENT_COMPANY_LLM_URL is set for the child launcher (static-server
 * injects it into the SPA). Full Hybrid desktop only — never enables thin client.
 */
function applyCompanyLlmUrlFromEnvOrBake() {
  const { bakedConfigPath, userConfigPath } = getCompanyLlmConfigPaths();
  try {
    const resolved = resolveDesktopCompanyLlmUrl(process.env, {
      bakedConfigPath,
      userConfigPath,
    });
    if (resolved) {
      process.env.NOVAAGENT_COMPANY_LLM_URL = resolved;
      console.log(`[desktop] Company LLM gateway → ${resolved}`);
    }
  } catch (err) {
    dialog.showErrorBox(
      "Invalid company LLM URL",
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }
}

/**
 * First-run prompt for NovaAgent Client when no server URL is baked/persisted.
 * @returns {Promise<string | null>} normalized URL, or null if the user quits
 */
function promptForRemoteUiUrl() {
  return new Promise((resolve) => {
    const promptWin = new BrowserWindow({
      width: 520,
      height: 420,
      resizable: false,
      maximizable: false,
      show: false,
      backgroundColor: "#0b0e14",
      title: "NovaAgent Client",
      icon: appIconPath,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    const onMessage = (_event, payload) => {
      if (!payload || typeof payload !== "object") return;
      if (payload.action === "quit") {
        ipcMain.removeListener("thin-remote-url-prompt", onMessage);
        resolve(null);
        promptWin.destroy();
        return;
      }
      if (payload.action === "save" && typeof payload.url === "string") {
        try {
          const normalized = normalizeDesktopRemoteUiUrl(
            payload.url,
            "Server URL",
          );
          ipcMain.removeListener("thin-remote-url-prompt", onMessage);
          resolve(normalized);
          promptWin.destroy();
        } catch (err) {
          promptWin.webContents.executeJavaScript(
            `document.getElementById("error").textContent = ${JSON.stringify(
              err instanceof Error ? err.message : String(err),
            )}`,
          );
        }
      }
    };

    ipcMain.on("thin-remote-url-prompt", onMessage);
    promptWin.loadFile(join(__dirname, "remote-url-prompt.html"));
    promptWin.once("ready-to-show", () => promptWin.show());
    promptWin.on("closed", () => {
      ipcMain.removeListener("thin-remote-url-prompt", onMessage);
      resolve(null);
    });
  });
}


/**
 * POST <remoteUiUrl>/api/auth/login from the main process (no CORS concerns).
 * @returns {Promise<{ token: string, customer: string }>}
 */
async function loginToWorkspaceServer(remoteUiUrl, username, password) {
  const u = new URL("/api/auth/login", remoteUiUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(u, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok || typeof data.token !== "string") {
      throw new Error(data?.error || `login failed (HTTP ${res.status})`);
    }
    return { token: data.token, customer: data.customer };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * First-run login prompt: the customer enters username/password, the main
 * process exchanges them for a workspace token and persists it in the
 * userData remote-client.json. Called only when no token is available yet.
 * @returns {Promise<string | null>} workspace token, or null if cancelled
 */
function promptForWorkspaceLogin(remoteUiUrl) {
  return new Promise((resolve) => {
    const loginWin = new BrowserWindow({
      width: 520,
      height: 480,
      resizable: false,
      maximizable: false,
      show: false,
      backgroundColor: "#0b0e14",
      title: "NovaAgent Client",
      icon: appIconPath,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    const showError = (message) => {
      loginWin.webContents.executeJavaScript(
        `document.getElementById("error").textContent = ${JSON.stringify(message)};
         const b = document.getElementById("save"); if (b) b.disabled = false;`,
      );
    };

    const onMessage = async (_event, payload) => {
      if (!payload || typeof payload !== "object") return;
      if (payload.action === "quit") {
        ipcMain.removeListener("thin-login-prompt", onMessage);
        resolve(null);
        loginWin.destroy();
        return;
      }
      if (payload.action === "save") {
        const username =
          typeof payload.username === "string" ? payload.username.trim() : "";
        const password =
          typeof payload.password === "string" ? payload.password : "";
        if (!username || !password) {
          showError("Username and password are required.");
          return;
        }
        loginWin.webContents.executeJavaScript(
          `document.getElementById("error").textContent = "Signing in...";
           document.getElementById("save").disabled = true;`,
        );
        try {
          const { token, customer } = await loginToWorkspaceServer(
            remoteUiUrl,
            username,
            password,
          );
          ipcMain.removeListener("thin-login-prompt", onMessage);
          console.log(
            `[desktop] logged in as '${username}' (customer: ${customer})`,
          );
          resolve(token);
          loginWin.destroy();
        } catch (err) {
          showError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    ipcMain.on("thin-login-prompt", onMessage);
    loginWin.loadFile(join(__dirname, "login-prompt.html"));
    loginWin.once("ready-to-show", () => loginWin.show());
    loginWin.on("closed", () => {
      ipcMain.removeListener("thin-login-prompt", onMessage);
      resolve(null);
    });
  });
}

function saveWorkspaceTokenToUserConfig(userConfigPath, token) {
  let cfg = {};
  try {
    cfg = JSON.parse(readFileSync(userConfigPath, "utf8"));
  } catch {
    cfg = {};
  }
  cfg.workspaceToken = token;
  writeFileSync(userConfigPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
}

function readWorkspaceTokenFromConfig() {
  try {
    const { bakedConfigPath, userConfigPath } = getThinClientConfigPaths();
    for (const p of [userConfigPath, bakedConfigPath]) {
      try {
        if (!existsSync(p)) continue;
        const cfg = JSON.parse(readFileSync(p, "utf8"));
        const t = String(cfg.workspaceToken || "").trim();
        if (t) return t;
      } catch {
        // ignore malformed config files
      }
    }
  } catch {
    // config paths unavailable
  }
  return "";
}

let registryForwarderServer = null;

/**
 * Thin-client helper: the packaged UI seeds its backend registry as
 * http://127.0.0.1:<DESKTOP_INGRESS_PORT>. Forward that loopback port to the
 * remote ingress so version checks and API calls reach the company backend
 * without per-machine manual setup.
 */
function startRegistryForwarder(remoteUiUrl) {
  if (registryForwarderServer) return;
  try {
    const u = new URL(remoteUiUrl);
    const port = Number(u.port) || 80;
    registryForwarderServer = net.createServer((client) => {
      const upstream = net.connect(port, u.hostname);
      client.pipe(upstream);
      upstream.pipe(client);
      const kill = () => {
        try { client.destroy(); } catch {}
        try { upstream.destroy(); } catch {}
      };
      client.on("error", kill);
      upstream.on("error", kill);
    });
    registryForwarderServer.on("error", (err) => {
      console.warn(
        `[desktop] registry forwarder 127.0.0.1:${DESKTOP_INGRESS_PORT} unavailable: ${err.message}`,
      );
      registryForwarderServer = null;
    });
    registryForwarderServer.listen(DESKTOP_INGRESS_PORT, "127.0.0.1", () => {
      console.log(
        `[desktop] registry forwarder 127.0.0.1:${DESKTOP_INGRESS_PORT} -> ${u.host}`,
      );
    });
  } catch (err) {
    console.warn("[desktop] registry forwarder failed:", err?.message || err);
  }
}

// MULTI-TENANT: the UI load carries the workspace token so the ingress
// binds the page (and its API calls) to the right customer agent-server.
function withTenantToken(url) {
  try {
    const t = readWorkspaceTokenFromConfig();
    if (!t) return url;
    const u = new URL(url);
    u.searchParams.set("t", t);
    return u.toString();
  } catch {
    return url;
  }
}

async function openThinClientWindow(remoteUiUrl) {
  console.log(`[desktop] Thin client mode → ${remoteUiUrl}`);
  if (!process.env.NOVAAGENT_LOCAL_TOOLS_TOKEN) {
    const t = readWorkspaceTokenFromConfig();
    if (t) process.env.NOVAAGENT_LOCAL_TOOLS_TOKEN = t;
  }
  startRegistryForwarder(remoteUiUrl);
  const homeRoot = process.env.NOVAAGENT_LOCAL_TOOLS_ROOTS || homedir();
  maybeStartLocalToolsSidecar({ force: true, roots: homeRoot });
  startCustomerWorkspaceReverseClient(remoteUiUrl);
  createLoadingWindow();
  suppressQuitOnAllWindowsClosed = false;
  setBootPhase("Opening remote NovaAgent…");
  try {
    await waitForUrl(remoteUiUrl, 60_000);
    setBootPhase("Ready.");
    createMainWindow(withTenantToken(remoteUiUrl));
  } catch (err) {
    const summary =
      (err instanceof Error ? err.message : String(err)) +
      `\n\nCould not reach ${remoteUiUrl}. Check the URL, VPN, and that the remote stack is up.`;
    console.error("[desktop] Remote UI failed:", err);
    appendBootLog("desktop", summary, "error");
    if (showStartupFailure(summary)) return;
    dialog.showErrorBox("NovaAgent Client failed to start", summary);
    app.quit();
  }
}

// Prefer 127.0.0.1 over localhost for the BrowserWindow origin.
// Packaged/static builds often seed the backend registry as
// http://127.0.0.1:<ingress> (Vite .env / launcher defaults). Loading
// http://localhost:8000 makes the page a *different origin* than that
// host, so Axios/fetch fail with opaque "Network Error" / CORS and the UI
// shows ERROR$CORS_OR_NETWORK ("Disconnected (check URL or network)…")
// while `npm run dev` in a normal browser stays same-origin and works.
// Respect PORT so company/hybrid runs (PORT=18200) wait on the real
// ingress — not a hardcoded 8000 that may belong to another service (LLM).
const DESKTOP_INGRESS_PORT = (() => {
  const raw = process.env.PORT;
  const n = raw != null && raw !== "" ? Number.parseInt(String(raw), 10) : 8000;
  return Number.isFinite(n) && n > 0 ? n : 8000;
})();
const DESKTOP_UI_ORIGIN = `http://127.0.0.1:${DESKTOP_INGRESS_PORT}`;
const DESKTOP_SERVER_INFO_URL = `${DESKTOP_UI_ORIGIN}/server_info`;

// 1024×1024 NovaAgent app icon. Used as the BrowserWindow.icon option for
// the Linux taskbar and the Windows title bar / taskbar. On macOS the dock
// icon comes from the .app bundle's icon.icns (generated by electron-builder
// from this same PNG), so this path is unused there.
// In dev mode (`npm run desktop`), __dirname is <repo>/electron and the file
// lives next to main.mjs. In a packaged build, electron-builder copies
// build-resources/icon.png into Resources/app/ via the `files:` array.
const appIconPath = join(__dirname, "build-resources", "icon.png");

// ------------------------------------------------------------------
// Main-process file logging + crash diagnostics (support aid).
// Writes to <tmpdir>/novaagent-main.log so failures are visible even
// when the app is launched from a shortcut without a console.
// ------------------------------------------------------------------
import { appendFileSync as _appendLog } from "node:fs";
import { tmpdir as _tmpdir } from "node:os";
const MAIN_LOG_FILE = join(_tmpdir(), "novaagent-main.log");
function _writeMainLog(level, args) {
  try {
    _appendLog(
      MAIN_LOG_FILE,
      `[${new Date().toISOString()}] [${level}] ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}\n`,
    );
  } catch {
    // ignore logging failures
  }
}
const _origConsoleLog = console.log.bind(console);
const _origConsoleError = console.error.bind(console);
console.log = (...args) => {
  _writeMainLog("log", args);
  _origConsoleLog(...args);
};
console.error = (...args) => {
  _writeMainLog("err", args);
  _origConsoleError(...args);
};
process.on("uncaughtException", (err) => {
  _writeMainLog("UNCAUGHT", [err?.stack || String(err)]);
  process.exit(101);
});
process.on("unhandledRejection", (reason) => {
  _writeMainLog("UNHANDLED", [reason?.stack || String(reason)]);
  process.exit(102);
});
console.log(`[desktop] main log file: ${MAIN_LOG_FILE}`);

// ── Bundled uv ────────────────────────────────────────────────────────────────

/**
 * Inject the bundled offline Python runtime (CPython + site-packages) so
 * agent-server / automation start without uvx hitting PyPI.
 * No-op in dev mode or when the download-python-runtime step was skipped.
 */
function injectBundledPythonRuntime() {
  if (!app.isPackaged) return;

  const resources = process.resourcesPath;
  const manifestPath = join(resources, "python-runtime.json");
  const envDir = join(resources, "python-env");

  if (!existsSync(manifestPath) || !existsSync(envDir)) {
    console.warn(
      "[desktop] Bundled python runtime not found — falling back to uvx " +
        "(first launch may download from PyPI). Run " +
        "`npm run download-python-runtime` before packaging for offline packs.",
    );
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    console.warn("[desktop] Failed to read python-runtime.json:", err);
    return;
  }

  const pythonExe = join(resources, manifest.pythonRelative);
  if (!existsSync(pythonExe)) {
    console.warn("[desktop] Bundled python interpreter missing at", pythonExe);
    return;
  }

  process.env.OH_BUNDLED_PYTHON = pythonExe;
  process.env.OH_BUNDLED_PYTHON_ENV = envDir;
  process.env.UV_PYTHON = pythonExe;
  process.env.UV_PYTHON_INSTALL_DIR = join(resources, "python");
  process.env.UV_OFFLINE = "1";
  process.env.UV_PYTHON_DOWNLOADS = "never";
  console.log("[desktop] Injected bundled Python runtime from", envDir);
}

/**
 * Inject the bundled uv binary into PATH so that uvx calls inside
 * dev-with-automation.mjs resolve to our bundled binary.
 * No-op in dev mode (falls back to system uv).
 */
function injectBundledUv() {
  if (!app.isPackaged) return;

  const isWin = process.platform === "win32";
  const uvName = isWin ? "uv.exe" : "uv";
  const uvxName = isWin ? "uvx.exe" : "uvx";
  const binDir = join(process.resourcesPath, "bin");
  const uvPath = join(binDir, uvName);

  // We only probe for `uv` here — `uv` and `uvx` ship together in the
  // bundle (`download-uv.mjs` writes both), so if `uv` is present we
  // assume `uvx` is too. `uvxAvailable()` is called separately by
  // start-up code to confirm the resolved binary actually runs.
  if (!existsSync(uvPath)) {
    console.warn("[desktop] Bundled uv not found at", uvPath);
    return;
  }

  // electron-builder copies files without preserving the +x bit on Unix.
  if (!isWin) {
    try {
      chmodSync(uvPath, 0o755);
      const uvxPath = join(binDir, uvxName);
      if (existsSync(uvxPath)) chmodSync(uvxPath, 0o755);
    } catch {}
  }

  const sep = isWin ? ";" : ":";
  process.env.PATH = `${binDir}${sep}${process.env.PATH ?? ""}`;
  console.log("[desktop] Injected bundled uv from", binDir);
}

/**
 * Verify uvx is reachable (either bundled or system).
 * Returns true/false — callers show a dialog on false.
 */
function uvxAvailable() {
  const cmd = process.platform === "win32" ? "uvx.exe" : "uvx";
  const r = spawnSync(cmd, ["--version"], { stdio: "pipe" });
  return r.status === 0;
}

/**
 * Inject the bundled Node.js distribution into PATH so subsequent spawns
 * can find `node`, `npm`, and `npx`.
 *
 * When the app runs as a packaged .app on macOS, the system PATH is minimal
 * (/usr/bin:/bin only) — Homebrew, nvm, asdf etc. installs of Node are
 * invisible. Two breakages flow from that:
 *
 *   1. The dev-with-automation.mjs stack spawns `node scripts/ingress.mjs`
 *      and `node scripts/static-server.mjs`; if `node` is not found those
 *      processes fail silently and port 8000 never responds.
 *   2. Most stdio MCP marketplace entries (Slack, GitHub, Figma, etc.)
 *      use `command: "npx"`. When the agent-server tries to spawn one the
 *      missing `npx` makes the spawn fail with ENOENT; the SDK reports it
 *      as an `error_kind: "connection"` MCP test failure, surfaced in the
 *      install modal as "Could not reach the server".
 *
 * We tried bridging via Electron-as-Node (ELECTRON_RUN_AS_NODE=1) wrappers
 * first. That fixed the ENOENT but introduced a new failure: stdio MCP
 * servers spawned through the wrapper exited with "McpError: Connection
 * closed" before the JSON-RPC handshake completed. Electron-as-Node is
 * fine for our networking helper scripts but its stdin/stdout semantics
 * differ enough from a vanilla `node` binary that stdio JSON-RPC servers
 * are not reliable under it. The robust fix is to ship a real Node.js
 * runtime as an extraResource (see scripts/download-node.mjs and the
 * `resources/node/` entry in electron-builder.config.mjs) and just put
 * its bin dir on PATH.
 *
 * No-op in dev mode (`npm run desktop`): the user's terminal PATH already
 * has Node tooling and `app.isPackaged` is false. If the bundled dir is
 * somehow missing (e.g. the download step was skipped during packaging),
 * we log a loud warning and leave PATH untouched so the failure mode is
 * obvious in the console rather than confusing downstream.
 */
function injectBundledNode() {
  if (!app.isPackaged) return;

  const isWin = process.platform === "win32";
  const nodeRoot = join(process.resourcesPath, "node");
  // POSIX Node distributions put binaries in bin/; Windows zips put node.exe
  // and the npm.cmd / npx.cmd wrappers at the distribution root.
  const binDir = isWin ? nodeRoot : join(nodeRoot, "bin");
  const nodeExe = isWin ? join(nodeRoot, "node.exe") : join(binDir, "node");

  if (!existsSync(nodeExe)) {
    console.warn(
      `[desktop] Bundled Node.js not found at ${nodeExe} — backend ` +
        "scripts and stdio MCP servers will fail. Run `npm run download-node` " +
        "and rebuild.",
    );
    return;
  }

  // electron-builder doesn't always preserve the +x bit on POSIX. node, npm,
  // and npx need to be executable for shell PATH lookup to consider them.
  if (!isWin) {
    const required = ["node", "npm", "npx"];
    for (const name of required) {
      const p = join(binDir, name);
      try {
        if (existsSync(p)) chmodSync(p, 0o755);
      } catch {
        // best-effort: a stale read-only mount or test fixture is fine to skip
      }
    }
  }

  const sep = isWin ? ";" : ":";
  process.env.PATH = `${binDir}${sep}${process.env.PATH ?? ""}`;
  console.log("[desktop] Injected bundled Node from", binDir);
}

// ── Readiness polling ─────────────────────────────────────────────────────────

/**
 * Wait until `url` responds at all (status < 500). Used to confirm the
 * ingress proxy is bound — not a guarantee that the agent-server behind it
 * is ready. Use {@link waitForAgentServer} for that.
 */
async function waitForUrl(url, timeoutMs = 120_000, intervalMs = 600) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Timed out waiting for ${url} to become ready (${timeoutMs / 1000}s).`,
  );
}

/**
 * Wait until `url` returns HTTP 200 — meaning the agent-server itself is
 * serving requests, not just that the ingress proxy is up.
 *
 * On first launch, `uvx` has to download a Python toolchain and install
 * `openhands-agent-server` and its workspace deps from PyPI, which can
 * easily take a few minutes on a slow network. We poll the route end-to-end
 * (through ingress on port 8000, so a missing or restarted ingress is also
 * caught) instead of just probing the static-server fallback that
 * `waitForUrl` would accept.
 */
async function waitForAgentServer(
  url = DESKTOP_SERVER_INFO_URL,
  timeoutMs = 10 * 60_000,
  intervalMs = 1_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      // Only 200 is success here. 502 from ingress means the upstream agent
      // server isn't bound yet; 401 means auth is required and the bundled
      // key didn't reach us — we still treat that as "the agent server is
      // up", because the proxy got a real HTTP response from it.
      if (res.status === 200 || res.status === 401) return;
    } catch {
      // Transient network / DNS / timeout — keep polling until the deadline.
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Agent server at ${url} never came up (${Math.round(timeoutMs / 1000)}s). ` +
      "Check the terminal log for errors from uvx / the agent-server process.",
  );
}

// ── Windows ───────────────────────────────────────────────────────────────────

let loadingWin = null;
let mainWin = null;

// Collapsed splash size — loading.html's .container height must match. The
// expanded height reveals the startup-log console below it ("Show details").
const LOADING_WIN_WIDTH = 460;
const LOADING_WIN_HEIGHT = 360;
const LOADING_WIN_EXPANDED_HEIGHT = 560;

/**
 * Grow or shrink the loading window to reveal/hide the startup-log console.
 * Keeps the top edge fixed so the splash content doesn't jump. Invoked from
 * the renderer ("Show details" toggle) and from showStartupFailure().
 */
function setLoadingWindowExpanded(expanded) {
  if (!loadingWin || loadingWin.isDestroyed()) return;
  const bounds = loadingWin.getBounds();
  const height = expanded ? LOADING_WIN_EXPANDED_HEIGHT : LOADING_WIN_HEIGHT;
  if (bounds.height === height) return;
  // macOS ignores programmatic resizes of resizable:false windows on some
  // Electron versions — lift the flag around the change.
  loadingWin.setResizable(true);
  loadingWin.setBounds({ ...bounds, height }, true);
  loadingWin.setResizable(false);
}

function createLoadingWindow() {
  loadingWin = new BrowserWindow({
    width: LOADING_WIN_WIDTH,
    // Tall enough to fit the streaming status line + the "first launch can
    // take a few minutes" hint without scrollbars.
    height: LOADING_WIN_HEIGHT,
    resizable: false,
    frame: false,
    center: true,
    show: false,
    // Pre-paint window color; must match --oh-background in loading.html.
    backgroundColor: "#0b0e14",
    icon: appIconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Bridges the startup-log console over IPC (see preload.cjs).
      preload: join(__dirname, "preload.cjs"),
    },
  });

  // The renderer can only receive IPC once the page has loaded — replay the
  // lines buffered until now, then stream live batches (see appendBootLog).
  loadingWin.webContents.on("did-finish-load", () => {
    if (!loadingWin || loadingWin.isDestroyed()) return;
    clearTimeout(bootLogFlushTimer);
    bootLogFlushTimer = null;
    bootLogPending = [];
    if (bootLog.length) {
      loadingWin.webContents.send("boot-log:batch", bootLog.slice());
    }
    bootLogReady = true;
    if (fatalSummary) {
      loadingWin.webContents.send("boot-log:fatal", fatalSummary);
    }
  });

  loadingWin.loadFile(join(__dirname, "loading.html"));
  loadingWin.once("ready-to-show", () => loadingWin?.show());
}

function createMainWindow(uiOrigin = DESKTOP_UI_ORIGIN) {
  mainWin = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    // App-shell background (--oh-background in src/index.css) — avoids white
    // flashes during the show → maximize repaint after the splash closes.
    backgroundColor: "#0b0e14",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    icon: appIconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWin.loadURL(uiOrigin);

  mainWin.once("ready-to-show", () => {
    loadingWin?.destroy();
    loadingWin = null;
    mainWin?.show();
    mainWin?.maximize();
  });

  // Route window.open() calls appropriately.
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    // The "Login with OpenHands Cloud" device-flow opens about:blank immediately
    // on the user's click (to beat popup blockers), then navigates the popup to
    // the OAuth verification URL once it has one.  We must allow about:blank
    // through so window.open() returns a non-null WindowProxy; the did-create-window
    // handler below redirects the popup to the system browser when it navigates.
    if (url === "about:blank") {
      return {
        action: "allow",
        overrideBrowserWindowOptions: { width: 800, height: 700 },
      };
    }
    // All other external URLs open directly in the system browser.
    if (
      !url.startsWith("http://localhost") &&
      !url.startsWith("http://127.0.0.1")
    ) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // When the renderer opens a popup (the about:blank above), watch for its
  // first navigation away from about:blank.  That navigation will be to the
  // OAuth verification URL — open it in the system browser and close the
  // now-unneeded Electron popup.
  mainWin.webContents.on("did-create-window", (popupWin) => {
    popupWin.webContents.on("will-navigate", (_event, url) => {
      if (
        url !== "about:blank" &&
        !url.startsWith("http://localhost") &&
        !url.startsWith("http://127.0.0.1")
      ) {
        _event.preventDefault();
        shell.openExternal(url);
        popupWin.close();
      }
    });
  });

  mainWin.on("closed", () => {
    mainWin = null;
  });
}

// ── Startup log buffer ────────────────────────────────────────────────────────
//
// Every service log line (all services, all levels, sanitized) is kept in a
// bounded buffer and streamed to the loading window's console in batches over
// IPC (see preload.cjs + loading.html). The buffer is the single source of
// truth: it is replayed once the page loads (lines emitted earlier would
// otherwise be lost) and it backs the "Copy logs" action. In a packaged app
// this console is the only log surface — stdout/stderr go to /dev/null when
// launched from Finder, and the winston file logger is a no-op there (see
// AGENTS.md on the node_modules strip).

const BOOT_LOG_MAX_LINES = 2000;
const BOOT_LOG_FLUSH_MS = 200;

const bootLog = []; // {name, line, level}[] — level: stdout|stderr|info|warn|error
let bootLogPending = [];
let bootLogFlushTimer = null;
let bootLogReady = false; // true once loading.html has loaded and can receive
let fatalSummary = null;

// SGR color codes AND cursor-control CSI sequences (uv/uvicorn can emit
// either when they mis-detect a TTY).
const ANSI_CSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

/**
 * Strip ANSI escapes and reduce carriage-return progress redraws (e.g. uv
 * download bars arrive as one chunk of "\r"-separated frames) to the final
 * frame — what a real terminal would have settled on.
 */
function sanitizeLogLine(line) {
  const frames = String(line ?? "")
    .replace(ANSI_CSI_RE, "")
    .split("\r")
    .map((s) => s.trim())
    .filter(Boolean);
  return frames.length ? frames[frames.length - 1] : "";
}

function appendBootLog(name, line, level) {
  const entry = { name, line, level };
  bootLog.push(entry);
  if (bootLog.length > BOOT_LOG_MAX_LINES) {
    bootLog.splice(0, bootLog.length - BOOT_LOG_MAX_LINES);
  }
  bootLogPending.push(entry);
  if (!bootLogFlushTimer) {
    bootLogFlushTimer = setTimeout(flushBootLog, BOOT_LOG_FLUSH_MS);
  }
}

function flushBootLog() {
  clearTimeout(bootLogFlushTimer);
  bootLogFlushTimer = null;
  if (!bootLogPending.length) return;
  const batch = bootLogPending;
  bootLogPending = [];
  // Not ready / window gone: drop the batch — the entries stay in bootLog,
  // which did-finish-load replays wholesale.
  if (bootLogReady && loadingWin && !loadingWin.isDestroyed()) {
    loadingWin.webContents.send("boot-log:batch", batch);
  }
}

/**
 * Switch the splash into its failure state: expand the console and show the
 * error summary with Copy logs / Quit actions, keeping the window open so the
 * user can actually read why startup failed. Returns false when the loading
 * window is gone (caller falls back to a native dialog).
 */
function showStartupFailure(summary) {
  if (!loadingWin || loadingWin.isDestroyed()) return false;
  fatalSummary = summary;
  setLoadingWindowExpanded(true);
  if (bootLogReady) {
    flushBootLog();
    loadingWin.webContents.send("boot-log:fatal", summary);
  }
  // If the page hasn't loaded yet, did-finish-load replays the buffer and
  // then delivers fatalSummary.
  return true;
}

// IPC surface for the loading window (see preload.cjs). Guarded to that
// window's webContents so the main app window can never reach these.
function isLoadingWinEvent(event) {
  return (
    loadingWin !== null &&
    !loadingWin.isDestroyed() &&
    event.sender === loadingWin.webContents
  );
}

ipcMain.handle("boot-log:set-expanded", (event, expanded) => {
  if (!isLoadingWinEvent(event)) return;
  setLoadingWindowExpanded(Boolean(expanded));
});

ipcMain.handle("boot-log:copy", (event) => {
  if (!isLoadingWinEvent(event)) return 0;
  clipboard.writeText(bootLog.map((e) => `[${e.name}] ${e.line}`).join("\n"));
  return bootLog.length;
});

// The frameless splash has no close control; the failure state shows a Quit
// button instead.
ipcMain.handle("boot-log:quit", (event) => {
  if (!isLoadingWinEvent(event)) return;
  app.quit();
});

// ── Backend stack ─────────────────────────────────────────────────────────────

/**
 * Update the status line on the loading window, if it's still alive.
 *
 * The loading screen exposes a global `window.__setLoadingStatus(line)`
 * function (see loading.html) that swaps the status text. We call it via
 * `executeJavaScript` so no preload script / IPC plumbing is needed.
 *
 * Best-effort: any failure (window destroyed, JS not loaded yet, etc.) is
 * swallowed — this is purely a UX nicety and must never crash the launcher.
 */
function setLoadingStatus(line) {
  if (!loadingWin || loadingWin.isDestroyed()) return;
  // Limit to a single line, max ~120 chars, to keep the splash readable.
  const oneLine = String(line ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (!oneLine) return;
  const safe = JSON.stringify(oneLine);
  loadingWin.webContents
    .executeJavaScript(
      `window.__setLoadingStatus && window.__setLoadingStatus(${safe});`,
      true,
    )
    .catch(() => {});
}

/**
 * Phase marker: headline + a line in the startup-log console, so the log
 * records which stage a failed boot died in.
 */
function setBootPhase(message) {
  appendBootLog("desktop", message, "info");
  setLoadingStatus(message);
}

/**
 * Last few `level: "error"` service log lines (spawn failures, non-zero
 * exits). Appended to the startup-failure dialog: a packaged app launched
 * from Finder has stdout/stderr wired to /dev/null, so without this a
 * crashed ingress/static-server surfaces only as an opaque "timed out
 * waiting for http://127.0.0.1:8000" message.
 */
const recentServiceErrors = [];

/**
 * Forward dev-stack service log lines to (a) the loading screen and (b) the
 * terminal log. The terminal already receives them via `logService`; we add
 * a tee here so the user can see what's happening on first launch when uvx
 * is downloading Python + agent-server.
 */
function handleServiceLog(name, line, level) {
  if (!line) return;
  const clean = sanitizeLogLine(line);
  if (!clean) return;
  // Full-fidelity stream: every service and level goes to the console buffer.
  // The one-line headline below stays filtered to the interesting services.
  appendBootLog(name, clean, level);
  if (name === "agent-server" || name === "automation") {
    setLoadingStatus(`${name}: ${clean}`);
  }
  // Mirror errors to a `[desktop]` terminal line so dev runs stay grep-friendly.
  if (level === "error") {
    console.error(`[desktop] [${name}] ${clean}`);
    // Errors from ANY service (including ingress/static, which the headline
    // filter above skips) are worth showing — a dead ingress is exactly the
    // case where the user would otherwise stare at a silent 120 s timeout.
    setLoadingStatus(`${name}: ${clean}`);
    recentServiceErrors.push(`${name}: ${clean}`);
    if (recentServiceErrors.length > 5) recentServiceErrors.shift();
  }
}

async function startStack() {
  const entryUrl = pathToFileURL(
    join(scriptsDir, "dev-with-automation.mjs"),
  ).href;
  const { main } = await import(entryUrl);

  // main() starts agent-server + automation backend + static server + ingress.
  //   skipNpmCheck: npm is not needed at runtime in static mode.
  //   agentServerReadyTimeoutMs: dev defaults to 60 s (warm uvx cache); a
  //     packaged binary on a fresh machine can spend several minutes inside
  //     uvx the first time, downloading Python + installing openhands-
  //     agent-server from PyPI. 10 minutes is generous but bounded.
  //   onServiceLog: stream uvx/agent-server output to the loading window so
  //     the user sees progress instead of an indefinite spinner.
  const result = await main({
    bannerTitle: "NovaAgent",
    staticMode: true,
    staticDir: buildDir,
    mode: "agent-canvas",
    isPublic: false,
    skipNpmCheck: true,
    agentServerReadyTimeoutMs: 10 * 60_000,
    onServiceLog: handleServiceLog,
  });

  // main() returns { config, agentServerReady } — treat a timeout as a fatal
  // startup error so the splash shows a clear dialog instead of dropping the
  // user into a half-booted UI that will only emit "Request timeout" popups.
  if (result?.agentServerReady === false) {
    throw new Error(
      "The agent server did not finish starting in time. " +
        "On first launch this can take several minutes while uvx downloads " +
        "Python and the agent-server from PyPI. " +
        "Check your internet connection and try again.",
    );
  }

  const ingressPort = result?.config?.ingressPort ?? DESKTOP_INGRESS_PORT;
  return {
    uiOrigin: `http://127.0.0.1:${ingressPort}`,
    serverInfoUrl: `http://127.0.0.1:${ingressPort}/server_info`,
  };
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  nativeTheme.themeSource = "dark";

  // Opt-in Phase 1 local tools sidecar (does not bind port 8000).
  maybeStartLocalToolsSidecar();

  // Set the dock icon explicitly on macOS so `npm run desktop` shows the
  // NovaAgent icon instead of the default Electron logo. In a packaged
  // build the .app bundle's icon.icns already provides this, but
  // setDockIcon is still harmless if called.
  // app.dock.setIcon() is a cheap idempotent override that also fixes
  // the dev workflow.
  if (process.platform === "darwin" && app.dock && existsSync(appIconPath)) {
    app.dock.setIcon(nativeImage.createFromPath(appIconPath));
  }

  // Thin-client mode: open a remote NovaAgent UI and do not start local
  // agent-server / automation / ingress. See docs/REMOTE_THIN_CLIENT.md.
  // Triggered by: env URL, NovaAgent Client pack (package.json name), or
  // NOVAAGENT_THIN_CLIENT=1.
  const thinPack = isThinClientPack();
  const { bakedConfigPath, userConfigPath } = getThinClientConfigPaths();
  let remoteUiUrl = null;
  try {
    remoteUiUrl = resolveDesktopRemoteUiUrl(process.env, {
      bakedConfigPath,
      userConfigPath,
    });
  } catch (err) {
    dialog.showErrorBox(
      "Invalid remote UI URL",
      err instanceof Error ? err.message : String(err),
    );
    app.quit();
    return;
  }

  if (remoteUiUrl || thinPack) {
    if (!remoteUiUrl) {
      suppressQuitOnAllWindowsClosed = true;
      remoteUiUrl = await promptForRemoteUiUrl();
      if (!remoteUiUrl) {
        app.quit();
        return;
      }
      try {
        writeFileSync(
          userConfigPath,
          `${JSON.stringify({ remoteUrl: remoteUiUrl }, null, 2)}\n`,
          "utf8",
        );
      } catch (err) {
        console.warn("[desktop] Failed to persist remote URL:", err);
      }
    }
    if (!readWorkspaceTokenFromConfig()) {
      suppressQuitOnAllWindowsClosed = true;
      const loginToken = await promptForWorkspaceLogin(remoteUiUrl);
      if (!loginToken) {
        app.quit();
        return;
      }
      try {
        saveWorkspaceTokenToUserConfig(userConfigPath, loginToken);
      } catch (err) {
        console.warn("[desktop] Failed to persist workspace token:", err);
      }
    }
    await openThinClientWindow(remoteUiUrl);
    return;
  }

  injectBundledUv();
  injectBundledNode();
  injectBundledPythonRuntime();

  // Hybrid company-managed LLM: resolve env / baked company-llm.json into
  // process.env so the static frontend gets window.__NOVAAGENT_COMPANY_LLM_URL__.
  // This does NOT switch to thin-client mode — local agent-server still runs.
  try {
    applyCompanyLlmUrlFromEnvOrBake();
  } catch {
    app.quit();
    return;
  }

  const hasBundledPython =
    Boolean(process.env.OH_BUNDLED_PYTHON) &&
    Boolean(process.env.OH_BUNDLED_PYTHON_ENV) &&
    existsSync(process.env.OH_BUNDLED_PYTHON) &&
    existsSync(process.env.OH_BUNDLED_PYTHON_ENV);

  // Offline packs run agent-server via bundled CPython; uvx is optional then.
  if (!hasBundledPython && !uvxAvailable()) {
    dialog.showErrorBox(
      "Missing prerequisite: uv",
      app.isPackaged
        ? "The bundled uv binary could not be found. Please reinstall NovaAgent.\n\n" +
            "If you opened the zip inside WinRAR or 7-Zip, extract the full folder to disk first, " +
            "then run NovaAgent.exe from the extracted folder (not from inside the archive viewer)."
        : "uv (uvx) is not installed.\n\nInstall it from https://docs.astral.sh/uv/ then restart.",
    );
    app.quit();
    return;
  }

  if (!hasBundledPython) {
    console.warn(
      "[desktop] No bundled python-env — agent-server will use uvx (may need network).",
    );
  }

  createLoadingWindow();

  try {
    setBootPhase("Starting backend services…");
    const stack = await startStack();
    const uiOrigin = stack?.uiOrigin ?? DESKTOP_UI_ORIGIN;
    const serverInfoUrl = stack?.serverInfoUrl ?? DESKTOP_SERVER_INFO_URL;

    // Stage 1: ingress proxy is bound (anything < 500 on /).
    setBootPhase("Waiting for proxy…");
    await waitForUrl(uiOrigin);

    // Stage 2: the agent-server behind the proxy is actually serving
    // requests. `startStack()` already waited for this internally, but we
    // re-probe end-to-end here so that if the user closes the splash race
    // window between processes binding, we still open the main window with
    // a live backend. Cheap (a single 200 response) when everything is up.
    setBootPhase("Connecting to agent server…");
    await waitForAgentServer(serverInfoUrl, 60_000);

    setBootPhase("Ready.");
    createMainWindow(uiOrigin);
  } catch (err) {
    const summary =
      err.message +
      ` Ensure ingress port ${DESKTOP_INGRESS_PORT} (and backend ports) are free, then try again.`;
    // Record the failure in the terminal and the startup-log buffer so it
    // shows (and copies) as the final console line.
    console.error("[desktop] Startup failed:", err);
    appendBootLog("desktop", summary, "error");
    // Keep the splash open in its failure state so the full startup log can
    // be read and copied; the app quits via the splash's Quit button (or
    // Cmd+Q / closing the window).
    if (showStartupFailure(summary)) return;
    // Loading window already gone — fall back to the old dialog-and-quit.
    const errorTail = recentServiceErrors.length
      ? `\n\nRecent service errors:\n${recentServiceErrors.join("\n")}`
      : "";
    dialog.showErrorBox("NovaAgent failed to start", summary + errorTail);
    app.quit();
  }
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
//
// dev-with-automation.mjs spawns the backend processes with detached:true so
// they form their own OS process groups and survive the parent's death by
// default. We must explicitly kill them when the app quits.
//
// createShutdownHookRegistry (dev-process-utils.mjs) already registered a
// SIGTERM handler that iterates every tracked process, calls signalProcessTree
// on its group, waits for exit, then calls process.exit(0). We just need to
// fire that handler before Electron lets the process die.
//
// Flow:
//   user closes window / Cmd+Q
//     → window-all-closed → app.quit()
//     → before-quit fires (first time)  → we preventDefault + send SIGTERM
//     → SIGTERM handler kills all children, calls process.exit(0)
//     → before-quit fires again (cleanupStarted=true) → we return, Electron exits
//
// Windows has no real POSIX signals: process.kill(pid, "SIGTERM") would
// terminate this process WITHOUT running the "SIGTERM" listener, skipping
// cleanup and orphaning the children on ports 8000/18000/18001 (the next
// launch then fails at startup). process.emit("SIGTERM") runs the same
// registered handler in-process instead.

let cleanupStarted = false;

app.on("before-quit", (event) => {
  if (cleanupStarted) return; // SIGTERM cleanup already running — allow exit

  cleanupStarted = true;
  event.preventDefault();

  console.log("[desktop] Stopping backend services…");
  stopCustomerWorkspaceReverseClient();
  stopLocalToolsSidecar();
  if (process.platform === "win32") {
    // Run the cleanup handler in-process (see header note). emit() returns
    // false when no listener is registered — the stack never started, so
    // there is nothing to clean up and we can exit immediately.
    if (!process.emit("SIGTERM")) app.exit(0);
  } else {
    process.kill(process.pid, "SIGTERM");
  }

  // Safety net: if the SIGTERM handler doesn't finish within 6 s, force-quit.
  const t = setTimeout(() => {
    console.warn("[desktop] Cleanup timed out — forcing exit");
    app.exit(0);
  }, 6000);
  if (t.unref) t.unref();
});

// During first-run login / URL prompt the last window closes before the
// loading window exists; quitting there would kill the app mid-startup.
let suppressQuitOnAllWindowsClosed = false;

app.on("window-all-closed", () => {
  if (suppressQuitOnAllWindowsClosed) {
    console.log(
      "[desktop] all windows closed during startup/login - not quitting",
    );
    return;
  }
  app.quit();
});

// macOS: clicking the dock icon when no window is open re-launches the app.
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    // The backend is already running — just open a new renderer window.
    if (mainWin === null) createMainWindow();
  }
});
