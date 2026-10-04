import { QueryClient } from "@tanstack/react-query";
import { ConversationClient } from "@openhands/typescript-client/clients";
import type { StartGoalRequest } from "@openhands/typescript-client";
import { getActiveBackend } from "#/api/backend-registry/active-store";
import { pauseCloudSandbox } from "#/api/cloud/conversation-service.api";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";

type ExecutionStatusValue = AppConversation["execution_status"];

export type PauseConversationMeta = {
  conversationUrl?: string | null;
  sessionApiKey?: string | null;
  sandboxId?: string | null;
};

const fetchConversationData = async (
  conversationId: string,
): Promise<{
  conversationUrl: string | null;
  sessionApiKey: string | null;
  sandboxId: string | null;
}> => {
  const conversations =
    await AgentServerConversationService.batchGetAppConversations([
      conversationId,
    ]);

  const appConversation = conversations[0];
  if (!appConversation) {
    throw new Error(`V1 conversation not found: ${conversationId}`);
  }

  return {
    conversationUrl: appConversation.conversation_url,
    sessionApiKey: appConversation.session_api_key,
    sandboxId: appConversation.sandbox_id,
  };
};

/**
 * Resolve pause metadata from an optional caller-provided snapshot, then from
 * React Query caches, and only then from a network batch-get. Mid-run pause
 * should not wait on an extra round-trip when the active conversation is
 * already cached.
 */
export const resolvePauseConversationMeta = (
  conversationId: string,
  queryClient?: QueryClient | null,
  provided?: PauseConversationMeta | null,
): PauseConversationMeta | null => {
  if (
    provided &&
    (provided.sandboxId || provided.conversationUrl || provided.sessionApiKey)
  ) {
    return provided;
  }

  if (!queryClient) {
    return provided ?? null;
  }

  const cachedList = queryClient.getQueriesData<AppConversation | null>({
    queryKey: ["user", "conversation", conversationId],
  });
  for (const [, value] of cachedList) {
    if (value?.id === conversationId) {
      return {
        conversationUrl: value.conversation_url,
        sessionApiKey: value.session_api_key,
        sandboxId: value.sandbox_id,
      };
    }
  }

  return provided ?? null;
};

/**
 * Stop a running conversation.
 * - Cloud mode: Pauses the sandbox (waits for current LLM call to finish).
 * - Local mode: Interrupts immediately (cancels in-flight requests).
 *
 * Pass `meta` / `queryClient` so local mid-run pause can skip the prefetch.
 */
export const pauseConversation = async (
  conversationId: string,
  options?: {
    meta?: PauseConversationMeta | null;
    queryClient?: QueryClient | null;
  },
) => {
  const cachedMeta = resolvePauseConversationMeta(
    conversationId,
    options?.queryClient,
    options?.meta,
  );

  if (getActiveBackend().backend.kind === "cloud") {
    const sandboxId =
      cachedMeta?.sandboxId ??
      (await fetchConversationData(conversationId)).sandboxId;
    if (!sandboxId) {
      throw new Error(
        `Cannot stop runtime: cloud conversation ${conversationId} has no sandbox_id.`,
      );
    }
    await pauseCloudSandbox(sandboxId);
    return { success: true };
  }

  // Local: interrupt without a mandatory prefetch. Client options fall back
  // to the active backend host/key when conversation URL/session are absent.
  const conversationUrl = cachedMeta?.conversationUrl ?? null;
  const sessionApiKey = cachedMeta?.sessionApiKey ?? null;

  return new ConversationClient(
    getAgentServerClientOptions({ conversationUrl, sessionApiKey }),
  ).interruptConversation(conversationId);
};

/**
 * Ask the agent a side question on a V1 conversation
 */
export const askAgent = async (
  conversationId: string,
  question: string,
): Promise<{ response: string }> => {
  const { conversationUrl, sessionApiKey } =
    await fetchConversationData(conversationId);
  return new ConversationClient(
    getAgentServerClientOptions({ conversationUrl, sessionApiKey }),
  ).askAgent(conversationId, question);
};

/**
 * Start a `/goal` loop on a V1 conversation. The agent server drives the agent
 * toward the objective, judging completion after each run until it is done or
 * `max_iterations` is reached, streaming progress as goal
 * ConversationStateUpdateEvents over the conversation's event stream.
 */
export const startGoal = async (
  conversationId: string,
  request: StartGoalRequest,
): Promise<void> => {
  const { conversationUrl, sessionApiKey } =
    await fetchConversationData(conversationId);
  await new ConversationClient(
    getAgentServerClientOptions({ conversationUrl, sessionApiKey }),
  ).startGoal(conversationId, request);
};

/**
 * Stop the active `/goal` loop. The backend only cancels the background loop
 * (recording an `interrupted` status so {@link resumeGoal} can continue it) and
 * deliberately leaves the in-flight agent turn running, so callers should also
 * interrupt the conversation (e.g. `pauseConversation`) to actually halt it.
 */
export const stopGoal = async (conversationId: string): Promise<void> => {
  const { conversationUrl, sessionApiKey } =
    await fetchConversationData(conversationId);
  await new ConversationClient(
    getAgentServerClientOptions({ conversationUrl, sessionApiKey }),
  ).stopGoal(conversationId);
};

/** Resume the last interrupted `/goal` loop in this conversation. */
export const resumeGoal = async (conversationId: string): Promise<void> => {
  const { conversationUrl, sessionApiKey } =
    await fetchConversationData(conversationId);
  await new ConversationClient(
    getAgentServerClientOptions({ conversationUrl, sessionApiKey }),
  ).resumeGoal(conversationId);
};

export const resumeConversation = async (conversationId: string) => {
  const { conversationUrl, sessionApiKey } =
    await fetchConversationData(conversationId);
  return new ConversationClient(
    getAgentServerClientOptions({ conversationUrl, sessionApiKey }),
  ).runConversation(conversationId);
};

/**
 * Patch arbitrary fields on a cached AppConversation in both the single-item
 * and paginated list query caches.  Prefer this over the narrower
 * `updateConversationExecutionStatusInCache` when you need to update more than
 * one field atomically (e.g. `execution_status` + `sandbox_status` together).
 */
export const patchConversationInCache = (
  queryClient: QueryClient,
  conversationId: string,
  patch: Partial<AppConversation>,
): void => {
  // useUserConversation stores data under a 5-part key that includes the active
  // backend id and org id. Use setQueriesData with prefix matching so the
  // update reaches whichever (backend, org) variant is currently mounted.
  queryClient.setQueriesData<AppConversation | null>(
    { queryKey: ["user", "conversation", conversationId] },
    (oldData) => (oldData ? { ...oldData, ...patch } : oldData),
  );

  queryClient.setQueriesData<{
    pages: Array<{ items: AppConversation[] }>;
  }>({ queryKey: ["user", "conversations"] }, (oldData) => {
    if (!oldData) return oldData;
    return {
      ...oldData,
      pages: oldData.pages.map((page) => ({
        ...page,
        items: page.items.map((conv) =>
          conv.id === conversationId ? { ...conv, ...patch } : conv,
        ),
      })),
    };
  });
};

export const updateConversationExecutionStatusInCache = (
  queryClient: QueryClient,
  conversationId: string,
  execution_status: ExecutionStatusValue,
): void =>
  patchConversationInCache(queryClient, conversationId, { execution_status });

export const updateConversationLlmModelInCache = (
  queryClient: QueryClient,
  conversationId: string,
  llm_model: string,
): void => patchConversationInCache(queryClient, conversationId, { llm_model });

export const invalidateConversationQueries = (
  queryClient: QueryClient,
  conversationId: string,
): void => {
  queryClient.invalidateQueries({
    queryKey: ["user", "conversation", conversationId],
  });
  queryClient.invalidateQueries({ queryKey: ["user", "conversations"] });
  queryClient.invalidateQueries({
    queryKey: ["v1-batch-get-app-conversations"],
  });
  queryClient.invalidateQueries({ queryKey: ["unified", "vscode_url"] });
};
