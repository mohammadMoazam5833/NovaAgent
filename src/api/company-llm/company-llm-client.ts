/**
 * Browser → company LLM gateway client (HTTPS).
 *
 * This is intentionally NOT an agent-server Rule 1 call — the company host is
 * an OpenAI-compatible LLM gateway, not Canvas/agent-server.
 *
 * Assumed gateway contract (document for company operators):
 *
 *   POST {base}/auth/login
 *   Body:    { "username": string, "password": string }
 *   Success: { "access_token": string, "expires_in"?: number, "refresh_token"?: string }
 *
 *   GET  {base}/v1/models
 *   Header: Authorization: Bearer <access_token>
 *   Success: OpenAI-style { "data": [ { "id": string, ... }, ... ] }
 *            (also accepts a bare string[] or { "models": [...] })
 */

import { getCompanyLlmUrl } from "./company-llm-config";

export interface CompanyLlmLoginResult {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
}

export class CompanyLlmClientError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "CompanyLlmClientError";
    this.status = status;
  }
}

function requireBaseUrl(baseUrl?: string | null): string {
  const base = (baseUrl ?? getCompanyLlmUrl())?.replace(/\/$/, "") ?? "";
  if (!base) {
    throw new CompanyLlmClientError(
      "Company LLM URL is not configured (NOVAAGENT_COMPANY_LLM_URL).",
    );
  }
  return base;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    if (typeof body.detail === "string" && body.detail.trim()) {
      return body.detail;
    }
    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    // fall through
  }
  return `Request failed (${response.status})`;
}

/**
 * Normalize OpenAI-style / alternate model list payloads to string ids.
 */
export function normalizeCompanyModelIds(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return dedupeModelIds(
      payload.map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          const id = (item as { id?: unknown }).id;
          return typeof id === "string" ? id.trim() : "";
        }
        return "";
      }),
    );
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const obj = payload as Record<string, unknown>;
  const list = Array.isArray(obj.data)
    ? obj.data
    : Array.isArray(obj.models)
      ? obj.models
      : Array.isArray(obj.items)
        ? obj.items
        : null;

  if (!list) return [];

  return dedupeModelIds(
    list.map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const id = (item as { id?: unknown }).id;
        return typeof id === "string" ? id.trim() : "";
      }
      return "";
    }),
  );
}

function dedupeModelIds(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Parse a login JSON body into {@link CompanyLlmLoginResult}.
 */
export function parseCompanyLlmLoginResponse(
  payload: unknown,
): CompanyLlmLoginResult {
  if (!payload || typeof payload !== "object") {
    throw new CompanyLlmClientError("Login response was empty or invalid.");
  }
  const obj = payload as Record<string, unknown>;
  const token =
    (typeof obj.access_token === "string" && obj.access_token) ||
    (typeof obj.accessToken === "string" && obj.accessToken) ||
    (typeof obj.token === "string" && obj.token) ||
    "";
  if (!token.trim()) {
    throw new CompanyLlmClientError(
      "Login response did not include an access_token.",
    );
  }
  const result: CompanyLlmLoginResult = { access_token: token.trim() };
  const expiresIn = obj.expires_in ?? obj.expiresIn;
  if (typeof expiresIn === "number" && Number.isFinite(expiresIn)) {
    result.expires_in = expiresIn;
  }
  const refresh =
    (typeof obj.refresh_token === "string" && obj.refresh_token) ||
    (typeof obj.refreshToken === "string" && obj.refreshToken) ||
    "";
  if (refresh.trim()) {
    result.refresh_token = refresh.trim();
  }
  return result;
}

export async function loginToCompanyLlm(
  username: string,
  password: string,
  options?: { baseUrl?: string; fetchImpl?: typeof fetch },
): Promise<CompanyLlmLoginResult> {
  const base = requireBaseUrl(options?.baseUrl);
  const fetchImpl = options?.fetchImpl ?? fetch;
  const response = await fetchImpl(`${base}/auth/login`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new CompanyLlmClientError(
      await readErrorMessage(response),
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new CompanyLlmClientError("Login response was not valid JSON.");
  }
  return parseCompanyLlmLoginResponse(payload);
}

export async function listCompanyLlmModels(
  accessToken: string,
  options?: { baseUrl?: string; fetchImpl?: typeof fetch },
): Promise<string[]> {
  const base = requireBaseUrl(options?.baseUrl);
  const fetchImpl = options?.fetchImpl ?? fetch;
  const response = await fetchImpl(`${base}/v1/models`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new CompanyLlmClientError(
      await readErrorMessage(response),
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new CompanyLlmClientError("Models response was not valid JSON.");
  }
  return normalizeCompanyModelIds(payload);
}
