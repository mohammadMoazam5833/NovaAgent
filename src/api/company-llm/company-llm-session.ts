import { COMPANY_LLM_SESSION_STORAGE_KEY } from "#/constants/company-llm";

export interface CompanyLlmSession {
  access_token: string;
  refresh_token?: string;
  /** Epoch ms when the access token expires, if the gateway returned expires_in. */
  expires_at?: number;
  username?: string;
  /** Last model id the user selected (or first listed on login). */
  selected_model?: string;
}

type SessionListener = () => void;

const listeners = new Set<SessionListener>();

/**
 * Cached snapshot for {@link readCompanyLlmSession}.
 *
 * `useSyncExternalStore` (via `useCompanyLlmSession`) requires `getSnapshot`
 * to return a referentially stable value when the store has not changed. A
 * fresh object on every localStorage parse would schedule infinite re-renders
 * (React minified error #185 — maximum update depth exceeded) as soon as a
 * session exists after company LLM login.
 */
let cachedRaw: string | null | undefined;
let cachedSession: CompanyLlmSession | null = null;

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Listener errors must not break session writes.
    }
  }
}

function parseSession(raw: string | null): CompanyLlmSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CompanyLlmSession>;
    if (
      typeof parsed.access_token !== "string" ||
      parsed.access_token.trim() === ""
    ) {
      return null;
    }
    const session: CompanyLlmSession = {
      access_token: parsed.access_token,
    };
    if (typeof parsed.refresh_token === "string" && parsed.refresh_token) {
      session.refresh_token = parsed.refresh_token;
    }
    if (
      typeof parsed.expires_at === "number" &&
      Number.isFinite(parsed.expires_at)
    ) {
      session.expires_at = parsed.expires_at;
    }
    if (typeof parsed.username === "string" && parsed.username) {
      session.username = parsed.username;
    }
    if (typeof parsed.selected_model === "string" && parsed.selected_model) {
      session.selected_model = parsed.selected_model;
    }
    return session;
  } catch {
    return null;
  }
}

function setSessionCache(
  raw: string | null,
  session: CompanyLlmSession | null,
): void {
  cachedRaw = raw;
  cachedSession = session;
}

/** Test / recovery helper: drop the in-memory snapshot cache. */
export function resetCompanyLlmSessionCacheForTests(): void {
  cachedRaw = undefined;
  cachedSession = null;
}

export function subscribeCompanyLlmSession(
  listener: SessionListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readCompanyLlmSession(): CompanyLlmSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COMPANY_LLM_SESSION_STORAGE_KEY);
    if (raw === cachedRaw) {
      return cachedSession;
    }
    const session = parseSession(raw);
    setSessionCache(raw, session);
    return session;
  } catch {
    setSessionCache(null, null);
    return null;
  }
}

export function writeCompanyLlmSession(session: CompanyLlmSession): void {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(session);
  window.localStorage.setItem(COMPANY_LLM_SESSION_STORAGE_KEY, serialized);
  // Keep cache aligned with what a subsequent read would parse, so
  // useSyncExternalStore tear checks see a stable reference.
  setSessionCache(serialized, parseSession(serialized));
  notifyListeners();
}

export function clearCompanyLlmSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(COMPANY_LLM_SESSION_STORAGE_KEY);
  setSessionCache(null, null);
  notifyListeners();
}

export function hasCompanyLlmSession(): boolean {
  return readCompanyLlmSession() !== null;
}

/**
 * Merge fields into the stored session (no-op when no session exists).
 */
export function patchCompanyLlmSession(
  patch: Partial<CompanyLlmSession>,
): CompanyLlmSession | null {
  const current = readCompanyLlmSession();
  if (!current) return null;
  const next: CompanyLlmSession = { ...current, ...patch };
  writeCompanyLlmSession(next);
  return next;
}
