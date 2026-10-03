import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { AgentState } from "#/types/agent-state";
import { RiskAlert } from "#/components/shared/risk-alert";
import WarningIcon from "#/icons/u-warning.svg?react";
import { useEventMessageStore } from "#/stores/event-message-store";
import { useEventStore } from "#/stores/use-event-store";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useAgentState } from "#/hooks/use-agent-state";
import { useRespondToConfirmation } from "#/hooks/mutation/use-respond-to-confirmation";
import { useSetConfirmationPolicy } from "#/hooks/mutation/use-set-confirmation-policy";
import { SecurityRisk } from "#/types/agent-server/core/base/common";
import {
  CONFIRMATION_REJECT_REASON,
  CONFIRMATION_SKIP_REASON,
  NEVER_CONFIRM_POLICY,
} from "#/constants/confirmation";
import {
  findPendingConfirmationAction,
  summarizePendingConfirmation,
} from "#/utils/pending-confirmation-action";
import { BrandButton } from "#/components/features/settings/brand-button";
import { cn } from "#/utils/utils";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";

type ConfirmationDecision = "approve" | "reject" | "skip" | "always_allow";

/**
 * Cursor-like human-in-the-loop card shown while the agent-server holds a
 * pending tool call (`waiting_for_confirmation`).
 */
export function ConversationConfirmationButtons() {
  const submittedEventIds = useEventMessageStore(
    (state) => state.submittedEventIds,
  );
  const addSubmittedEventId = useEventMessageStore(
    (state) => state.addSubmittedEventId,
  );

  const { t } = useTranslation("openhands");
  const { data: conversation } = useActiveConversation();
  const { curAgentState } = useAgentState();
  const { mutateAsync: respondToConfirmation, isPending: isResponding } =
    useRespondToConfirmation();
  const { mutateAsync: setConfirmationPolicy, isPending: isSettingPolicy } =
    useSetConfirmationPolicy();
  const events = useEventStore((state) => state.events);
  const [busyDecision, setBusyDecision] = useState<ConfirmationDecision | null>(
    null,
  );

  const awaitingAction = useMemo(
    () =>
      curAgentState === AgentState.AWAITING_USER_CONFIRMATION
        ? findPendingConfirmationAction(events)
        : null,
    [curAgentState, events],
  );

  const summary = useMemo(
    () =>
      awaitingAction ? summarizePendingConfirmation(awaitingAction) : null,
    [awaitingAction],
  );

  const isBusy = isResponding || isSettingPolicy || busyDecision !== null;

  const handleDecision = useCallback(
    async (decision: ConfirmationDecision) => {
      if (!awaitingAction || !conversation || isBusy) {
        return;
      }

      setBusyDecision(decision);
      addSubmittedEventId(awaitingAction.id);

      try {
        if (decision === "always_allow") {
          await setConfirmationPolicy({
            conversationId: conversation.id,
            conversationUrl: conversation.conversation_url || "",
            sessionApiKey: conversation.session_api_key,
            policy: NEVER_CONFIRM_POLICY,
          });
          await respondToConfirmation({
            conversationId: conversation.id,
            conversationUrl: conversation.conversation_url || "",
            sessionApiKey: conversation.session_api_key,
            accept: true,
          });
          displaySuccessToast(t(I18nKey.CHAT_INTERFACE$ALWAYS_ALLOW_APPLIED));
          return;
        }

        const accept = decision === "approve";
        let reason: string | undefined;
        if (decision === "reject") {
          reason = CONFIRMATION_REJECT_REASON;
        } else if (decision === "skip") {
          reason = CONFIRMATION_SKIP_REASON;
        }

        await respondToConfirmation({
          conversationId: conversation.id,
          conversationUrl: conversation.conversation_url || "",
          sessionApiKey: conversation.session_api_key,
          accept,
          reason,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t(I18nKey.ERROR$GENERIC);
        displayErrorToast(message);
      } finally {
        setBusyDecision(null);
      }
    },
    [
      awaitingAction,
      conversation,
      isBusy,
      addSubmittedEventId,
      setConfirmationPolicy,
      respondToConfirmation,
      t,
    ],
  );

  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!awaitingAction) {
      return undefined;
    }

    if (typeof cardRef.current?.scrollIntoView === "function") {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey && event.metaKey && event.key === "Backspace") {
        event.preventDefault();
        void handleDecision("reject");
        return;
      }
      if (event.metaKey && event.key === "Enter") {
        event.preventDefault();
        void handleDecision("approve");
        return;
      }
      // Skip: ⌥⌘⌫ (Alt+Cmd+Backspace)
      if (event.altKey && event.metaKey && event.key === "Backspace") {
        event.preventDefault();
        void handleDecision("skip");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [awaitingAction, handleDecision]);

  if (
    curAgentState !== AgentState.AWAITING_USER_CONFIRMATION ||
    !awaitingAction ||
    !summary ||
    submittedEventIds.includes(awaitingAction.id)
  ) {
    return null;
  }

  const isHighRisk = summary.risk === SecurityRisk.HIGH;

  return (
    <div
      ref={cardRef}
      className="flex flex-col gap-3 rounded-xl border-2 border-[var(--oh-accent)] bg-[var(--oh-surface)] p-4 shadow-[0_0_0_1px_color-mix(in_srgb,var(--oh-accent)_35%,transparent)]"
      data-testid="pending-confirmation-card"
    >
      {isHighRisk && (
        <RiskAlert
          content={t(I18nKey.CHAT_INTERFACE$HIGH_RISK_WARNING)}
          icon={<WarningIcon width={16} height={16} color="currentColor" />}
          severity="high"
          title={t(I18nKey.COMMON$HIGH_RISK)}
        />
      )}

      <div className="flex flex-col gap-1 min-w-0">
        <p className="text-sm font-medium text-foreground">
          {t(I18nKey.CHAT_INTERFACE$PENDING_ACTION_TITLE)}
        </p>
        <p className="text-xs text-[var(--oh-muted)]">
          {t(I18nKey.CHAT_INTERFACE$PENDING_ACTION_TOOL)}:{" "}
          <span className="font-mono text-foreground">{summary.toolName}</span>
        </p>
        {summary.argsPreview && (
          <pre
            className={cn(
              "mt-1 max-h-28 overflow-auto rounded-md px-2 py-1.5 text-xs font-mono",
              "bg-[color-mix(in_srgb,var(--oh-foreground)_8%,transparent)] text-foreground whitespace-pre-wrap break-all",
            )}
            data-testid="pending-confirmation-args"
          >
            {summary.argsPreview}
          </pre>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 justify-end">
        <BrandButton
          type="button"
          variant="tertiary"
          testId="action-reject-button"
          onClick={() => void handleDecision("reject")}
          isDisabled={isBusy}
          className="!h-8 !min-h-8 !px-3 !text-sm"
        >
          {t(I18nKey.ACTION$REJECT)}
        </BrandButton>
        <BrandButton
          type="button"
          variant="secondary"
          testId="action-skip-button"
          onClick={() => void handleDecision("skip")}
          isDisabled={isBusy}
          className="!h-8 !min-h-8 !px-3 !text-sm"
          ariaLabel={t(I18nKey.CHAT_INTERFACE$USER_SKIPPED)}
        >
          {t(I18nKey.ACTION$SKIP)}
        </BrandButton>
        <BrandButton
          type="button"
          variant="secondary"
          testId="action-always-allow-button"
          onClick={() => void handleDecision("always_allow")}
          isDisabled={isBusy}
          className="!h-8 !min-h-8 !px-3 !text-sm"
          ariaLabel={t(I18nKey.CHAT_INTERFACE$ALWAYS_ALLOW_TOOLTIP)}
        >
          {t(I18nKey.ACTION$ALWAYS_ALLOW)}
        </BrandButton>
        <BrandButton
          type="button"
          variant="primary"
          testId="action-confirm-button"
          onClick={() => void handleDecision("approve")}
          isDisabled={isBusy}
          className="!h-8 !min-h-8 !px-3 !text-sm"
        >
          {t(I18nKey.ACTION$APPROVE)}
          {/* eslint-disable-next-line i18next/no-literal-string -- keyboard shortcut glyph */}
          <span aria-hidden="true"> ⌘↩</span>
        </BrandButton>
      </div>
    </div>
  );
}
