/**
 * Local Tools Sidecar protocol types (Phase 1).
 * Wire format matches scripts/local-tools-sidecar/protocol.mjs
 */

import { LOCAL_TOOLS_PROTOCOL_VERSION } from "./constants";

export type LocalToolsRequestType =
  | "hello"
  | "list_dir"
  | "read_file"
  | "write_file"
  | "exec";

export type LocalToolsResponseType = "result" | "error";

export type LocalToolsErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "path_denied"
  | "not_found"
  | "too_large"
  | "exec_failed"
  | "timeout";

export interface LocalToolsRequestBase {
  v: typeof LOCAL_TOOLS_PROTOCOL_VERSION;
  id: string;
  type: LocalToolsRequestType;
  params?: Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface HelloParams {}

export interface ListDirParams {
  path: string;
}

export interface ReadFileParams {
  path: string;
}

export interface WriteFileParams {
  path: string;
  content: string;
  create_parents?: boolean;
}

export interface ExecParams {
  argv: string[];
  cwd?: string;
  timeout_ms?: number;
}

export interface DirEntry {
  name: string;
  type: "dir" | "file" | "other";
  size?: number;
}

export interface HelloResult {
  protocol: typeof LOCAL_TOOLS_PROTOCOL_VERSION;
  roots: string[];
  host: string;
  port: number;
}

export interface ListDirResult {
  path: string;
  entries: DirEntry[];
}

export interface ReadFileResult {
  path: string;
  encoding: "utf-8";
  content: string;
}

export interface WriteFileResult {
  path: string;
  bytes_written: number;
}

export interface ExecResult {
  exit_code: number;
  stdout: string;
  stderr: string;
  timed_out: boolean;
}

export interface LocalToolsResultResponse<T = unknown> {
  v: typeof LOCAL_TOOLS_PROTOCOL_VERSION;
  id: string;
  type: "result";
  ok: true;
  result: T;
}

export interface LocalToolsErrorResponse {
  v: typeof LOCAL_TOOLS_PROTOCOL_VERSION;
  id: string;
  type: "error";
  ok: false;
  error: {
    code: LocalToolsErrorCode | string;
    message: string;
  };
}

export type LocalToolsResponse<T = unknown> =
  | LocalToolsResultResponse<T>
  | LocalToolsErrorResponse;

export const REQUEST_TYPES: readonly LocalToolsRequestType[] = [
  "hello",
  "list_dir",
  "read_file",
  "write_file",
  "exec",
] as const;

export function isLocalToolsRequestType(
  value: string,
): value is LocalToolsRequestType {
  return (REQUEST_TYPES as readonly string[]).includes(value);
}

/**
 * Parse and validate a protocol request envelope.
 */
export function parseLocalToolsRequest(
  raw: unknown,
):
  | { ok: true; message: LocalToolsRequestBase }
  | { ok: false; error: { code: LocalToolsErrorCode; message: string } } {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return {
        ok: false,
        error: { code: "invalid_request", message: "body must be JSON" },
      };
    }
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      error: {
        code: "invalid_request",
        message: "body must be a JSON object",
      },
    };
  }

  const obj = value as Record<string, unknown>;
  if (obj.v !== LOCAL_TOOLS_PROTOCOL_VERSION) {
    return {
      ok: false,
      error: {
        code: "invalid_request",
        message: `unsupported protocol version (expected ${LOCAL_TOOLS_PROTOCOL_VERSION})`,
      },
    };
  }

  if (typeof obj.id !== "string" || obj.id.trim() === "") {
    return {
      ok: false,
      error: {
        code: "invalid_request",
        message: "id must be a non-empty string",
      },
    };
  }

  if (typeof obj.type !== "string" || !isLocalToolsRequestType(obj.type)) {
    return {
      ok: false,
      error: {
        code: "invalid_request",
        message: `type must be one of: ${REQUEST_TYPES.join(", ")}`,
      },
    };
  }

  if (
    obj.params !== undefined &&
    (obj.params === null ||
      typeof obj.params !== "object" ||
      Array.isArray(obj.params))
  ) {
    return {
      ok: false,
      error: {
        code: "invalid_request",
        message: "params must be an object when present",
      },
    };
  }

  return {
    ok: true,
    message: {
      v: LOCAL_TOOLS_PROTOCOL_VERSION,
      id: obj.id,
      type: obj.type,
      params: (obj.params as Record<string, unknown> | undefined) ?? {},
    },
  };
}
