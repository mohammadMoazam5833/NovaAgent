/**
 * Local Tools Sidecar — shared constants.
 * Keep in sync with scripts/local-tools-sidecar/constants.mjs
 */

export const LOCAL_TOOLS_PROTOCOL_VERSION = 1 as const;

export const DEFAULT_LOCAL_TOOLS_HOST = "127.0.0.1";
export const DEFAULT_LOCAL_TOOLS_PORT = 18765;

export const DEFAULT_CUSTOMER_WORKSPACE_GATEWAY_HOST = "127.0.0.1";
export const DEFAULT_CUSTOMER_WORKSPACE_GATEWAY_PORT = 18766;

export const CUSTOMER_WORKSPACE_HTTP_PATH = "/customer-workspace";
export const CUSTOMER_WORKSPACE_WS_PATH = "/customer-workspace";
export const CUSTOMER_WORKSPACE_HEALTH_PATH = "/customer-workspace/health";
export const CUSTOMER_WORKSPACE_STATUS_PATH = "/customer-workspace";

export const ENV_CUSTOMER_WORKSPACE_GATEWAY =
  "NOVAAGENT_CUSTOMER_WORKSPACE_GATEWAY";
export const ENV_CUSTOMER_WORKSPACE_TOKEN =
  "NOVAAGENT_CUSTOMER_WORKSPACE_TOKEN";
export const ENV_CUSTOMER_WORKSPACE_HOST = "NOVAAGENT_CUSTOMER_WORKSPACE_HOST";
export const ENV_CUSTOMER_WORKSPACE_PORT = "NOVAAGENT_CUSTOMER_WORKSPACE_PORT";

export const DEFAULT_GATEWAY_FORWARD_TIMEOUT_MS = 60_000;

export const DEFAULT_READ_FILE_MAX_BYTES = 2 * 1024 * 1024;
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
