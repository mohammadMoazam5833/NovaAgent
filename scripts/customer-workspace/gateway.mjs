/**
 * Company-side reverse workspace gateway.
 *
 * - HTTP sidecar protocol on localhost (agent-server → POST /v1)
 * - Accepts outbound WebSocket from the customer thin client
 * - Does not HTTP-connect to the customer laptop
 */

import { readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { URL } from "node:url";

import {
  AUTH_BEARER_PREFIX,
  AUTH_HEADER_NAME,
  CUSTOMER_WORKSPACE_HTTP_PATH,
  DEFAULT_CUSTOMER_WORKSPACE_GATEWAY_HOST,
  DEFAULT_CUSTOMER_WORKSPACE_GATEWAY_PORT,
  DEFAULT_GATEWAY_FORWARD_TIMEOUT_MS,
  DEFAULT_EXEC_TIMEOUT_MS,
  HEALTH_PATH,
  LOCAL_TOOLS_PROTOCOL_VERSION,
  V1_HTTP_PATH,
} from "../local-tools-sidecar/constants.mjs";
import { extractToken } from "../local-tools-sidecar/server.mjs";
import { makeError, parseRequest } from "../local-tools-sidecar/protocol.mjs";
import { acceptWebSocket } from "../local-tools-sidecar/ws.mjs";
import {
  isCustomerWorkspaceHealthPath,
  isCustomerWorkspaceStatusPath,
  isCustomerWorkspaceWsPath,
} from "./urls.mjs";

const NO_CLIENT_CODE = "not_connected";

/**
 * @param {{
 *   host?: string,
 *   port?: number,
 *   token: string,
 *   forwardTimeoutMs?: number,
 * }} options
 */
export function createCustomerWorkspaceGateway(options) {
  const host = options.host || DEFAULT_CUSTOMER_WORKSPACE_GATEWAY_HOST;
  const port = options.port ?? DEFAULT_CUSTOMER_WORKSPACE_GATEWAY_PORT;
  const token = options.token;
  const defaultTimeout =
    options.forwardTimeoutMs ?? DEFAULT_GATEWAY_FORWARD_TIMEOUT_MS;

  /** @type {Map<string, { resolve: (v: object) => void, timer: NodeJS.Timeout }>} */
  const pending = new Map();
  /** Customer token -> { name, roots } */
  const customersByToken = new Map();
  for (const c of options.customers ?? []) {
    if (c && typeof c.token === "string" && c.token.trim()) {
      customersByToken.set(c.token.trim(), {
        name: String(c.name || "unnamed"),
        roots: Array.isArray(c.roots) ? c.roots.map((r) => String(r)) : [],
      });
    }
  }
  const customersFile = options.customersFile || "";
  let customersMtime = 0;
  /**
   * Hot-reload ~/.nova-customers.json. Tenants created by the admin panel after
   * the gateway started would otherwise have an unknown token: their client WS
   * upgrade is rejected (401), the tenant agent-server never reaches the client
   * and silently falls back to the server's own workspace.
   */
  function refreshCustomers() {
    if (!customersFile) return;
    try {
      const mtime = statSync(customersFile).mtimeMs;
      if (mtime === customersMtime) return;
      customersMtime = mtime;
      const parsed = JSON.parse(readFileSync(customersFile, "utf8"));
      if (!Array.isArray(parsed?.customers)) return;
      customersByToken.clear();
      for (const c of parsed.customers) {
        if (c && typeof c.token === "string" && c.token.trim()) {
          customersByToken.set(c.token.trim(), {
            name: String(c.name || "unnamed"),
            roots: Array.isArray(c.roots) ? c.roots.map((r) => String(r)) : [],
          });
        }
      }
      console.log(`[gateway] customers reloaded (${customersByToken.size})`);
    } catch {
      // keep the last good registry
    }
  }
  refreshCustomers();
  const useCustomers = () => customersByToken.size > 0;

  /** @type {Map<string, { sendText: (t: string) => void, sendClose: () => void, hello: object | null, roots: string[] }>} */
  const sessions = new Map();

  const failPending = (code, message) => {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      entry.resolve(makeError(id, code, message));
    }
    pending.clear();
  };

  const dropClient = (name, entry) => {
    if (!name) return;
    const cur = sessions.get(name);
    // Stale close event from a replaced session must not drop the new one.
    if (!cur || (entry && cur !== entry)) return;
    if (cur.timer) clearInterval(cur.timer);
    sessions.delete(name);
    console.log(`[gateway] customer '${name}' disconnected (${sessions.size} active)`);
    if (sessions.size === 0) {
      failPending(NO_CLIENT_CODE, "customer workspace disconnected");
    }
  };

  const server = createServer(async (req, res) => {
    const hostHeader = req.headers.host ?? `${host}:${port}`;
    const url = new URL(req.url ?? "/", `http://${hostHeader}`);

    if (req.method === "GET" && isCustomerWorkspaceHealthPath(url.pathname)) {
      sendJson(res, 200, healthBody());
      return;
    }

    if (req.method === "GET" && isCustomerWorkspaceStatusPath(url.pathname)) {
      sendJson(res, 200, {
        ...healthBody(),
        path: CUSTOMER_WORKSPACE_HTTP_PATH,
      });
      return;
    }

    // TENANT-PATH-ROUTING: /c/<customer>/v1 → strictly that customer.
    const tenantMatch = /^\/c\/([^/]+)\/v1$/.exec(url.pathname);
    if (tenantMatch && req.method === "POST") {
      const tenantName = decodeURIComponent(tenantMatch[1]);
      refreshCustomers();
      const gotTenant = extractToken(req, url);
      const tenantAllowed =
        (gotTenant && gotTenant === token) ||
        (gotTenant &&
          (() => {
            for (const [t, c] of customersByToken.entries()) {
              if (t === gotTenant && c.name === tenantName) return true;
            }
            return false;
          })());
      if (!tenantAllowed) {
        sendJson(res, 401, makeError("0", "unauthorized", "invalid or missing token"));
        return;
      }
      let tenantBody;
      try {
        tenantBody = await readBody(req);
      } catch (err) {
        sendJson(res, 400, makeError("0", "invalid_request", err instanceof Error ? err.message : "failed to read body"));
        return;
      }
      const tenantParsed = parseRequest(tenantBody);
      if (!tenantParsed.ok) {
        sendJson(res, 400, makeError("0", tenantParsed.error.code, tenantParsed.error.message));
        return;
      }
      const tenantResponse = await forwardToTenant(tenantName, tenantParsed.message, defaultTimeout);
      sendJson(res, tenantResponse.ok ? 200 : statusForError(tenantResponse), tenantResponse);
      return;
    }

    if (req.method === "POST" && url.pathname === V1_HTTP_PATH) {
      const got = extractToken(req, url);
      if (!got || got !== token) {
        sendJson(res, 401, makeError("0", "unauthorized", "invalid or missing token"));
        return;
      }

      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        sendJson(
          res,
          400,
          makeError(
            "0",
            "invalid_request",
            err instanceof Error ? err.message : "failed to read body",
          ),
        );
        return;
      }

      const parsed = parseRequest(body);
      if (!parsed.ok) {
        sendJson(res, 400, makeError("0", parsed.error.code, parsed.error.message));
        return;
      }

      const response = await forwardToClient(parsed.message, defaultTimeout);
      sendJson(res, response.ok ? 200 : statusForError(response), response);
      return;
    }

    sendJson(res, 404, {
      ok: false,
      error: { code: "not_found", message: "not found" },
    });
  });

  server.on("upgrade", (req, socket, head) => {
    const hostHeader = req.headers.host ?? `${host}:${port}`;
    const url = new URL(req.url ?? "/", `http://${hostHeader}`);

    if (!isCustomerWorkspaceWsPath(url.pathname)) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    refreshCustomers();
    const got = extractToken(req, url);
    let customer = null;
    if (got) {
      if (useCustomers()) {
        customer = customersByToken.get(got) ?? null;
      } else if (got === token) {
        customer = { name: "default", roots: [] };
      }
    }
    if (!customer) {
      console.log("[gateway] WS upgrade REJECTED (bad token)");
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const existing = sessions.get(customer.name);
    if (existing) {
      try {
        existing.sendClose();
      } catch {
        // ignore
      }
      dropClient(customer.name, existing);
    }

    const session = acceptWebSocket(
      req,
      socket,
      head,
      (text) => {
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          return;
        }
        if (!parsed || typeof parsed !== "object") return;
        const id = parsed.id;
        if (typeof id !== "string") return;
        if (parsed.type === "hello" || parsed.result?.protocol) {
          const entry = sessions.get(customer.name);
          if (entry) {
            entry.hello = parsed.result ?? parsed;
            const hr = entry.hello?.roots;
            if (Array.isArray(hr) && hr.length) {
              entry.roots = hr.map((r) => String(r));
            }
          }
        }
        const waiter = pending.get(id);
        if (waiter) {
          clearTimeout(waiter.timer);
          pending.delete(id);
          waiter.resolve(parsed);
        }
      },
      { onClose: () => dropClient(customer.name, entry) },
    );
    const entry = {
      sendText: session.sendText,
      sendClose: session.sendClose,
      sendPing: session.sendPing,
      hello: null,
      roots: customer.roots,
      timer: null,
    };
    // Keepalive: native WS ping every 25s keeps NAT paths alive and
    // surfaces dead peer sockets promptly (client auto-pongs).
    entry.timer = setInterval(() => {
      try {
        entry.sendPing?.();
      } catch {
        // socket errors trigger onClose via ws.mjs
      }
    }, 25_000);
    entry.timer.unref?.();
    entry.connectedAt = Date.now(); // NEWEST-SESSION-ROUTING
    sessions.set(customer.name, entry);
    console.log(
      `[gateway] customer '${customer.name}' connected (${sessions.size} active)`,
    );
  });

  function healthBody() {
    refreshCustomers();
    const names = useCustomers()
      ? [...customersByToken.values()].map((c) => c.name)
      : ["default"];
    return {
      ok: true,
      protocol: LOCAL_TOOLS_PROTOCOL_VERSION,
      connected: sessions.size > 0,
      customers: names.map((name) => ({
        name,
        connected: sessions.has(name),
      })),
      path: HEALTH_PATH,
    };
  }

  /**
   * @param {{ v: number, id: string, type: string, params: object }} message
   * @param {number} defaultTimeoutMs
   */
  function paramPaths(value, out, depth = 0) {
    if (!value || typeof value !== "object" || depth > 4) return out;
    for (const [key, v] of Object.entries(value)) {
      if (typeof v === "string") {
        const k = key.toLowerCase();
        if (
          k === "path" ||
          k === "cwd" ||
          k === "file_path" ||
          k === "abs_path" ||
          k === "workspace_root"
        ) {
          out.push(v);
        }
      } else if (v && typeof v === "object") {
        paramPaths(v, out, depth + 1);
      }
    }
    return out;
  }

  function matchesRoots(candidate, roots) {
    if (!roots || roots.length === 0) return false;
    const norm = (p) =>
      String(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    const c = norm(candidate);
    return roots.some((r) => {
      const rr = norm(r);
      return c === rr || c.startsWith(rr + "/");
    });
  }

  function pickCustomerSession(message) {
    if (sessions.size === 0) return null;
    if (sessions.size === 1) return sessions.values().next().value;
    const paths = paramPaths(message.params ?? {}, []);
    if (paths.length === 0) {
      // NEWEST-SESSION-ROUTING: pathless requests (e.g. file/home, hello)
      // go to the most recently connected customer session.
      let newest = null;
      for (const entry of sessions.values()) {
        if (!newest || (entry.connectedAt || 0) >= (newest.connectedAt || 0)) {
          newest = entry;
        }
      }
      return newest;
    }
    let match = null;
    for (const entry of sessions.values()) {
      if (paths.some((p) => matchesRoots(p, entry.roots))) {
        if (match) return null;
        match = entry;
      }
    }
    return match;
  }

  function forwardToSession(target, message, timeoutMs) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(message.id);
        resolve(
          makeError(
            message.id,
            "timeout",
            `customer workspace timed out after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
      pending.set(message.id, { resolve, timer });
      try {
        target.sendText(JSON.stringify(message));
      } catch (err) {
        clearTimeout(timer);
        pending.delete(message.id);
        resolve(
          makeError(
            message.id,
            "exec_failed",
            err instanceof Error ? err.message : String(err),
          ),
        );
      }
    });
  }

  function forwardToClient(message, defaultTimeoutMs) {
    const target = pickCustomerSession(message);
    if (!target) {
      const names = [...sessions.keys()].join(", ") || "none";
      return Promise.resolve(
        makeError(
          message.id,
          NO_CLIENT_CODE,
          sessions.size === 0
            ? "no customer workspace connected"
            : `cannot route request to a single customer (connected: ${names})`,
        ),
      );
    }
    const timeoutMs = resolveForwardTimeout(message, defaultTimeoutMs);
    return forwardToSession(target, message, timeoutMs);
  }

  // TENANT-PATH-ROUTING: forward strictly to one named customer session.
  function forwardToTenant(name, message, defaultTimeoutMs) {
    const entry = sessions.get(name);
    if (!entry) {
      return Promise.resolve(
        makeError(message.id, NO_CLIENT_CODE, `customer '${name}' not connected`),
      );
    }
    const timeoutMs = resolveForwardTimeout(message, defaultTimeoutMs);
    return forwardToSession(entry, message, timeoutMs);
  }

  return {
    server,
    host,
    port,
    get connected() {
      return sessions.size > 0;
    },
    get clientHello() {
      return sessions.values().next().value?.hello ?? null;
    },
    listen(cb) {
      server.listen(port, host, cb);
    },
    close() {
      for (const entry of sessions.values()) {
        try {
          if (entry.timer) clearInterval(entry.timer);
          entry.sendClose();
        } catch {
          // ignore
        }
      }
      sessions.clear();
      failPending(NO_CLIENT_CODE, "gateway closed");
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

/**
 * @param {{ params?: Record<string, unknown> }} message
 * @param {number} fallback
 */
function resolveForwardTimeout(message, fallback) {
  const raw = message.params?.timeout_ms;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw + 5_000;
  }
  return fallback || DEFAULT_EXEC_TIMEOUT_MS;
}

/**
 * @param {{ ok?: boolean, error?: { code?: string } }} response
 */
function statusForError(response) {
  const code = response?.error?.code;
  if (code === "unauthorized") return 401;
  if (code === NO_CLIENT_CODE) return 503;
  if (code === "timeout") return 504;
  return 400;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const limit = 8 * 1024 * 1024;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

export { AUTH_BEARER_PREFIX, AUTH_HEADER_NAME, NO_CLIENT_CODE };
