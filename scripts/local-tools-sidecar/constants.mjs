/**
 * Local Tools Sidecar — shared constants (Node ESM).
 * Keep in sync with src/api/local-tools-sidecar/constants.ts
 */

export const LOCAL_TOOLS_PROTOCOL_VERSION = 1;

export const DEFAULT_LOCAL_TOOLS_HOST = "127.0.0.1";
export const DEFAULT_LOCAL_TOOLS_PORT = 18765;

/**
 * Company-local HTTP face of the reverse customer-workspace gateway.
 * Agent-server / sidecar_bridge talk here (localhost only). Must not collide
 * with Docker LLM ports 8001/8003 or the VPN UI door 8000.
 */
export const DEFAULT_CUSTOMER_WORKSPACE_GATEWAY_HOST = "127.0.0.1";
export const DEFAULT_CUSTOMER_WORKSPACE_GATEWAY_PORT = 18766;

/** Public path L2TP clients use on the VPN door (:8000) for outbound WS. */
export const CUSTOMER_WORKSPACE_HTTP_PATH = "/customer-workspace";
export const CUSTOMER_WORKSPACE_WS_PATH = "/customer-workspace";
export const CUSTOMER_WORKSPACE_HEALTH_PATH = "/customer-workspace/health";
export const CUSTOMER_WORKSPACE_STATUS_PATH = "/customer-workspace";

export const ENV_CUSTOMER_WORKSPACE_GATEWAY =
  "NOVAAGENT_CUSTOMER_WORKSPACE_GATEWAY";
export const ENV_CUSTOMER_WORKSPACE_TOKEN = "NOVAAGENT_CUSTOMER_WORKSPACE_TOKEN";
export const ENV_CUSTOMER_WORKSPACE_HOST = "NOVAAGENT_CUSTOMER_WORKSPACE_HOST";
export const ENV_CUSTOMER_WORKSPACE_PORT = "NOVAAGENT_CUSTOMER_WORKSPACE_PORT";

/** Default HTTP timeout while waiting for a reverse-WS round trip. */
export const DEFAULT_GATEWAY_FORWARD_TIMEOUT_MS = 60_000;

/** Max bytes for read_file responses. */
export const DEFAULT_READ_FILE_MAX_BYTES = 2 * 1024 * 1024;

/** Default exec timeout. */
export const DEFAULT_EXEC_TIMEOUT_MS = 30_000;

export const ENV_LOCAL_TOOLS_HOST = "NOVAAGENT_LOCAL_TOOLS_HOST";
export const ENV_LOCAL_TOOLS_PORT = "NOVAAGENT_LOCAL_TOOLS_PORT";
export const ENV_LOCAL_TOOLS_TOKEN = "NOVAAGENT_LOCAL_TOOLS_TOKEN";
export const ENV_LOCAL_TOOLS_ROOTS = "NOVAAGENT_LOCAL_TOOLS_ROOTS";
export const ENV_LOCAL_TOOLS_SIDECAR = "NOVAAGENT_LOCAL_TOOLS_SIDECAR";
/** Base URL for agent-server → sidecar bridge (e.g. http://127.0.0.1:18765). */
export const ENV_LOCAL_TOOLS_URL = "NOVAAGENT_LOCAL_TOOLS_URL";

export const AUTH_HEADER_NAME = "x-novaagent-local-tools-token";
export const AUTH_BEARER_PREFIX = "Bearer ";

export const HEALTH_PATH = "/health";
export const V1_HTTP_PATH = "/v1";
export const V1_WS_PATH = "/v1/ws";
