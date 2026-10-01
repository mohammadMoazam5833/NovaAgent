import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Sparkles } from "lucide-react";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { useAgentProfiles } from "#/hooks/query/use-agent-profiles";
import { useChatInputModelState } from "#/hooks/use-chat-input-model-state";
import { isCompanyLlmManagedMode } from "#/api/company-llm/company-llm-config";
import { toCompanyLlmCatalogModelId } from "#/api/company-llm";
import { useCompanyLlmSession } from "#/hooks/use-company-llm-session";
import { useCompanyLlmModels } from "#/hooks/query/use-company-llm-models";
import { useSwitchCompanyLlmModel } from "#/hooks/mutation/use-switch-company-llm-model";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useSettings } from "#/hooks/query/use-settings";
import { ChatAddFileButton } from "#/components/features/chat/chat-add-file-button";
import { ChatInputModel } from "#/components/features/chat/components/chat-input-model";
import { ChatInputLlmProfilePicker } from "#/components/features/chat/components/chat-input-llm-profile-picker";
import { resolvePickerKind } from "#/components/features/chat/components/resolve-picker-kind";
import { ContextMenu } from "#/ui/context-menu";
import { Divider } from "#/ui/divider";
import { NavigationLink } from "#/components/shared/navigation-link";
import CheckIcon from "#/icons/checkmark.svg?react";
import SettingsGearIcon from "#/icons/settings-gear.svg?react";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

const MODEL_TILE_CLASS =
  "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] bg-gradient-to-br from-[#d97757] to-[#8b7cf6] text-white";

function prettyModelLabel(id: string): string {
  const bare = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  return bare
    .split("-")
    .map((word) => (word === "glm" ? "GLM" : word))
    .join(" ");
}

function modelDescriptionKey(id: string): I18nKey {
  const model = id.toLowerCase();
  if (/(mini|flash|lite|small|air|nano|turbo|8b)/.test(model)) {
    return I18nKey.COMPANY_LLM$MODEL_DESC_FAST;
  }
  if (/(max|pro|opus|ultra|plus|70b|405b)/.test(model)) {
    return I18nKey.COMPANY_LLM$MODEL_DESC_POWER;
  }
  return I18nKey.COMPANY_LLM$MODEL_DESC_MAIN;
}

function CompanyModelCard() {
  const { t } = useTranslation("openhands");
  const { conversationId } = useOptionalConversationId();
  const { data: conversation } = useActiveConversation();
  const { data: settings } = useSettings();
  const session = useCompanyLlmSession();
  const modelsQuery = useCompanyLlmModels();
  const switchModel = useSwitchCompanyLlmModel();
  const [isOpen, setIsOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = useClickOutsideElement<HTMLUListElement>(
    () => setIsOpen(false),
    triggerRef,
  );

  const models = modelsQuery.data ?? [];
  const currentModel = toCompanyLlmCatalogModelId(
    conversation?.llm_model ??
      session?.selected_model ??
      settings?.llm_model ??
      models[0] ??
      "",
  );

  if (!currentModel && models.length === 0) {
    return null;
  }

  const handleSelect = (modelId: string) => {
    if (modelId !== currentModel) {
      switchModel.mutate({
        conversationId: conversationId ?? null,
        model: modelId,
      });
    }
    setIsOpen(false);
  };

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        data-testid="sidebar-model-picker"
        title={currentModel}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen((open) => !open);
        }}
        className={cn(
          "flex h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-[var(--oh-border)] px-2",
          "hover:bg-[var(--oh-surface-raised)]",
          isOpen && "bg-[var(--oh-surface-raised)]",
        )}
      >
        <span className={MODEL_TILE_CLASS}>
          <Sparkles width={10} height={10} strokeWidth={2.5} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-[13px] font-medium leading-5 text-foreground">
          {prettyModelLabel(currentModel)}
        </span>
        <ChevronDown
          width={14}
          height={14}
          className={cn(
            "shrink-0 text-[var(--oh-muted)] transition-transform",
            isOpen && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {isOpen && (
        <ContextMenu
          ref={popoverRef}
          testId="sidebar-model-picker-popover"
          position="top"
          alignment="left"
          spacing="none"
          className="z-[60] mb-2 min-w-[260px] max-w-[320px] max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--oh-border)] p-1.5 shadow-lg"
        >
          <li
            role="presentation"
            className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider leading-3.5 text-[var(--oh-muted)]"
          >
            {t(I18nKey.COMPANY_LLM$AVAILABLE_MODELS)}
          </li>
          {models.map((modelId) => {
            const isSelected = modelId === currentModel;
            return (
              <li key={modelId} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  data-testid={`sidebar-model-option-${modelId}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleSelect(modelId);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left",
                    "hover:bg-[var(--oh-surface-raised)]",
                    isSelected && "bg-[var(--oh-surface-raised)]",
                  )}
                >
                  <span className={MODEL_TILE_CLASS}>
                    <Sparkles
                      width={10}
                      height={10}
                      strokeWidth={2.5}
                      aria-hidden
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-[13px] font-medium leading-4 text-foreground"
                      title={modelId}
                    >
                      {prettyModelLabel(modelId)}
                    </span>
                    <span className="block truncate text-[11px] leading-3.5 text-[var(--oh-muted)]">
                      {t(modelDescriptionKey(modelId))}
                    </span>
                  </span>
                  {isSelected && (
                    <CheckIcon
                      width={14}
                      height={14}
                      className="shrink-0"
                      aria-hidden
                    />
                  )}
                </button>
              </li>
            );
          })}
          <Divider />
          <li>
            <NavigationLink
              to="/settings"
              onClick={() => setIsOpen(false)}
              className={cn(
                "flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] leading-5 text-[var(--oh-muted)]",
                "hover:bg-[var(--oh-surface-raised)] hover:text-foreground",
              )}
            >
              <SettingsGearIcon
                width={14}
                height={14}
                className="shrink-0"
                aria-hidden
              />
              <span>{t(I18nKey.SIDEBAR$SETTINGS)}</span>
            </NavigationLink>
          </li>
        </ContextMenu>
      )}
    </div>
  );
}

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
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      <div className="flex h-9 items-center">
        <ChatAddFileButton
          handleFileIconClick={() => {}}
          hideFileAction
          showAgentProfileSwitch={showAgentProfileSwitch}
        />
      </div>
      <div className="min-w-0 flex-1">
        {pickerKind === "company-model" ? (
          <CompanyModelCard />
        ) : pickerKind === "model" ? (
          <ChatInputModel />
        ) : (
          <ChatInputLlmProfilePicker />
        )}
      </div>
    </div>
  );
}
