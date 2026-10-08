/**
 * Cursor-style review on the Changes tab (Dorj Agent, phase 1 #2 #3):
 * - ChangeActions: keep (stage) or undo the agent's change to one file;
 * - CheckpointsBar: restore the workspace to any automatic checkpoint taken
 *   before each message (or one saved by hand), with undo.
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LuCheck, LuUndo2, LuHistory, LuBookmarkPlus } from "react-icons/lu";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { getGitPath } from "#/utils/get-git-path";
import {
  WorkspaceGit,
  joinWorkspacePath,
} from "#/api/git-service/workspace-git.api";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { cn } from "#/utils/utils";
import { I18nKey } from "#/i18n/declaration";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";

function useWorkspaceConn() {
  const { data: conversation } = useActiveConversation();
  const { conversationId } = useOptionalConversationId();
  const root = getGitPath(
    conversation?.selected_repository,
    conversation?.workspace?.working_dir?.trim(),
  );
  return {
    conn: {
      conversationUrl: conversation?.conversation_url,
      sessionApiKey: conversation?.session_api_key,
    },
    root,
    conversationId,
  };
}

const actionButton =
  "inline-flex items-center gap-1 px-2 py-1 rounded-[10px] text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer";

export function ChangeActions({ path }: { path: string }) {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const { conn, root } = useWorkspaceConn();
  const [busy, setBusy] = React.useState<"accept" | "revert" | null>(null);

  const run = async (kind: "accept" | "revert") => {
    if (
      kind === "revert" &&
      !window.confirm(t(I18nKey.REVIEW$UNDO_CONFIRM, { path }))
    ) {
      return;
    }
    setBusy(kind);
    try {
      const file = joinWorkspacePath(root, path);
      await (kind === "accept"
        ? WorkspaceGit.accept(conn, file)
        : WorkspaceGit.revert(conn, file));
      displaySuccessToast(
        kind === "accept" ? t(I18nKey.REVIEW$KEPT) : t(I18nKey.REVIEW$UNDONE),
      );
      await queryClient.invalidateQueries({ queryKey: ["file_changes"] });
      await queryClient.invalidateQueries({ queryKey: ["file_diff"] });
    } catch (e) {
      displayErrorToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <span
      className="flex items-center gap-1 shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        data-testid="change-accept"
        disabled={busy !== null}
        onClick={() => run("accept")}
        className={cn(
          actionButton,
          "text-[#4CC38A] hover:bg-[rgba(76,195,138,.12)]",
        )}
        title={t(I18nKey.REVIEW$KEEP_TITLE)}
      >
        <LuCheck className="w-3.5 h-3.5" />
        {t(I18nKey.REVIEW$KEEP)}
      </button>
      <button
        type="button"
        data-testid="change-revert"
        disabled={busy !== null}
        onClick={() => run("revert")}
        className={cn(
          actionButton,
          "text-[#E76A5E] hover:bg-[rgba(231,106,94,.12)]",
        )}
        title={t(I18nKey.REVIEW$UNDO_TITLE)}
      >
        <LuUndo2 className="w-3.5 h-3.5" />
        {t(I18nKey.REVIEW$UNDO)}
      </button>
    </span>
  );
}

function formatTime(at: number | null, fa: boolean) {
  if (!at) return "";
  return new Intl.DateTimeFormat(fa ? "fa-IR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(at * 1000));
}

export function CheckpointsBar() {
  const { t, i18n } = useTranslation("openhands");
  const fa = (i18n.language || "fa").startsWith("fa");
  const queryClient = useQueryClient();
  const { conn, root, conversationId } = useWorkspaceConn();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const { data: checkpoints = [], refetch } = useQuery({
    queryKey: ["dorj_checkpoints", conversationId, root, conn],
    queryFn: () => WorkspaceGit.listCheckpoints(conn, root),
    enabled: !!conversationId && !!root && open,
    retry: false,
    meta: { disableToast: true },
  });

  const save = async () => {
    setBusy(true);
    try {
      await WorkspaceGit.createCheckpoint(
        conn,
        root,
        t(I18nKey.CHECKPOINT$SAVED_BY_HAND),
      );
      displaySuccessToast(t(I18nKey.CHECKPOINT$SAVED));
      await refetch();
    } catch (e) {
      displayErrorToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (id: string, label: string) => {
    if (
      !window.confirm(
        t(I18nKey.CHECKPOINT$RESTORE_CONFIRM, { label: label || id }),
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await WorkspaceGit.restoreCheckpoint(conn, root, id);
      displaySuccessToast(
        res.removed.length
          ? t(I18nKey.CHECKPOINT$RESTORED_REMOVED, {
              count: res.removed.length,
            })
          : t(I18nKey.CHECKPOINT$RESTORED),
      );
      await queryClient.invalidateQueries({ queryKey: ["file_changes"] });
      await refetch();
    } catch (e) {
      displayErrorToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="checkpoints-bar"
      className="border-b border-[var(--oh-border)] px-3 py-2 text-sm"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="checkpoints-toggle"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            actionButton,
            "text-content hover:bg-[var(--oh-interactive-hover)]",
          )}
        >
          <LuHistory className="w-4 h-4" />
          {t(I18nKey.CHECKPOINT$TITLE)}
        </button>
        <button
          type="button"
          data-testid="checkpoint-save"
          disabled={busy}
          onClick={save}
          className={cn(
            actionButton,
            "text-[var(--oh-link)] hover:bg-[var(--oh-interactive-hover)]",
          )}
        >
          <LuBookmarkPlus className="w-4 h-4" />
          {t(I18nKey.CHECKPOINT$SAVE)}
        </button>
      </div>
      {open && (
        <ul className="mt-2 max-h-56 overflow-y-auto custom-scrollbar flex flex-col gap-1">
          {checkpoints.length === 0 && (
            <li className="text-[var(--oh-text-dim)] text-xs px-2 py-1">
              {t(I18nKey.CHECKPOINT$EMPTY)}
            </li>
          )}
          {checkpoints.map((cp) => (
            <li
              key={cp.id}
              className="flex items-center justify-between gap-2 rounded-[10px] px-2 py-1 hover:bg-[var(--oh-interactive-hover-low)]"
            >
              <span className="truncate">
                <span className="text-[var(--oh-text-dim)] text-xs me-2">
                  {formatTime(cp.at, fa)}
                </span>
                {cp.label || cp.id}
              </span>
              <button
                type="button"
                data-testid="checkpoint-restore"
                disabled={busy}
                onClick={() => restore(cp.id, cp.label)}
                className={cn(
                  actionButton,
                  "text-[var(--oh-warning)] hover:bg-[rgba(232,163,23,.12)] shrink-0",
                )}
              >
                <LuUndo2 className="w-3.5 h-3.5" />
                {t(I18nKey.CHECKPOINT$RESTORE)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
