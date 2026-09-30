import { isActionEvent } from "#/types/agent-server/type-guards";
import type { OpenHandsEvent } from "#/types/agent-server/core";
import type { ActionEvent } from "#/types/agent-server/core/events/action-event";
import { SecurityRisk } from "#/types/agent-server/core/base/common";

const MAX_ARGS_PREVIEW = 280;

export interface PendingConfirmationSummary {
  toolName: string;
  argsPreview: string | null;
  risk: SecurityRisk;
  event: ActionEvent;
}

function previewFromAction(event: ActionEvent): string | null {
  if (event.summary?.trim()) {
    return truncate(event.summary.trim());
  }

  const action = event.action as {
    kind?: string;
    command?: string;
    path?: string;
  };
  if (
    (action.kind === "ExecuteBashAction" || action.kind === "TerminalAction") &&
    typeof action.command === "string" &&
    action.command.trim()
  ) {
    return truncate(action.command.trim());
  }

  if (typeof action.path === "string" && action.path.trim()) {
    const command =
      typeof (action as { command?: string }).command === "string"
        ? (action as { command: string }).command
        : null;
    return truncate(command ? `${command} ${action.path}` : action.path);
  }

  try {
    const raw = JSON.stringify(event.action);
    return raw ? truncate(raw) : null;
  } catch {
    return null;
  }
}

function truncate(value: string): string {
  if (value.length <= MAX_ARGS_PREVIEW) return value;
  return `${value.slice(0, MAX_ARGS_PREVIEW)}…`;
}

/**
 * Prefer the latest agent ActionEvent while awaiting confirmation — that is
 * the tool call the user is being asked to approve.
 */
export function findPendingConfirmationAction(
  events: OpenHandsEvent[],
): ActionEvent | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.source === "agent" && isActionEvent(event)) {
      return event;
    }
  }
  return null;
}

export function summarizePendingConfirmation(
  event: ActionEvent,
): PendingConfirmationSummary {
  return {
    toolName: event.tool_name || event.action.kind || "action",
    argsPreview: previewFromAction(event),
    risk: event.security_risk ?? SecurityRisk.UNKNOWN,
    event,
  };
}
