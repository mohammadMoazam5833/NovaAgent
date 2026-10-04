export {
  LOCAL_TOOLS_PROTOCOL_VERSION,
  DEFAULT_LOCAL_TOOLS_HOST,
  DEFAULT_LOCAL_TOOLS_PORT,
  DEFAULT_CUSTOMER_WORKSPACE_GATEWAY_HOST,
  DEFAULT_CUSTOMER_WORKSPACE_GATEWAY_PORT,
  CUSTOMER_WORKSPACE_HTTP_PATH,
  CUSTOMER_WORKSPACE_WS_PATH,
  CUSTOMER_WORKSPACE_HEALTH_PATH,
  CUSTOMER_WORKSPACE_STATUS_PATH,
  ENV_CUSTOMER_WORKSPACE_GATEWAY,
  ENV_CUSTOMER_WORKSPACE_TOKEN,
  ENV_CUSTOMER_WORKSPACE_HOST,
  ENV_CUSTOMER_WORKSPACE_PORT,
  DEFAULT_GATEWAY_FORWARD_TIMEOUT_MS,
  DEFAULT_READ_FILE_MAX_BYTES,
  DEFAULT_EXEC_TIMEOUT_MS,
  ENV_LOCAL_TOOLS_HOST,
  ENV_LOCAL_TOOLS_PORT,
  ENV_LOCAL_TOOLS_TOKEN,
  ENV_LOCAL_TOOLS_ROOTS,
  ENV_LOCAL_TOOLS_SIDECAR,
  AUTH_HEADER_NAME,
  AUTH_BEARER_PREFIX,
  HEALTH_PATH,
  V1_HTTP_PATH,
  V1_WS_PATH,
} from "./constants";

export {
  REQUEST_TYPES,
  isLocalToolsRequestType,
  parseLocalToolsRequest,
} from "./protocol";

export type {
  LocalToolsRequestType,
  LocalToolsResponseType,
  LocalToolsErrorCode,
  LocalToolsRequestBase,
  HelloParams,
  ListDirParams,
  ReadFileParams,
  WriteFileParams,
  ExecParams,
  DirEntry,
  HelloResult,
  ListDirResult,
  ReadFileResult,
  WriteFileResult,
  ExecResult,
  LocalToolsResultResponse,
  LocalToolsErrorResponse,
  LocalToolsResponse,
} from "./protocol";

export { LocalToolsSidecarClient, LocalToolsSidecarError } from "./client";

export type { LocalToolsSidecarClientOptions } from "./client";
