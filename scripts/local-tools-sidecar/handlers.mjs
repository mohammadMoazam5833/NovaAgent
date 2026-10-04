/**
 * Request handlers for Local Tools Sidecar operations.
 */

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import {
  DEFAULT_EXEC_TIMEOUT_MS,
  DEFAULT_READ_FILE_MAX_BYTES,
  LOCAL_TOOLS_PROTOCOL_VERSION,
} from "./constants.mjs";
import { resolveUnderRoots } from "./paths.mjs";
import { makeError, makeResult } from "./protocol.mjs";

/**
 * @typedef {object} SidecarContext
 * @property {string[]} roots
 * @property {string} host
 * @property {number} port
 * @property {number} [readFileMaxBytes]
 * @property {number} [defaultExecTimeoutMs]
 */

/**
 * @param {SidecarContext} ctx
 * @param {{ v: number, id: string, type: string, params: Record<string, unknown> }} msg
 */
export async function handleRequest(ctx, msg) {
  try {
    switch (msg.type) {
      case "hello":
        return makeResult(msg.id, {
          protocol: LOCAL_TOOLS_PROTOCOL_VERSION,
          roots: ctx.roots,
          host: ctx.host,
          port: ctx.port,
        });
      case "list_dir":
        return makeResult(msg.id, handleListDir(ctx, msg.params));
      case "read_file":
        return makeResult(msg.id, handleReadFile(ctx, msg.params));
      case "write_file":
        return makeResult(msg.id, handleWriteFile(ctx, msg.params));
      case "exec":
        return makeResult(msg.id, await handleExec(ctx, msg.params));
      default:
        return makeError(msg.id, "invalid_request", `unknown type: ${msg.type}`);
    }
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err && typeof err.code === "string"
        ? err.code
        : "exec_failed";
    const message = err instanceof Error ? err.message : String(err);
    // Map Node ENOENT etc.
    if (code === "ENOENT") {
      return makeError(msg.id, "not_found", message);
    }
    if (
      code === "path_denied" ||
      code === "not_found" ||
      code === "invalid_request" ||
      code === "too_large" ||
      code === "timeout"
    ) {
      return makeError(msg.id, code, message);
    }
    return makeError(msg.id, "exec_failed", message);
  }
}

/**
 * @param {SidecarContext} ctx
 * @param {Record<string, unknown>} params
 */
function handleListDir(ctx, params) {
  const pathParam = params.path;
  if (typeof pathParam !== "string") {
    const err = new Error("params.path must be a string");
    err.code = "invalid_request";
    throw err;
  }
  const { absolute } = resolveUnderRoots(pathParam, ctx.roots, {
    mustExist: true,
  });
  const st = statSync(absolute);
  if (!st.isDirectory()) {
    const err = new Error("path is not a directory");
    err.code = "invalid_request";
    throw err;
  }
  const names = readdirSync(absolute);
  const entries = names.map((name) => {
    const full = join(absolute, name);
    try {
      const s = statSync(full);
      return {
        name,
        type: s.isDirectory() ? "dir" : s.isFile() ? "file" : "other",
        size: s.isFile() ? s.size : undefined,
      };
    } catch {
      return { name, type: "other" };
    }
  });
  return { path: absolute, entries };
}

/**
 * @param {SidecarContext} ctx
 * @param {Record<string, unknown>} params
 */
function handleReadFile(ctx, params) {
  const pathParam = params.path;
  if (typeof pathParam !== "string") {
    const err = new Error("params.path must be a string");
    err.code = "invalid_request";
    throw err;
  }
  const maxBytes = ctx.readFileMaxBytes ?? DEFAULT_READ_FILE_MAX_BYTES;
  const { absolute } = resolveUnderRoots(pathParam, ctx.roots, {
    mustExist: true,
  });
  const st = statSync(absolute);
  if (!st.isFile()) {
    const err = new Error("path is not a file");
    err.code = "invalid_request";
    throw err;
  }
  if (st.size > maxBytes) {
    const err = new Error(
      `file exceeds max size (${st.size} > ${maxBytes} bytes)`,
    );
    err.code = "too_large";
    throw err;
  }
  const content = readFileSync(absolute, "utf8");
  return { path: absolute, encoding: "utf-8", content };
}

/**
 * @param {SidecarContext} ctx
 * @param {Record<string, unknown>} params
 */
function handleWriteFile(ctx, params) {
  const pathParam = params.path;
  const content = params.content;
  if (typeof pathParam !== "string") {
    const err = new Error("params.path must be a string");
    err.code = "invalid_request";
    throw err;
  }
  if (typeof content !== "string") {
    const err = new Error("params.content must be a string");
    err.code = "invalid_request";
    throw err;
  }
  const createParents = Boolean(params.create_parents);
  const { absolute } = resolveUnderRoots(pathParam, ctx.roots);
  // Ensure parent dir is also under roots (create_parents)
  const parent = dirname(absolute);
  resolveUnderRoots(parent, ctx.roots);
  if (createParents) {
    mkdirSync(parent, { recursive: true });
  }
  const buf = Buffer.from(content, "utf8");
  writeFileSync(absolute, buf);
  return { path: absolute, bytes_written: buf.length };
}


const WIN_GIT_BASH_CANDIDATES = [
  join(process.env["ProgramFiles"] || "C:\\Program Files", "Git", "bin", "bash.exe"),
  join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Git", "bin", "bash.exe"),
  join(process.env["LOCALAPPDATA"] || "", "Programs", "Git", "bin", "bash.exe"),
];

/**
 * Map a POSIX shell invocation to a Windows-appropriate shell when running
 * on win32. The agent-server builds `["/bin/bash", "-lc", cmd]` argv for the
 * terminal tool, which does not exist on Windows customers' machines.
 * @param {string[]} argv
 * @returns {string[]}
 */
function resolveShellArgvForPlatform(argv) {
  if (process.platform !== "win32") {
    return argv;
  }
  const first = String(argv[0] ?? "").replace(/\\/g, "/").toLowerCase();
  const isPosixShell =
    first === "/bin/bash" ||
    first === "/bin/sh" ||
    first === "bash" ||
    first === "sh" ||
    first.endsWith("/bash") ||
    first.endsWith("/sh");
  if (!isPosixShell) {
    return argv;
  }
  let command;
  if (argv.length >= 3 && (argv[1] === "-lc" || argv[1] === "-c")) {
    command = argv.slice(2).join(" ");
  } else if (argv.length >= 4 && argv[1] === "-l" && argv[2] === "-c") {
    command = argv.slice(3).join(" ");
  } else {
    command = argv.slice(1).join(" ");
  }
  for (const candidate of WIN_GIT_BASH_CANDIDATES) {
    try {
      if (candidate && existsSync(candidate)) {
        return [candidate, "-lc", command];
      }
    } catch {
      // probe failure: try next candidate
    }
  }
  return [
    "powershell.exe",
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    command,
  ];
}

/**
 * @param {SidecarContext} ctx
 * @param {Record<string, unknown>} params
 */
function handleExec(ctx, params) {
  const argv = params.argv;
  if (!Array.isArray(argv) || argv.length === 0) {
    const err = new Error("params.argv must be a non-empty string array");
    err.code = "invalid_request";
    throw err;
  }
  if (!argv.every((a) => typeof a === "string")) {
    const err = new Error("params.argv entries must be strings");
    err.code = "invalid_request";
    throw err;
  }

  const cwdParam =
    typeof params.cwd === "string" && params.cwd.trim() !== ""
      ? params.cwd
      : ctx.roots[0];
  const { absolute: cwd } = resolveUnderRoots(cwdParam, ctx.roots, {
    mustExist: true,
  });
  const cwdStat = statSync(cwd);
  if (!cwdStat.isDirectory()) {
    const err = new Error("cwd must be a directory");
    err.code = "invalid_request";
    throw err;
  }

  const timeoutMs =
    typeof params.timeout_ms === "number" &&
    Number.isFinite(params.timeout_ms) &&
    params.timeout_ms > 0
      ? params.timeout_ms
      : (ctx.defaultExecTimeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS);

  return new Promise((resolvePromise, rejectPromise) => {
    const effectiveArgv = resolveShellArgvForPlatform(argv);
    const child = spawn(effectiveArgv[0], effectiveArgv.slice(1), {
      cwd,
      shell: false,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const maxCapture = DEFAULT_READ_FILE_MAX_BYTES;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      if (stdout.length < maxCapture) {
        stdout += chunk.toString("utf8").slice(0, maxCapture - stdout.length);
      }
    });
    child.stderr?.on("data", (chunk) => {
      if (stderr.length < maxCapture) {
        stderr += chunk.toString("utf8").slice(0, maxCapture - stderr.length);
      }
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const e = new Error(err.message);
      e.code = "exec_failed";
      rejectPromise(e);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (timedOut) {
        const e = new Error(`exec timed out after ${timeoutMs}ms`);
        e.code = "timeout";
        rejectPromise(e);
        return;
      }
      resolvePromise({
        exit_code: code ?? 1,
        stdout,
        stderr,
        timed_out: false,
      });
    });
  });
}
