import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { useConversationStateStore } from "#/stores/conversation-state-store";
import { usePauseConversation } from "#/hooks/mutation/use-pause-conversation";

const interruptMock = vi.fn();

vi.mock("#/hooks/mutation/conversation-mutation-utils", async () => {
  const actual = await vi.importActual<
    typeof import("#/hooks/mutation/conversation-mutation-utils")
  >("#/hooks/mutation/conversation-mutation-utils");
  return {
    ...actual,
    pauseConversation: (...args: unknown[]) => interruptMock(...args),
  };
});

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe("usePauseConversation", () => {
  beforeEach(() => {
    interruptMock.mockReset();
    interruptMock.mockResolvedValue({ success: true });
    useConversationStateStore.getState().reset();
    useConversationStateStore
      .getState()
      .setExecutionStatus(ExecutionStatus.RUNNING);
  });

  it("optimistically sets live execution status to paused on click", async () => {
    let resolveInterrupt: (value: unknown) => void = () => {};
    interruptMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInterrupt = resolve;
        }),
    );

    const { result } = renderHook(() => usePauseConversation(), { wrapper });

    act(() => {
      result.current.mutate({ conversationId: "conv-1" });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(useConversationStateStore.getState().execution_status).toBe(
      ExecutionStatus.PAUSED,
    );

    await act(async () => {
      resolveInterrupt({ success: true });
    });
  });
});
