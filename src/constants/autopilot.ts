/**
 * Cursor-like autonomy defaults (formerly the optional Autopilot chat toggle).
 * These are the product baseline for new conversations / DEFAULT_SETTINGS.
 *
 * @spec AUTOPILOT-001 — Autonomy preset constants
 */
export const AUTOPILOT_MAX_ITERATIONS = 800;

/** @deprecated Kept for migration keys; autonomy is always-on by default. */
export const AUTOPILOT_STORAGE_KEY = "openhands-autopilot-enabled";

/** Conversation-level confirmation: pause only on HIGH-risk actions. */
export const AUTOPILOT_CONFIRMATION = {
  confirmation_mode: true,
  security_analyzer: "llm",
} as const;

export const AUTOPILOT_CONDENSER = {
  enabled: true,
  max_size: 240,
  keep_first: 4,
} as const;
