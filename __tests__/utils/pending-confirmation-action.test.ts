import { describe, expect, it } from "vitest";

import { SecurityRisk } from "#/types/agent-server/core/base/common";
import type { ActionEvent } from "#/types/agent-server/core/events/action-event";
import type { OpenHandsEvent } from "#/types/agent-server/core";
import {
  findPendingConfirmationAction,
  summarizePendingConfirmation,
} from "#/utils/pending-confirmation-action";
import {
  CONFIRMATION_REJECT_REASON,
  CONFIRMATION_SKIP_REASON,
  NEVER_CONFIRM_POLICY,
} from "#/constants/confirmation";

function makeBashAction(command: string): ActionEvent {
  return {
    id: "evt-1",
    timestamp: new Date().toISOString(),
    source: "agent",
    thought: [],
    thinking_blocks: [],
    action: { kind: "ExecuteBashAction", command, is_input: false, timeout: null, reset: false },
    tool_name: "terminal",
    tool_call_id: "call-1",
    tool_call: {
      id: "call-1",
      type: "function",
      function: { name: "terminal", arguments: "{}" },
    },
    llm_response_id: "llm-1",
    security_risk: SecurityRisk.HIGH,
  } as ActionEvent;
}

describe("pending-confirmation-action", () => {
  it("finds the latest agent ActionEvent", () => {
    const bash = makeBashAction("rm -rf /tmp/x");
    const events = [
      { id: "u1", source: "user", timestamp: "1" },
      bash,
      { id: "u2", source: "user", timestamp: "3" },
    ] as OpenHandsEvent[];

    expect(findPendingConfirmationAction(events)).toBe(bash);
  });

  it("summarizes tool name, command preview, and risk", () => {
    const summary = summarizePendingConfirmation(
      makeBashAction("echo hello && curl https://example.com"),
    );
    expect(summary.toolName).toBe("terminal");
    expect(summary.argsPreview).toContain("echo hello");
    expect(summary.risk).toBe(SecurityRisk.HIGH);
  });
});

describe("confirmation constants", () => {
  it("exposes distinct skip/reject reasons and NeverConfirm policy", () => {
    expect(CONFIRMATION_SKIP_REASON).toBe("skipped_by_user");
    expect(CONFIRMATION_REJECT_REASON).toBe("rejected_by_user");
    expect(NEVER_CONFIRM_POLICY).toEqual({ kind: "NeverConfirm" });
  });
});
