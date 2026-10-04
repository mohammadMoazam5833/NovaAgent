/**
 * Minimal HTTP client for the Local Tools Sidecar (Phase 1).
 * Not wired into Canvas UI yet — used by unit tests and future agent bridge.
 */

import {
  AUTH_BEARER_PREFIX,
  DEFAULT_LOCAL_TOOLS_HOST,
  DEFAULT_LOCAL_TOOLS_PORT,
  HEALTH_PATH,
  LOCAL_TOOLS_PROTOCOL_VERSION,
  V1_HTTP_PATH,
} from "./constants";
import type {
  ExecParams,
  ExecResult,
  HelloResult,
  ListDirParams,
  ListDirResult,
  LocalToolsRequestType,
  LocalToolsResponse,
  ReadFileParams,
  ReadFileResult,
  WriteFileParams,
  WriteFileResult,
} from "./protocol";

export interface LocalToolsSidecarClientOptions {
  host?: string;
  port?: number;
  token: string;
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch;
}

export class LocalToolsSidecarError extends Error {
  readonly code: string;
  readonly response?: LocalToolsResponse;

  constructor(code: string, message: string, response?: LocalToolsResponse) {
    super(message);
    this.name = "LocalToolsSidecarError";
    this.code = code;
    this.response = response;
  }
}

export class LocalToolsSidecarClient {
  readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private seq = 0;

  constructor(options: LocalToolsSidecarClientOptions) {
    const host = options.host ?? DEFAULT_LOCAL_TOOLS_HOST;
    const port = options.port ?? DEFAULT_LOCAL_TOOLS_PORT;
    this.baseUrl = `http://${host}:${port}`;
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  private nextId(): string {
    this.seq += 1;
    return `req-${this.seq}`;
  }

  async health(): Promise<{ ok: boolean; protocol: number }> {
    const res = await this.fetchImpl(`${this.baseUrl}${HEALTH_PATH}`);
    if (!res.ok) {
      throw new LocalToolsSidecarError(
        "exec_failed",
        `health check failed: HTTP ${res.status}`,
      );
    }
    return (await res.json()) as { ok: boolean; protocol: number };
  }

  async request<T>(
    type: LocalToolsRequestType,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const id = this.nextId();
    const body = {
      v: LOCAL_TOOLS_PROTOCOL_VERSION,
      id,
      type,
      params,
    };
    const res = await this.fetchImpl(`${this.baseUrl}${V1_HTTP_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${AUTH_BEARER_PREFIX}${this.token}`,
      },
      body: JSON.stringify(body),
    });

    let parsed: LocalToolsResponse<T>;
    try {
      parsed = (await res.json()) as LocalToolsResponse<T>;
    } catch {
      throw new LocalToolsSidecarError(
        "invalid_request",
        `non-JSON response (HTTP ${res.status})`,
      );
    }

    if (!parsed.ok) {
      throw new LocalToolsSidecarError(
        parsed.error.code,
        parsed.error.message,
        parsed,
      );
    }
    return parsed.result;
  }

  hello(): Promise<HelloResult> {
    return this.request<HelloResult>("hello");
  }

  listDir(params: ListDirParams): Promise<ListDirResult> {
    return this.request<ListDirResult>("list_dir", { ...params });
  }

  readFile(params: ReadFileParams): Promise<ReadFileResult> {
    return this.request<ReadFileResult>("read_file", { ...params });
  }

  writeFile(params: WriteFileParams): Promise<WriteFileResult> {
    return this.request<WriteFileResult>("write_file", { ...params });
  }

  exec(params: ExecParams): Promise<ExecResult> {
    return this.request<ExecResult>("exec", { ...params });
  }
}
