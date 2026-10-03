import { useSyncExternalStore } from "react";
import {
  hasCompanyLlmSession,
  readCompanyLlmSession,
  subscribeCompanyLlmSession,
  type CompanyLlmSession,
} from "#/api/company-llm";

function getSessionSnapshot(): CompanyLlmSession | null {
  return readCompanyLlmSession();
}

function getServerSnapshot(): CompanyLlmSession | null {
  return null;
}

/** React subscription to the company LLM localStorage session. */
export function useCompanyLlmSession(): CompanyLlmSession | null {
  return useSyncExternalStore(
    subscribeCompanyLlmSession,
    getSessionSnapshot,
    getServerSnapshot,
  );
}

export function useHasCompanyLlmSession(): boolean {
  const session = useCompanyLlmSession();
  return session !== null || hasCompanyLlmSession();
}
