import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { Typography } from "#/ui/typography";
import { useAgentState } from "#/hooks/use-agent-state";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { AgentState } from "#/types/agent-state";
import {
  readProjectTextFile,
  resolveProjectRulesPath,
  writeProjectTextFile,
} from "#/api/project-rules-files";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";

const MEMORY_CHAR_BUDGET = 6000;

/**
 * After the agent finishes, offer to append distilled notes to project MEMORY.md.
 * Conservative: requires explicit user confirmation.
 */
export function MemorySuggestBanner() {
  const { t } = useTranslation("openhands");
  const { conversationId } = useOptionalConversationId();
  const { curAgentState } = useAgentState();
  const { data: conversation } = useActiveConversation();
  const workingDir = conversation?.workspace?.working_dir?.trim() ?? null;

  const [open, setOpen] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const dismissedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!conversationId) {
      setOpen(false);
      return;
    }
    if (curAgentState !== AgentState.FINISHED) {
      return;
    }
    if (dismissedRef.current === conversationId) {
      return;
    }
    if (!workingDir) {
      return;
    }
    setNotes(t(I18nKey.MEMORY$DISTILL_PLACEHOLDER));
    setOpen(true);
  }, [conversationId, curAgentState, workingDir, t]);

  if (!open || !workingDir) {
    return null;
  }

  const onDismiss = () => {
    if (conversationId) {
      dismissedRef.current = conversationId;
    }
    setOpen(false);
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const path = resolveProjectRulesPath(workingDir, "memory");
      const existing = (await readProjectTextFile(path)) ?? "";
      const stamp = new Date().toISOString().slice(0, 10);
      const block = `\n\n## Session ${stamp}\n\n${notes.trim()}\n`;
      let next = `${existing.trimEnd()}${block}`.trimStart();
      if (next.length > MEMORY_CHAR_BUDGET) {
        next = next.slice(next.length - MEMORY_CHAR_BUDGET);
      }
      await writeProjectTextFile(path, `${next}\n`);
      displaySuccessToast(t(I18nKey.MEMORY$SAVED));
      onDismiss();
    } catch {
      displayErrorToast(t(I18nKey.RULES$SAVE_ERROR));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="memory-suggest-banner"
      className="mx-1 flex flex-col gap-2 rounded-lg border border-[var(--oh-border-subtle)] bg-[var(--oh-surface)] px-4 py-3"
    >
      <Typography.Text className="text-sm font-medium text-foreground">
        {t(I18nKey.MEMORY$SUGGEST_TITLE)}
      </Typography.Text>
      <Typography.Text className="text-xs text-[var(--oh-muted)]">
        {t(I18nKey.MEMORY$SUGGEST_BODY)}
      </Typography.Text>
      <textarea
        className="min-h-[96px] w-full rounded-md border border-[var(--oh-border)] bg-surface-base p-2 text-sm text-foreground"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex gap-2">
        <BrandButton
          type="button"
          variant="primary"
          testId="memory-suggest-save"
          isDisabled={saving || notes.trim().length === 0}
          onClick={() => {
            void onSave();
          }}
        >
          {t(I18nKey.MEMORY$SUGGEST_SAVE)}
        </BrandButton>
        <BrandButton type="button" variant="secondary" onClick={onDismiss}>
          {t(I18nKey.MEMORY$SUGGEST_DISMISS)}
        </BrandButton>
      </div>
    </div>
  );
}
