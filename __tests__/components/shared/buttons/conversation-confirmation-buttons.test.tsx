import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationConfirmationButtons } from "#/components/shared/buttons/conversation-confirmation-buttons";
import { AgentState } from "#/types/agent-state";
import { SecurityRisk } from "#/types/agent-server/core/base/common";
import {
  CONFIRMATION_REJECT_REASON,
  CONFIRMATION_SKIP_REASON,
  NEVER_CONFIRM_POLICY,
} from "#/constants/confirmation";

const respondMock = vi.fn();
const setPolicyMock = vi.fn();
const useAgentStateMock = vi.fn();
const useActiveConversationMock = vi.fn();
const useEventStoreMock = vi.fn();

vi.mock("#/hooks/mutation/use-respond-to-confirmation", () => ({
  useRespondToConfirmation: () => ({
    mutateAsync: respondMock,
    isPending: false,
  }),
}));

vi.mock("#/hooks/mutation/use-set-confirmation-policy", () => ({
  useSetConfirmationPolicy: () => ({
    mutateAsync: setPolicyMock,
    isPending: false,
  }),
}));

vi.mock("#/hooks/use-agent-state", () => ({
  useAgentState: () => useAgentStateMock(),
}));

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => useActiveConversationMock(),
}));

vi.mock("#/stores/use-event-store", () => ({
  useEventStore: (selector: (s: { events: unknown[] }) => unknown) =>
    useEventStoreMock(selector),
}));

vi.mock("#/stores/event-message-store", () => ({
  useEventMessageStore: (
    selector: (s: {
      submittedEventIds: string[];
      addSubmittedEventId: (id: string) => void;
    }) => unknown,
  ) =>
    selector({
      submittedEventIds: [],
      addSubmittedEventId: vi.fn(),
    }),
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast: vi.fn(),
  displaySuccessToast: vi.fn(),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const pendingAction = {
  id: "evt-pending",
  timestamp: new Date().toISOString(),
  source: "agent",
  thought: [],
  thinking_blocks: [],
  action: { kind: "ExecuteBashAction", command: "rm -rf /tmp/demo" },
  tool_name: "terminal",
  tool_call_id: "call-1",
  tool_call: {
    id: "call-1",
    type: "function",
    function: { name: "terminal", arguments: "{}" },
  },
  llm_response_id: "llm-1",
  security_risk: SecurityRisk.HIGH,
};

describe("ConversationConfirmationButtons", () => {
  beforeEach(() => {
    respondMock.mockReset().mockResolvedValue({ success: true });
    setPolicyMock.mockReset().mockResolvedValue(undefined);
    useAgentStateMock.mockReturnValue({
      curAgentState: AgentState.AWAITING_USER_CONFIRMATION,
    });
    useActiveConversationMock.mockReturnValue({
      data: {
        id: "conv-1",
        conversation_url: "http://127.0.0.1:8000",
        session_api_key: "key",
      },
    });
    useEventStoreMock.mockImplementation(
      (selector: (s: { events: unknown[] }) => unknown) =>
        selector({ events: [pendingAction] }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders pending tool details and Approve / Reject / Skip", () => {
    render(<ConversationConfirmationButtons />, { wrapper });

    expect(screen.getByTestId("pending-confirmation-card")).toBeInTheDocument();
    expect(screen.getByTestId("pending-confirmation-args")).toHaveTextContent(
      "rm -rf /tmp/demo",
    );
    expect(screen.getByTestId("action-confirm-button")).toBeInTheDocument();
    expect(screen.getByTestId("action-reject-button")).toBeInTheDocument();
    expect(screen.getByTestId("action-skip-button")).toBeInTheDocument();
    expect(
      screen.getByTestId("action-always-allow-button"),
    ).toBeInTheDocument();
  });

  it("sends accept:true on Approve", async () => {
    const user = userEvent.setup();
    render(<ConversationConfirmationButtons />, { wrapper });

    await user.click(screen.getByTestId("action-confirm-button"));

    await waitFor(() =>
      expect(respondMock).toHaveBeenCalledWith(
        expect.objectContaining({ accept: true }),
      ),
    );
    expect(respondMock.mock.calls[0][0].reason).toBeUndefined();
  });

  it("sends reject reason on Reject", async () => {
    const user = userEvent.setup();
    render(<ConversationConfirmationButtons />, { wrapper });

    await user.click(screen.getByTestId("action-reject-button"));

    await waitFor(() =>
      expect(respondMock).toHaveBeenCalledWith(
        expect.objectContaining({
          accept: false,
          reason: CONFIRMATION_REJECT_REASON,
        }),
      ),
    );
  });

  it("sends skip reason on Skip", async () => {
    const user = userEvent.setup();
    render(<ConversationConfirmationButtons />, { wrapper });

    await user.click(screen.getByTestId("action-skip-button"));

    await waitFor(() =>
      expect(respondMock).toHaveBeenCalledWith(
        expect.objectContaining({
          accept: false,
          reason: CONFIRMATION_SKIP_REASON,
        }),
      ),
    );
  });

  it("sets NeverConfirm then approves on Always allow", async () => {
    const user = userEvent.setup();
    render(<ConversationConfirmationButtons />, { wrapper });

    await user.click(screen.getByTestId("action-always-allow-button"));

    await waitFor(() => {
      expect(setPolicyMock).toHaveBeenCalledWith(
        expect.objectContaining({ policy: NEVER_CONFIRM_POLICY }),
      );
      expect(respondMock).toHaveBeenCalledWith(
        expect.objectContaining({ accept: true }),
      );
    });
  });
});
