import {
  AUTOPILOT_CONDENSER,
  AUTOPILOT_CONFIRMATION,
  AUTOPILOT_MAX_ITERATIONS,
} from "#/constants/autopilot";
import type { Settings, SettingsValue } from "#/types/settings";

export type AutopilotSettingsPatch = {
  agent_settings_diff: Record<string, SettingsValue>;
  conversation_settings_diff: Record<string, SettingsValue>;
  max_iterations: number;
};

/**
 * True when settings already match the Autopilot autonomy preset.
 */
export function isAutopilotEnabled(
  settings: Settings | undefined | null,
): boolean {
  if (!settings) {
    return false;
  }
  const agent = (settings.agent_settings ?? {}) as Record<
    string,
    SettingsValue
  >;
  const conversation = (settings.conversation_settings ?? {}) as Record<
    string,
    SettingsValue
  >;
  const agentContext = (agent.agent_context ?? {}) as Record<
    string,
    SettingsValue
  >;
  const condenser = (agent.condenser ?? {}) as Record<string, SettingsValue>;

  const subAgentsOn = agent.enable_sub_agents === true;
  const memoryOn = agentContext.load_memory === true;
  const confirmationOn =
    conversation.confirmation_mode === true ||
    settings.confirmation_mode === true;
  const analyzer =
    (conversation.security_analyzer as string | null | undefined) ??
    settings.security_analyzer;
  const riskyAnalyzer = analyzer === "llm";
  const iterations =
    typeof conversation.max_iterations === "number"
      ? conversation.max_iterations
      : settings.max_iterations;
  const highIterations =
    typeof iterations === "number" && iterations >= AUTOPILOT_MAX_ITERATIONS;
  const condenserOk =
    condenser.enabled !== false &&
    (typeof condenser.keep_first !== "number" ||
      condenser.keep_first >= AUTOPILOT_CONDENSER.keep_first);

  return (
    subAgentsOn &&
    memoryOn &&
    confirmationOn &&
    riskyAnalyzer &&
    highIterations &&
    condenserOk
  );
}

/**
 * Diff payload for {@link useSaveSettings} that enables Autopilot.
 */
export function buildAutopilotEnablePatch(): AutopilotSettingsPatch {
  return {
    agent_settings_diff: {
      enable_sub_agents: true,
      agent_context: { load_memory: true },
      condenser: { ...AUTOPILOT_CONDENSER },
    },
    conversation_settings_diff: {
      ...AUTOPILOT_CONFIRMATION,
      max_iterations: AUTOPILOT_MAX_ITERATIONS,
    },
    max_iterations: AUTOPILOT_MAX_ITERATIONS,
  };
}

/**
 * Diff that turns Autopilot off without wiping unrelated settings.
 * Leaves condenser/max_iterations alone; only clears the autonomy bundle.
 */
export function buildAutopilotDisablePatch(): AutopilotSettingsPatch {
  return {
    agent_settings_diff: {
      enable_sub_agents: false,
      agent_context: { load_memory: false },
    },
    conversation_settings_diff: {
      confirmation_mode: false,
      security_analyzer: "llm",
    },
    max_iterations: 500,
  };
}
