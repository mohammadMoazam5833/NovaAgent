export type PickerKind = "model" | "llm-profile" | "company-model";

export interface ConversationStartState {
  isLoadingHistory: boolean;
  hasUserEvents: boolean;
  hasPendingUserMessages: boolean;
  hasSubstantiveAgentActions: boolean;
  hasModelEntries: boolean;
}

export function hasConversationStarted({
  isLoadingHistory,
  hasUserEvents,
  hasPendingUserMessages,
  hasSubstantiveAgentActions,
  hasModelEntries,
}: ConversationStartState) {
  return (
    isLoadingHistory ||
    hasUserEvents ||
    hasPendingUserMessages ||
    hasSubstantiveAgentActions ||
    hasModelEntries
  );
}

export interface ResolvePickerKindInput {
  /** The current context runs an ACP agent (active conversation or active ACP profile). */
  isAcp: boolean;
  /** Hybrid company-managed LLM mode (local agent-server + company gateway). */
  isCompanyManaged?: boolean;
}
// The chat-input pill is always an LLM selector (OSS-5735): the ACP model
// picker in an ACP context (constrained to that provider's models), the
// company gateway model list when Hybrid managed mode is on, and the LLM
// profile picker otherwise — on every backend, before and during a
// conversation. Whether a pick is actionable (cloud org permission, start-task
// route) is decided in ``useChatInputLlmProfileState``, not by swapping in a
// different pill. Agent-profile switching lives in the "+" tools menu while
// the conversation hasn't started, not here.
export function resolvePickerKind({
  isAcp,
  isCompanyManaged = false,
}: ResolvePickerKindInput): PickerKind {
  if (isAcp) return "model";
  if (isCompanyManaged) return "company-model";
  return "llm-profile";
}
