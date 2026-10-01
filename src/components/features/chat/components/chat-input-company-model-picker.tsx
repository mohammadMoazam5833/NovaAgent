import React from "react";
import { useTranslation } from "react-i18next";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useSettings } from "#/hooks/query/use-settings";
import { useCompanyLlmModels } from "#/hooks/query/use-company-llm-models";
import { useCompanyLlmSession } from "#/hooks/use-company-llm-session";
import { useSwitchCompanyLlmModel } from "#/hooks/mutation/use-switch-company-llm-model";
import { ComboboxCaretInline } from "#/ui/combobox-caret";
import CheckIcon from "#/icons/checkmark.svg?react";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { ContextMenu } from "#/ui/context-menu";
import { ContextMenuListItem } from "#/components/features/context-menu/context-menu-list-item";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { chatInputPillButtonClassName } from "#/utils/form-control-classes";
import { toCompanyLlmCatalogModelId } from "#/api/company-llm";

const MODEL_LABEL_MAX_CHARS = 18;

function truncateLabel(label: string): string {
  return label.length <= MODEL_LABEL_MAX_CHARS
    ? label
    : `${label.slice(0, MODEL_LABEL_MAX_CHARS)}…`;
}

interface CompanyModelMenuContentProps {
  onClose: () => void;
}

export function ChatInputCompanyModelMenuContent({
  onClose,
}: CompanyModelMenuContentProps) {
  const { t } = useTranslation("openhands");
  const { conversationId } = useOptionalConversationId();
  const { data: conversation } = useActiveConversation();
  const { data: settings } = useSettings();
  const session = useCompanyLlmSession();
  const modelsQuery = useCompanyLlmModels();
  const switchModel = useSwitchCompanyLlmModel();

  const models = modelsQuery.data ?? [];
  const currentModel = toCompanyLlmCatalogModelId(
    conversation?.llm_model ??
      session?.selected_model ??
      settings?.llm_model ??
      models[0] ??
      "",
  );

  const handleSelect = (modelId: string) => {
    if (modelId !== currentModel) {
      switchModel.mutate({
        conversationId: conversationId ?? null,
        model: modelId,
      });
    }
    onClose();
  };

  return (
    <>
      <li role="presentation" className="px-2 pt-1 pb-0.5">
        <Typography.Text className="text-[11px] font-medium text-[var(--oh-text-dim)] uppercase tracking-wide leading-4">
          {t(I18nKey.COMPANY_LLM$AVAILABLE_MODELS)}
        </Typography.Text>
      </li>
      {models.map((modelId) => {
        const isSelected = modelId === currentModel;
        return (
          <ContextMenuListItem
            key={modelId}
            testId={`chat-input-company-model-option-${modelId}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleSelect(modelId);
            }}
            className={cn(
              "flex items-center gap-2",
              isSelected && "bg-[var(--oh-interactive-hover)]",
            )}
          >
            <span className="flex-1 truncate text-sm leading-5" title={modelId}>
              {modelId}
            </span>
            {isSelected && (
              <CheckIcon
                width={14}
                height={14}
                className="shrink-0"
                aria-hidden
              />
            )}
          </ContextMenuListItem>
        );
      })}
    </>
  );
}

export function ChatInputCompanyModelPicker() {
  const { conversationId } = useOptionalConversationId();
  const { data: conversation } = useActiveConversation();
  const { data: settings } = useSettings();
  const session = useCompanyLlmSession();
  const modelsQuery = useCompanyLlmModels();
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = useClickOutsideElement<HTMLUListElement>(
    () => setIsPopoverOpen(false),
    triggerRef,
  );

  const displayModel = toCompanyLlmCatalogModelId(
    conversation?.llm_model ??
      session?.selected_model ??
      settings?.llm_model ??
      modelsQuery.data?.[0] ??
      "",
  );

  if (!displayModel) {
    return null;
  }

  // conversationId reserved for future gating parity with profile picker
  void conversationId;

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        className={chatInputPillButtonClassName}
        title={displayModel}
        data-testid="chat-input-company-llm-model"
        aria-expanded={isPopoverOpen}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsPopoverOpen((open) => !open);
        }}
      >
        <span>{truncateLabel(displayModel)}</span>
        <ComboboxCaretInline isOpen={isPopoverOpen} />
      </button>

      {isPopoverOpen && (
        <ContextMenu
          ref={popoverRef}
          testId="chat-input-company-llm-model-popover"
          position="top"
          alignment="left"
          spacing="none"
          className="z-[60] mb-2 min-w-[200px] max-w-[320px] max-h-[60vh] overflow-y-auto"
        >
          <ChatInputCompanyModelMenuContent
            onClose={() => setIsPopoverOpen(false)}
          />
        </ContextMenu>
      )}
    </div>
  );
}
