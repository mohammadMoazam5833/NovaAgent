import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "#/services/settings";
import { AUTOPILOT_MAX_ITERATIONS } from "#/constants/autopilot";
import {
  buildAutopilotDisablePatch,
  buildAutopilotEnablePatch,
  isAutopilotEnabled,
} from "#/utils/autopilot-settings";

describe("autopilot-settings", () => {
  // @spec AUTOPILOT-001 — Cursor-like autonomy is the product default
  it("reports enabled for default settings", () => {
    expect(isAutopilotEnabled(DEFAULT_SETTINGS)).toBe(true);
  });

  it("enable patch matches the autonomy preset shape", () => {
    const patch = buildAutopilotEnablePatch();
    expect(patch.agent_settings_diff.enable_sub_agents).toBe(true);
    expect(
      (patch.agent_settings_diff.agent_context as { load_memory: boolean })
        .load_memory,
    ).toBe(true);
    expect(patch.conversation_settings_diff.max_iterations).toBe(
      AUTOPILOT_MAX_ITERATIONS,
    );
    expect(isAutopilotEnabled(DEFAULT_SETTINGS)).toBe(true);
  });

  it("disable patch turns sub-agents and memory off", () => {
    const patch = buildAutopilotDisablePatch();
    expect(patch.agent_settings_diff.enable_sub_agents).toBe(false);
    expect(
      (patch.agent_settings_diff.agent_context as { load_memory: boolean })
        .load_memory,
    ).toBe(false);
    expect(patch.conversation_settings_diff.confirmation_mode).toBe(false);
  });
});
