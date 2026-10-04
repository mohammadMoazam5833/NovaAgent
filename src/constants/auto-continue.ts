/**
 * Auto-continue when the agent finishes with unfinished task_tracker items.
 */
export const AUTO_CONTINUE_MAX_ATTEMPTS = 3;

export const AUTO_CONTINUE_STORAGE_KEY = "openhands-auto-continue-enabled";

export function isAutoContinueEnabled(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  try {
    const raw = window.localStorage.getItem(AUTO_CONTINUE_STORAGE_KEY);
    if (raw === null) {
      return true;
    }
    return raw === "true";
  } catch {
    return true;
  }
}

export function setAutoContinueEnabled(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      AUTO_CONTINUE_STORAGE_KEY,
      enabled ? "true" : "false",
    );
  } catch {
    // ignore
  }
}

export function buildAutoContinueNudge(tasks: string[]): string {
  const list = tasks.map((title) => `- ${title}`).join("\n");
  return `Continue. Unfinished tasks remain:\n${list}\nComplete the remaining items, then finish.`;
}
