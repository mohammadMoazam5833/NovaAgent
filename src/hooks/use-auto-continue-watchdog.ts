import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useAgentState } from "#/hooks/use-agent-state";
import { useTaskList } from "#/hooks/use-task-list";
import { useSendMessage } from "#/hooks/use-send-message";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { createChatMessage } from "#/services/chat-service";
import { AgentState } from "#/types/agent-state";
import {
  AUTO_CONTINUE_MAX_ATTEMPTS,
  buildAutoContinueNudge,
  isAutoContinueEnabled,
} from "#/constants/auto-continue";

/**
 * When the agent finishes while task_tracker still has open items, nudge it
 * to continue (capped attempts).
 */
export function useAutoContinueWatchdog() {
  const { t } = useTranslation("openhands");
  const { conversationId } = useOptionalConversationId();
  const { curAgentState } = useAgentState();
  const { taskList } = useTaskList();
  const { send } = useSendMessage();
  const attemptsRef = useRef(0);
  const lastNudgedStatusRef = useRef<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    attemptsRef.current = 0;
    lastNudgedStatusRef.current = null;
    setBanner(null);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !isAutoContinueEnabled()) {
      return;
    }
    if (curAgentState !== AgentState.FINISHED) {
      if (
        curAgentState === AgentState.RUNNING ||
        curAgentState === AgentState.AWAITING_USER_CONFIRMATION
      ) {
        // Allow another nudge after the agent runs again and finishes.
        lastNudgedStatusRef.current = null;
        setBanner(null);
      }
      return;
    }

    const unfinished = taskList.filter((item) => item.status !== "done");
    if (unfinished.length === 0) {
      setBanner(null);
      return;
    }
    if (attemptsRef.current >= AUTO_CONTINUE_MAX_ATTEMPTS) {
      return;
    }
    // Stay latched while FINISHED so we do not spam nudges before RUNNING.
    if (lastNudgedStatusRef.current === "finished") {
      return;
    }

    lastNudgedStatusRef.current = "finished";
    attemptsRef.current += 1;
    const nudge = buildAutoContinueNudge(unfinished.map((item) => item.title));
    setBanner(
      t(I18nKey.AUTO_CONTINUE$BANNER, {
        count: attemptsRef.current,
        max: AUTO_CONTINUE_MAX_ATTEMPTS,
      }),
    );
    const timestamp = new Date().toISOString();
    void send(createChatMessage(nudge, [], [], timestamp));
  }, [conversationId, curAgentState, taskList, send, t]);

  return { banner, attempts: attemptsRef.current };
}
