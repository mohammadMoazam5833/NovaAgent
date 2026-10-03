/**
 * Company-managed LLM (Hybrid desktop) identifiers.
 *
 * When {@link getCompanyLlmUrl} returns a non-empty URL, the UI hides manual
 * LLM credential editors and bootstraps a single managed local profile from
 * the company gateway token.
 */

/** Env var read by Electron / launchers (also mirrored as VITE_ for Vite). */
export const COMPANY_LLM_URL_ENV_KEY = "NOVAAGENT_COMPANY_LLM_URL";

/** Vite build-time / window-injection key for the company gateway root URL. */
export const COMPANY_LLM_URL_VITE_KEY = "VITE_NOVAAGENT_COMPANY_LLM_URL";

/** Window global injected by static-server / Electron for packaged builds. */
export const COMPANY_LLM_URL_WINDOW_KEY = "__NOVAAGENT_COMPANY_LLM_URL__";

/** localStorage key for the company gateway auth session. */
export const COMPANY_LLM_SESSION_STORAGE_KEY = "novaagent-company-llm-session";

/**
 * Fixed local agent-server LLM profile name owned by company-managed mode.
 * Must match agent-server `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` (no spaces).
 */
export const COMPANY_LLM_MANAGED_PROFILE_NAME = "NovaAgent-Company";
