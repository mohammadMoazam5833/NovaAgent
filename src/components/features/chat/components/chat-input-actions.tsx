import React from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import { AgentStatus } from "#/components/features/controls/agent-status";
import { ChangeAgentButton } from "../change-agent-button";
import { ChatSendButton } from "../chat-send-button";
import CarretRightFillIcon from "#/icons/carret-right-fill.svg?react";
import LessonPlanIcon from "#/icons/lesson-plan.svg?react";
import ThreeDotsVerticalIcon from "#/icons/three-dots-vertical.svg?react";
import { CodePillIcon } from "#/icons/code-pill";
import { useUnifiedPauseConversation } from "#/hooks/mutation/use-unified-stop-conversation";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { usePauseConversation } from "#/hooks/mutation/use-pause-conversation";
import { useResumeConversation } from "#/hooks/mutation/use-resume-conversation";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useChatInputModelState } from "#/hooks/use-chat-input-model-state";
import { useConversationStore } from "#/stores/conversation-store";
import { useAgentState } from "#/hooks/use-agent-state";
import { AgentState } from "#/types/agent-state";
import { useUnifiedWebSocketStatus } from "#/hooks/use-unified-websocket-status";
import { useHandlePlanClick } from "#/hooks/use-handle-plan-click";
import { I18nKey } from "#/i18n/declaration";
import { ToolsContextMenuIconText } from "../../controls/tools-context-menu-icon-text";
import { ContextMenuListItem } from "../../context-menu/context-menu-list-item";
import { ContextMenu } from "#/ui/context-menu";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { cn } from "#/utils/utils";
import { chatInputIconButtonClassName } from "#/utils/form-control-classes";

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
  showButton = true,
  buttonClassName = "",
  handleSubmit = () => {},
}: ChatInputActionsProps) {
  const { t } = useTranslation("openhands");
  const unifiedPauseMutation = useUnifiedPauseConversation();
  const pauseConversationMutation = usePauseConversation();
  const resumeConversationMutation = useResumeConversation();
  const { conversationId } = useOptionalConversationId();
  const { backend } = useActiveBackend();
  const isCloud = backend.kind === "cloud";
  const modelState = useChatInputModelState();
  // Code/Plan mode switching is a cloud OpenHands feature — it doesn't apply
  // to ACP conversations (which have no "plan" mode), so hide it when ACP.
  const showChangeAgentButton = isCloud && !modelState.isAcpContext;
  const webSocketStatus = useUnifiedWebSocketStatus();
  const { curAgentState } = useAgentState();
  const { conversationMode, setConversationMode } = useConversationStore();
  const { handlePlanClick, isCreatingConversation } = useHandlePlanClick();

  const actionsRowRef = React.useRef<HTMLDivElement>(null);
  const rightSectionRef = React.useRef<HTMLDivElement>(null);
  const codeRef = React.useRef<HTMLDivElement>(null);
  const overflowTriggerRef = React.useRef<HTMLButtonElement>(null);
  const [actionsRowWidth, setActionsRowWidth] = React.useState<number>(
    Number.POSITIVE_INFINITY,
  );
  const [rightSectionWidth, setRightSectionWidth] = React.useState(0);
  const [codeWidth, setCodeWidth] = React.useState(96);
  const [isOverflowOpen, setIsOverflowOpen] = React.useState(false);
  const [activeSubmenu, setActiveSubmenu] = React.useState<
    "agent" | "model" | null
  >(null);
  const [overflowPortalStyle, setOverflowPortalStyle] =
    React.useState<React.CSSProperties>();

  React.useEffect(() => {
    const rowEl = actionsRowRef.current;
    const rightEl = rightSectionRef.current;
    const codeEl = codeRef.current;

    if (
      !rowEl ||
      !rightEl ||
      (showChangeAgentButton && !codeEl) ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }

    const syncWidths = () => {
      const nextRowWidth = rowEl.getBoundingClientRect().width;
      const nextRightWidth = rightEl.getBoundingClientRect().width;

      if (nextRowWidth > 0) setActionsRowWidth(nextRowWidth);
      if (nextRightWidth > 0) setRightSectionWidth(nextRightWidth);

      if (codeEl) {
        const nextCodeWidth = codeEl.getBoundingClientRect().width;
        if (nextCodeWidth > 0) setCodeWidth(nextCodeWidth);
      }
    };

    const observer = new ResizeObserver(() => {
      syncWidths();
    });

    observer.observe(rowEl);
    observer.observe(rightEl);
    if (codeEl) {
      observer.observe(codeEl);
    }

    syncWidths();

    return () => observer.disconnect();
  }, [showChangeAgentButton]);

  const handlePauseAgent = () => {
    if (!conversationId) return;
    pauseConversationMutation.mutate({ conversationId });
  };

  const handleResumeAgentClick = () => {
    if (!conversationId) return;
    resumeConversationMutation.mutate({ conversationId });
  };

  const isPausing =
    unifiedPauseMutation.isPending || pauseConversationMutation.isPending;

  const OVERFLOW_BUTTON_WIDTH = 28;
  const INLINE_GAP = 12;
  const ROOT_GAP = 8;

  const fitOptionalItems = React.useCallback(
    (availableWidth: number) => {
      let remaining = availableWidth;
      const next = {
        showCodeInline: false,
      };

      if (showChangeAgentButton && remaining >= codeWidth) {
        next.showCodeInline = true;
        remaining -= codeWidth + INLINE_GAP;
      }

      return next;
    },
    [showChangeAgentButton, codeWidth],
  );

  const leftBaseWidth = actionsRowWidth - rightSectionWidth - ROOT_GAP;

  const fitWithoutOverflow = fitOptionalItems(leftBaseWidth);
  const allOptionalFit =
    !showChangeAgentButton || fitWithoutOverflow.showCodeInline;

  const fitWithOverflow = allOptionalFit
    ? fitWithoutOverflow
    : fitOptionalItems(leftBaseWidth - OVERFLOW_BUTTON_WIDTH - INLINE_GAP);

  const showCodeInline = !showChangeAgentButton
    ? false
    : fitWithOverflow.showCodeInline;
  const showAgentStatusInline = actionsRowWidth >= 360;

  const hasOverflowItems = showChangeAgentButton && !showCodeInline;

  React.useEffect(() => {
    if (!hasOverflowItems) {
      setIsOverflowOpen(false);
      setActiveSubmenu(null);
    }
  }, [hasOverflowItems]);

  const overflowMenuRef = useClickOutsideElement<HTMLUListElement>(() => {
    setIsOverflowOpen(false);
    setActiveSubmenu(null);
  });

  const isAgentSwitcherDisabled =
    curAgentState === AgentState.RUNNING ||
    isCreatingConversation ||
    webSocketStatus !== "OPEN";

  const closeOverflowMenus = () => {
    setActiveSubmenu(null);
    setIsOverflowOpen(false);
  };

  React.useLayoutEffect(() => {
    if (!isOverflowOpen || !overflowTriggerRef.current) {
      return;
    }

    const trigger = overflowTriggerRef.current;

    const updatePosition = () => {
      const rect = trigger.getBoundingClientRect();
      const GAP = 8;
      setOverflowPortalStyle({
        position: "fixed",
        top: rect.top - GAP,
        left: rect.left,
        transform: "translateY(-100%)",
        zIndex: 9999,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOverflowOpen]);

  const overflowMenu = (
    <ContextMenu
      ref={overflowMenuRef}
      testId="chat-input-overflow-menu"
      position="top"
      alignment="left"
      className="!static !top-auto !bottom-auto !left-auto !right-auto !mt-0 overflow-visible min-w-[200px]"
    >
      {showChangeAgentButton && !showCodeInline && (
        <div className="relative group/overflow-agent">
          <ContextMenuListItem
            testId="overflow-agent-button"
            onClick={() =>
              setActiveSubmenu((current) =>
                current === "agent" ? null : "agent",
              )
            }
            isDisabled={isAgentSwitcherDisabled}
          >
            <ToolsContextMenuIconText
              icon={<CodePillIcon className="h-[11px] w-[11px]" />}
              text={
                conversationMode === "code"
                  ? t(I18nKey.COMMON$CODE)
                  : t(I18nKey.COMMON$PLAN)
              }
              rightIcon={<CarretRightFillIcon width={10} height={10} />}
            />
          </ContextMenuListItem>
          {!isAgentSwitcherDisabled && (
            <div
              className={cn(
                "absolute left-full top-[-4px] z-60 opacity-0 invisible pointer-events-none transition-all duration-200 ml-[1px]",
                "group-hover/overflow-agent:opacity-100 group-hover/overflow-agent:visible group-hover/overflow-agent:pointer-events-auto",
                "hover:opacity-100 hover:visible hover:pointer-events-auto",
                activeSubmenu === "agent" &&
                  "opacity-100 visible pointer-events-auto",
              )}
            >
              <ContextMenu
                testId="overflow-agent-submenu"
                className="overflow-visible min-w-[195px]"
              >
                <ContextMenuListItem
                  testId="overflow-agent-code"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setConversationMode("code");
                    closeOverflowMenus();
                  }}
                >
                  <ToolsContextMenuIconText
                    icon={<CodePillIcon className="h-[11px] w-[11px]" />}
                    text={t(I18nKey.COMMON$CODE)}
                  />
                </ContextMenuListItem>
                <ContextMenuListItem
                  testId="overflow-agent-plan"
                  onClick={(event) => {
                    handlePlanClick(event);
                    closeOverflowMenus();
                  }}
                >
                  <ToolsContextMenuIconText
                    icon={
                      <LessonPlanIcon
                        width={16}
                        height={16}
                        color="currentColor"
                      />
                    }
                    text={t(I18nKey.COMMON$PLAN)}
                  />
                </ContextMenuListItem>
              </ContextMenu>
            </div>
          )}
        </div>
      )}
    </ContextMenu>
  );

  return (
    <div
      ref={actionsRowRef}
      className="w-full min-w-0 flex items-center justify-between gap-2"
    >
      <div className="flex min-w-0 items-center gap-1">
        <div className="flex min-w-0 items-center gap-3">
          {showChangeAgentButton && (
            <div ref={codeRef} className={cn(!showCodeInline && "hidden")}>
              <ChangeAgentButton />
            </div>
          )}
          {hasOverflowItems && (
            <div className="relative shrink-0">
              <button
                ref={overflowTriggerRef}
                type="button"
                className={cn(chatInputIconButtonClassName, "size-6")}
                aria-label={t(I18nKey.CHAT_INTERFACE$MORE_INPUT_ACTIONS)}
                aria-expanded={isOverflowOpen}
                aria-haspopup="menu"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setIsOverflowOpen((open) => !open);
                }}
              >
                <ThreeDotsVerticalIcon
                  width={16}
                  height={16}
                  color="currentColor"
                />
              </button>

              {isOverflowOpen &&
                typeof document !== "undefined" &&
                overflowPortalStyle &&
                ReactDOM.createPortal(
                  <div style={overflowPortalStyle}>{overflowMenu}</div>,
                  document.body,
                )}
            </div>
          )}
        </div>
      </div>
      <div
        ref={rightSectionRef}
        className="ml-auto flex shrink-0 items-center gap-2"
      >
        {showAgentStatusInline && conversationId && (
          <AgentStatus
            handleStop={handlePauseAgent}
            handleResumeAgent={handleResumeAgentClick}
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
