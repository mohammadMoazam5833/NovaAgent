import React from "react";
import { AgentStatus } from "#/components/features/controls/agent-status";
import { ChangeAgentButton } from "../change-agent-button";
import { ChatInputModel } from "./chat-input-model";
import { ChatInputLlmProfilePicker } from "./chat-input-llm-profile-picker";
import { ChatInputCompanyModelPicker } from "./chat-input-company-model-picker";
import { resolvePickerKind } from "./resolve-picker-kind";
import { ChatAddFileButton } from "../chat-add-file-button";
import { ChatSendButton } from "../chat-send-button";
import { useUnifiedPauseConversation } from "#/hooks/mutation/use-unified-stop-conversation";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { usePauseConversation } from "#/hooks/mutation/use-pause-conversation";
import { useResumeConversation } from "#/hooks/mutation/use-resume-conversation";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useAgentProfiles } from "#/hooks/query/use-agent-profiles";
import { useChatInputModelState } from "#/hooks/use-chat-input-model-state";
import { isCompanyLlmManagedMode } from "#/api/company-llm/company-llm-config";

interface ChatInputActionsProps {
  disabled: boolean;
  canSubmit?: boolean;
  hasStartedConversation?: boolean;
  onAddFileClick?: () => void;
  showButton?: boolean;
  buttonClassName?: string;
  handleSubmit?: () => void;
}

export function ChatInputActions({
  disabled,
  canSubmit = true,
  hasStartedConversation,
  onAddFileClick = () => {},
  showButton = true,
  buttonClassName = "",
  handleSubmit = () => {},
}: ChatInputActionsProps) {
  const unifiedPauseMutation = useUnifiedPauseConversation();
  const pauseConversationMutation = usePauseConversation();
  const resumeConversationMutation = useResumeConversation();
  const { conversationId } = useOptionalConversationId();
  const { backend } = useActiveBackend();
  const isCloud = backend.kind === "cloud";
  const modelState = useChatInputModelState();
  // Agent-profile switching lives in the "+" tools menu while the conversation
  // hasn't started (OSS-5735) — the pill itself is always an LLM selector. The
  // gate is computed here (not in the menu) so ToolsContextMenu only mounts the
  // profile submenu when it can actually be used: pre-start, not on a task
  // route, and only when the backend has profiles (#1571 fallback). Fetch is
  // limited to the pre-start window.
  const isPreStart = !conversationId || hasStartedConversation === false;
  const agentProfilesForStart = useAgentProfiles({ enabled: isPreStart });
  const showAgentProfileSwitch =
    isPreStart &&
    !(conversationId?.startsWith("task-") ?? false) &&
    (agentProfilesForStart.data?.profiles?.length ?? 0) > 0;
  // Code/Plan mode switching is a cloud OpenHands feature — it doesn't apply
  // to ACP conversations (which have no "plan" mode), so hide it when ACP.
  const showChangeAgentButton = isCloud && !modelState.isAcpContext;

  const pauseConversation = () => {
    if (!conversationId) return;
    pauseConversationMutation.mutate({ conversationId });
  };

  const resumeConversation = () => {
    if (!conversationId) return;
    resumeConversationMutation.mutate({ conversationId });
  };

  const isPausing =
    unifiedPauseMutation.isPending || pauseConversationMutation.isPending;

  // Which chat-input LLM picker to show — ACP models, company gateway models,
  // or LLM profiles (unit-tested in `resolve-picker-kind.test.ts`).
  const pickerKind = resolvePickerKind({
    isAcp: modelState.isAcpContext,
    isCompanyManaged: isCompanyLlmManagedMode(),
  });

  return (
    <div className="w-full min-w-0 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1">
        <div className="flex min-w-0 items-center gap-3">
          <ChatAddFileButton
            disabled={disabled}
            handleFileIconClick={onAddFileClick}
            showAgentProfileSwitch={showAgentProfileSwitch}
          />
          {showChangeAgentButton && <ChangeAgentButton />}
          {/* Picker depends on backend + ACP context; see `resolvePickerKind`. */}
          {pickerKind === "model" ? (
            <ChatInputModel />
          ) : pickerKind === "company-model" ? (
            <ChatInputCompanyModelPicker />
          ) : (
            <ChatInputLlmProfilePicker />
          )}
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {conversationId && (
          <AgentStatus
            handleStop={pauseConversation}
            handleResumeAgent={resumeConversation}
            disabled={disabled}
            isPausing={isPausing}
          />
        )}
        {showButton && (
          <ChatSendButton
            buttonClassName={buttonClassName}
            handleSubmit={handleSubmit}
            disabled={disabled || !canSubmit}
          />
        )}
      </div>
    </div>
  );
}
