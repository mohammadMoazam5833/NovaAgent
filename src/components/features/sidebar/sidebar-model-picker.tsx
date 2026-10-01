import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { useAgentProfiles } from "#/hooks/query/use-agent-profiles";
import { useChatInputModelState } from "#/hooks/use-chat-input-model-state";
import { isCompanyLlmManagedMode } from "#/api/company-llm/company-llm-config";
import { ChatAddFileButton } from "#/components/features/chat/chat-add-file-button";
import { ChatInputModel } from "#/components/features/chat/components/chat-input-model";
import { ChatInputCompanyModelPicker } from "#/components/features/chat/components/chat-input-company-model-picker";
import { ChatInputLlmProfilePicker } from "#/components/features/chat/components/chat-input-llm-profile-picker";
import { resolvePickerKind } from "#/components/features/chat/components/resolve-picker-kind";
import { cn } from "#/utils/utils";

export function SidebarModelPicker({ className }: { className?: string }) {
  const { conversationId } = useOptionalConversationId();
  const modelState = useChatInputModelState();
  const isPreStart = !conversationId;
  const agentProfiles = useAgentProfiles({ enabled: isPreStart });
  const showAgentProfileSwitch =
    isPreStart && (agentProfiles.data?.profiles?.length ?? 0) > 0;

  const pickerKind = resolvePickerKind({
    isAcp: modelState.isAcpContext,
    isCompanyManaged: isCompanyLlmManagedMode(),
  });

  return (
    <div
      className={cn(
        "flex min-w-0 items-center justify-between gap-2",
        className,
      )}
    >
      <ChatAddFileButton
        handleFileIconClick={() => {}}
        hideFileAction
        showAgentProfileSwitch={showAgentProfileSwitch}
      />
      <div className="flex min-w-0 items-center">
        {pickerKind === "model" ? (
          <ChatInputModel />
        ) : pickerKind === "company-model" ? (
          <ChatInputCompanyModelPicker />
        ) : (
          <ChatInputLlmProfilePicker />
        )}
      </div>
    </div>
  );
}
