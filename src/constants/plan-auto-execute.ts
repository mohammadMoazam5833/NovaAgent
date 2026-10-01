/**
 * Plan → Build automation preferences (session-local).
 */
export const PLAN_AUTO_EXECUTE_STORAGE_KEY =
  "openhands-plan-auto-execute-enabled";

export function isPlanAutoExecuteEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return (
      window.localStorage.getItem(PLAN_AUTO_EXECUTE_STORAGE_KEY) === "true"
    );
  } catch {
    return false;
  }
}

export function setPlanAutoExecuteEnabled(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      PLAN_AUTO_EXECUTE_STORAGE_KEY,
      enabled ? "true" : "false",
    );
  } catch {
    // ignore
  }
}
