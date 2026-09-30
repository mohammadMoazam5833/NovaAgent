/**
 * URL helpers for the reverse customer-workspace tunnel.
 */

import {
  CUSTOMER_WORKSPACE_HTTP_PATH,
  CUSTOMER_WORKSPACE_WS_PATH,
  DEFAULT_CUSTOMER_WORKSPACE_GATEWAY_HOST,
  DEFAULT_CUSTOMER_WORKSPACE_GATEWAY_PORT,
  ENV_CUSTOMER_WORKSPACE_GATEWAY,
  ENV_CUSTOMER_WORKSPACE_HOST,
  ENV_CUSTOMER_WORKSPACE_PORT,
} from "../local-tools-sidecar/constants.mjs";

/**
 * @param {string} pathname
 */
export function isCustomerWorkspaceWsPath(pathname) {
  return (
    pathname === CUSTOMER_WORKSPACE_WS_PATH ||
    pathname === `${CUSTOMER_WORKSPACE_WS_PATH}/` ||
    pathname === `${CUSTOMER_WORKSPACE_WS_PATH}/ws` ||
    pathname === "/v1/ws"
  );
}

/**
 * @param {string} pathname
 */
export function isCustomerWorkspaceHealthPath(pathname) {
  return (
    pathname === "/health" ||
    pathname === `${CUSTOMER_WORKSPACE_HTTP_PATH}/health`
  );
}

/**
 * @param {string} pathname
 */
export function isCustomerWorkspaceStatusPath(pathname) {
  return (
    pathname === CUSTOMER_WORKSPACE_HTTP_PATH ||
    pathname === `${CUSTOMER_WORKSPACE_HTTP_PATH}/`
  );
}

/**
 * Build the outbound WebSocket URL from a thin-client remote UI origin.
 * Uses the origin only (ingress lives at the VPN door), not any UI subpath.
 *
 * @param {string} remoteUiUrl  e.g. http://172.16.40.188:8000
 * @returns {string} ws(s)://host/customer-workspace
 */
export function buildCustomerWorkspaceWsUrl(remoteUiUrl) {
  const parsed = new URL(remoteUiUrl);
  const wsProtocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${parsed.host}${CUSTOMER_WORKSPACE_WS_PATH}`;
}

/**
 * Company-local sidecar-protocol base URL for agent-server / sidecar_bridge.
 *
 * @param {{ host?: string, port?: number | string }} [opts]
 */
export function buildCustomerWorkspaceGatewayHttpUrl(opts = {}) {
  const host = opts.host || DEFAULT_CUSTOMER_WORKSPACE_GATEWAY_HOST;
  const port = opts.port || DEFAULT_CUSTOMER_WORKSPACE_GATEWAY_PORT;
  return `http://${host}:${port}`;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isCustomerWorkspaceGatewayEnabled(env = process.env) {
  return env[ENV_CUSTOMER_WORKSPACE_GATEWAY] === "1";
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveCustomerWorkspaceGatewayListen(env = process.env) {
  const host =
    String(env[ENV_CUSTOMER_WORKSPACE_HOST] || "").trim() ||
    DEFAULT_CUSTOMER_WORKSPACE_GATEWAY_HOST;
  const portRaw = String(env[ENV_CUSTOMER_WORKSPACE_PORT] || "").trim();
  const port = portRaw
    ? Number(portRaw)
    : DEFAULT_CUSTOMER_WORKSPACE_GATEWAY_PORT;
  return { host, port };
}
