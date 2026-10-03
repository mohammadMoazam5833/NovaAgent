/**
 * HTTP + WebSocket server for Local Tools Sidecar.
 */

import { createServer } from "node:http";
import { URL } from "node:url";

import {
  AUTH_BEARER_PREFIX,
  AUTH_HEADER_NAME,
  HEALTH_PATH,
  LOCAL_TOOLS_PROTOCOL_VERSION,
  V1_HTTP_PATH,
  V1_WS_PATH,
} from "./constants.mjs";
import { handleRequest } from "./handlers.mjs";
import { makeError, parseRequest } from "./protocol.mjs";
import { acceptWebSocket } from "./ws.mjs";

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {string} expectedToken
 */
export function extractToken(req, url) {
  const headerToken = req.headers[AUTH_HEADER_NAME];
  if (typeof headerToken === "string" && headerToken.trim()) {
    return headerToken.trim();
  }
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith(AUTH_BEARER_PREFIX)) {
    return auth.slice(AUTH_BEARER_PREFIX.length).trim();
  }
  const q = url.searchParams.get("token");
  if (q) return q;
  return null;
}

/**
 * @param {{
 *   host: string,
 *   port: number,
 *   token: string,
 *   roots: string[],
 *   readFileMaxBytes?: number,
 *   defaultExecTimeoutMs?: number,
 * }} options
 */
export function createLocalToolsSidecarServer(options) {
  const ctx = {
    roots: options.roots,
    host: options.host,
    port: options.port,
    readFileMaxBytes: options.readFileMaxBytes,
    defaultExecTimeoutMs: options.defaultExecTimeoutMs,
  };

  const server = createServer(async (req, res) => {
    const hostHeader = req.headers.host ?? `${options.host}:${options.port}`;
    const url = new URL(req.url ?? "/", `http://${hostHeader}`);

    if (req.method === "GET" && url.pathname === HEALTH_PATH) {
      sendJson(res, 200, {
        ok: true,
        protocol: LOCAL_TOOLS_PROTOCOL_VERSION,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === V1_HTTP_PATH) {
      const token = extractToken(req, url);
      if (!token || token !== options.token) {
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

      const response = await handleRequest(ctx, parsed.message);
      sendJson(res, response.ok ? 200 : 400, response);
      return;
    }

    sendJson(res, 404, { ok: false, error: { code: "not_found", message: "not found" } });
  });

  server.on("upgrade", (req, socket, head) => {
    const hostHeader = req.headers.host ?? `${options.host}:${options.port}`;
    const url = new URL(req.url ?? "/", `http://${hostHeader}`);

    if (url.pathname !== V1_WS_PATH) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    const token = extractToken(req, url);
    if (!token || token !== options.token) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    acceptWebSocket(req, socket, head, async (text, sendText) => {
      const parsed = parseRequest(text);
      if (!parsed.ok) {
        sendText(
          JSON.stringify(
            makeError("0", parsed.error.code, parsed.error.message),
          ),
        );
        return;
      }
      const response = await handleRequest(ctx, parsed.message);
      sendText(JSON.stringify(response));
    });
  });

  return {
    server,
    ctx,
    /**
     * @param {() => void} [cb]
     */
    listen(cb) {
      server.listen(options.port, options.host, cb);
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

/**
 * @param {import('node:http').IncomingMessage} req
 */
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

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}
