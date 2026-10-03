/**
 * Reasons sent with `respond_to_confirmation` so the agent-server / LLM can
 * distinguish a hard reject from a soft skip of one pending action.
 */
export const CONFIRMATION_REJECT_REASON = "rejected_by_user";
export const CONFIRMATION_SKIP_REASON = "skipped_by_user";

/** Mid-run policy that auto-approves all further actions in this conversation. */
export const NEVER_CONFIRM_POLICY = { kind: "NeverConfirm" } as const;
