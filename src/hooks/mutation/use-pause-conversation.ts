import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { useConversationStateStore } from "#/stores/conversation-state-store";
import {
  pauseConversation,
  updateConversationExecutionStatusInCache,
} from "./conversation-mutation-utils";

/**
 * Mid-run pause from the chat chrome. Optimistically flips live agent status
 * to PAUSED so the stop button does not wait on network + WebSocket.
 */
export const usePauseConversation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { conversationId: string }) =>
      pauseConversation(variables.conversationId, { queryClient }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["user", "conversations"] });
      const previousConversations = queryClient.getQueryData([
        "user",
        "conversations",
      ]);
      const previousExecutionStatus =
        useConversationStateStore.getState().execution_status;

      useConversationStateStore
        .getState()
        .setExecutionStatus(ExecutionStatus.PAUSED);
      updateConversationExecutionStatusInCache(
        queryClient,
        variables.conversationId,
        ExecutionStatus.PAUSED,
      );

      return { previousConversations, previousExecutionStatus };
    },
    onError: (_, variables, context) => {
      if (context?.previousExecutionStatus != null) {
        useConversationStateStore
          .getState()
          .setExecutionStatus(context.previousExecutionStatus);
      }
      if (context?.previousExecutionStatus != null) {
        updateConversationExecutionStatusInCache(
          queryClient,
          variables.conversationId,
          context.previousExecutionStatus,
        );
      }
      if (context?.previousConversations) {
        queryClient.setQueryData(
          ["user", "conversations"],
          context.previousConversations,
        );
      }
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["user", "conversation", variables.conversationId],
      });
      queryClient.invalidateQueries({ queryKey: ["user", "conversations"] });
      queryClient.invalidateQueries({
        queryKey: ["v1-batch-get-app-conversations"],
      });
    },
  });
};
