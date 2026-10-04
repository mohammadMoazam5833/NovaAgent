import {
  COMPANY_LLM_URL_ENV_KEY,
  COMPANY_LLM_URL_VITE_KEY,
  COMPANY_LLM_URL_WINDOW_KEY,
} from "#/constants/company-llm";

function trimToNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function normalizeHttpUrl(value?: string | null): string | null {
  const trimmed = trimToNull(value);
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  const path =
    parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
  return `${parsed.origin}${path}${parsed.search}${parsed.hash}`;
}

/**
 * Company LLM gateway root URL (no trailing slash), or null when
 * company-managed mode is off.
 *
 * Precedence:
 *   1. `import.meta.env.VITE_NOVAAGENT_COMPANY_LLM_URL`
 *   2. `window.__NOVAAGENT_COMPANY_LLM_URL__` (static-server / Electron inject)
 */
export function getCompanyLlmUrl(): string | null {
  const fromVite = normalizeHttpUrl(
    // Vite only exposes VITE_* keys on import.meta.env
    (import.meta.env as Record<string, string | undefined>)[
      COMPANY_LLM_URL_VITE_KEY
    ],
  );
  if (fromVite) return fromVite;

  if (typeof window !== "undefined") {
    const injected = (window as unknown as Record<string, unknown>)[
      COMPANY_LLM_URL_WINDOW_KEY
    ];
    if (typeof injected === "string") {
      return normalizeHttpUrl(injected);
    }
  }

  return null;
}

/** True when a company LLM gateway URL is configured (Hybrid managed mode). */
export function isCompanyLlmManagedMode(): boolean {
  return getCompanyLlmUrl() !== null;
}

/**
 * OpenAI-compatible base URL for the managed LLM profile (`…/v1`).
 * If the configured company URL already ends with `/v1`, it is returned as-is.
 */
export function getCompanyLlmOpenAiBaseUrl(
  companyUrl: string = getCompanyLlmUrl() ?? "",
): string | null {
  const normalized = normalizeHttpUrl(companyUrl);
  if (!normalized) return null;
  if (/\/v1$/i.test(normalized)) return normalized;
  return `${normalized}/v1`;
}

/**
 * Map a company-catalog model id to the LiteLLM model string stored on the
 * local agent-server profile.
 *
 * LiteLLM requires a provider prefix when `base_url` is set (custom OpenAI-
 * compatible gateway). Catalogs usually return bare ids like
 * `qwen3-coder-30b`; without `openai/` the agent-server fails with
 * `LLM Provider NOT provided` before any HTTP call.
 *
 * Ids that already include a provider (`openai/…`, `anthropic/…`, …) are
 * returned unchanged.
 */
export function toCompanyLlmAgentServerModel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes("/")) return trimmed;
  return `openai/${trimmed}`;
}

/**
 * Strip the `openai/` prefix we add for LiteLLM so UI / session state can
 * match bare catalog ids from GET /v1/models.
 */
export function toCompanyLlmCatalogModelId(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return trimmed;
  const match = /^openai\/(.+)$/i.exec(trimmed);
  return match?.[1] ?? trimmed;
}

/** Re-export for callers that need the raw env key name. */
export { COMPANY_LLM_URL_ENV_KEY };
