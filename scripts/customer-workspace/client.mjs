/**
 * Customer-side reverse WebSocket client.
 * Connects the local Node sidecar to the company gateway over outbound WS.
 */

import {
  AUTH_BEARER_PREFIX,
  AUTH_HEADER_NAME,
  V1_HTTP_PATH,
} from "../local-tools-sidecar/constants.mjs";
import { connectWebSocket } from "../local-tools-sidecar/ws.mjs";
import { buildCustomerWorkspaceWsUrl } from "./urls.mjs";

const DEFAULT_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

/**
 * @param {{
 *   gatewayWsUrl: string,
 *   sidecarBaseUrl: string,
 *   token: string,
 *   reconnect?: boolean,
 *   onLog?: (line: string) => void,
 * }} options
 */
export function startCustomerWorkspaceClient(options) {
  const reconnect = options.reconnect !== false;
  const log = options.onLog ?? ((line) => console.log(line));
  let closed = false;
  let session = null;
  let reconnectMs = DEFAULT_RECONNECT_MS;
  let reconnectTimer = null;

  let pingTimer = null;
  const stopPinging = () => {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  };

  const stop = () => {
    closed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    stopPinging();
    if (session) {
      try {
        session.close();
      } catch {
        // ignore
      }
      session = null;
    }
  };

  const connect = async () => {
    if (closed) return;
    try {
      session = await connectWebSocket(options.gatewayWsUrl, {
        token: options.token,
        onMessage: async (text, sendText) => {
          const response = await forwardToSidecar(
            options.sidecarBaseUrl,
            options.token,
            text,
          );
          sendText(JSON.stringify(response));
        },
        onClose: (info) => {
          stopPinging();
          session = null;
          // 4001/session_replaced means the same account was opened elsewhere.
          // Retrying immediately turns that deliberate eviction into reconnect
          // churn, with each old client fighting the new session.
          if (info?.code === 4001) {
            closed = true;
            log(
              "[customer-workspace-client] session replaced on the gateway; stopped reconnecting",
            );
            return;
          }
          if (!closed && reconnect) scheduleReconnect();
        },
      });
      reconnectMs = DEFAULT_RECONNECT_MS;
      // Client-side keepalive: keeps NAT paths alive and turns dead
      // half-open sockets into write errors (-> close -> reconnect).
      stopPinging();
      pingTimer = setInterval(() => {
        try {
          session?.sendPing?.();
        } catch {
          // socket errors trigger onClose via ws.mjs
        }
      }, 25_000);
      pingTimer.unref?.();
      log(
        `[customer-workspace-client] connected ${options.gatewayWsUrl} → ${options.sidecarBaseUrl}`,
      );
    } catch (err) {
      log(
        `[customer-workspace-client] connect failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      if (!closed && reconnect) {
        scheduleReconnect();
        return;
      }
      throw err;
    }
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return;
    const wait = reconnectMs;
    reconnectMs = Math.min(reconnectMs * 2, MAX_RECONNECT_MS);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, wait);
  };

  const ready = connect();

  return {
    ready,
    stop,
    get connected() {
      return Boolean(session);
    },
  };
}

/**
 * @param {string} sidecarBaseUrl
 * @param {string} token
 * @param {string} text
 */
async function forwardToSidecar(sidecarBaseUrl, token, text) {
  let requestId = "0";
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.id === "string") requestId = parsed.id;
    const res = await fetch(`${sidecarBaseUrl.replace(/\/$/, "")}${V1_HTTP_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${AUTH_BEARER_PREFIX}${token}`,
        [AUTH_HEADER_NAME]: token,
      },
      body: typeof text === "string" ? text : JSON.stringify(parsed),
    });
    return await res.json();
  } catch (err) {
    return {
      v: 1,
      id: requestId,
      type: "error",
      ok: false,
      error: {
        code: "exec_failed",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export { buildCustomerWorkspaceWsUrl };
