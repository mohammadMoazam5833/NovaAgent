import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EMPTY_LOCAL_GIT_INFO,
  LOCAL_GIT_INFO_EMPTY_POLL_MS,
  LOCAL_GIT_INFO_POLL_MS,
  buildGitInfoCommand,
  isEmptyLocalGitInfo,
  resolveLocalGitInfoPollMs,
  useLocalGitInfo,
} from "#/hooks/query/use-local-git-info";

const useActiveBackendMock = vi.fn();
vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => useActiveBackendMock(),
}));

const useActiveConversationMock = vi.fn();
vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => useActiveConversationMock(),
}));

const useRuntimeIsReadyMock = vi.fn();
vi.mock("#/hooks/use-runtime-is-ready", () => ({
  useRuntimeIsReady: () => useRuntimeIsReadyMock(),
}));

const runCommandMock = vi.fn();
const useBashCommandRunnerMock = vi.fn();
vi.mock("#/hooks/use-bash-command-runner", () => ({
  useBashCommandRunner: (
    conversationUrl: string | null | undefined,
    sessionApiKey: string | null | undefined,
    enabled: boolean,
  ) => useBashCommandRunnerMock(conversationUrl, sessionApiKey, enabled),
}));

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function LocalGitInfoTestWrapper({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

const makeBackend = (kind: "local" | "cloud") => ({
  backend: {
    id: "backend-id",
    name: kind === "local" ? "Local" : "Production",
    host:
      kind === "local" ? "http://127.0.0.1:8000" : "https://app.all-hands.dev",
    apiKey: "test-key",
    kind,
  },
  orgId: null,
});

const conversationWithoutRepo = {
  id: "conv-1",
  conversation_url: "https://runtime.example.com/api/conversations/conv-1",
  session_api_key: "session-key",
  workspace: { working_dir: "/workspace/project" },
  selected_repository: null,
  git_provider: null,
  selected_branch: null,
};

const conversationWithoutWorkspace = {
  id: "conv-2",
  conversation_url: "https://runtime.example.com/api/conversations/conv-2",
  session_api_key: "session-key",
  workspace: null,
  selected_repository: null,
  git_provider: null,
  selected_branch: null,
};

describe("useLocalGitInfo", () => {
  beforeEach(() => {
    useActiveBackendMock.mockReset();
    useActiveConversationMock.mockReset();
    useRuntimeIsReadyMock.mockReset();
    runCommandMock.mockReset();
    useBashCommandRunnerMock.mockReset();
    useBashCommandRunnerMock.mockImplementation(() => runCommandMock);

    useRuntimeIsReadyMock.mockReturnValue(true);
    useActiveConversationMock.mockReturnValue({
      data: conversationWithoutRepo,
    });
    runCommandMock.mockResolvedValue({
      exit_code: 0,
      stdout: "git@github.com:acme/widgets.git\n",
      stderr: "",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveLocalGitInfoPollMs", () => {
    it("uses the fast interval until a probe has returned empty", () => {
      expect(resolveLocalGitInfoPollMs(undefined)).toBe(LOCAL_GIT_INFO_POLL_MS);
      expect(
        resolveLocalGitInfoPollMs({
          repository: "acme/widgets",
          branch: "main",
          provider: "github",
          remoteUrl: "git@github.com:acme/widgets.git",
        }),
      ).toBe(LOCAL_GIT_INFO_POLL_MS);
    });

    it("backs off to 60s for empty non-git workspaces", () => {
      expect(resolveLocalGitInfoPollMs(EMPTY_LOCAL_GIT_INFO)).toBe(
        LOCAL_GIT_INFO_EMPTY_POLL_MS,
      );
    });
  });

  it("does not call the bash runner on a cloud backend even when conversation metadata is incomplete", async () => {
    // Arrange
    useActiveBackendMock.mockReturnValue(makeBackend("cloud"));

    // Act
    const { result } = renderHook(() => useLocalGitInfo(), {
      wrapper: makeWrapper(),
    });

    // Assert: query stays disabled (no fetch, no data); bash endpoint not driven.
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(runCommandMock).not.toHaveBeenCalled();
    // The bash command runner should be created in a disabled state on cloud.
    expect(useBashCommandRunnerMock).toHaveBeenCalledWith(
      conversationWithoutRepo.conversation_url,
      conversationWithoutRepo.session_api_key,
      false,
    );
  });

  it("does not poll when the conversation has no workspace attached, even on a local backend", async () => {
    // Arrange
    useActiveBackendMock.mockReturnValue(makeBackend("local"));
    useActiveConversationMock.mockReturnValue({
      data: conversationWithoutWorkspace,
    });

    // Act
    const { result } = renderHook(() => useLocalGitInfo(), {
      wrapper: makeWrapper(),
    });

    // Assert: query stays disabled; no bash commands are issued.
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(runCommandMock).not.toHaveBeenCalled();
    expect(useBashCommandRunnerMock).toHaveBeenCalledWith(
      conversationWithoutWorkspace.conversation_url,
      conversationWithoutWorkspace.session_api_key,
      false,
    );
  });

  it("probes git metadata via the bash runner on a local backend when conversation metadata is incomplete", async () => {
    // Arrange
    useActiveBackendMock.mockReturnValue(makeBackend("local"));
    // The consolidated script returns remote URL and branch on separate lines.
    runCommandMock.mockResolvedValueOnce({
      exit_code: 0,
      stdout: "git@github.com:acme/widgets.git\nmain",
      stderr: "",
    });

    // Act
    const { result } = renderHook(() => useLocalGitInfo(), {
      wrapper: makeWrapper(),
    });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useBashCommandRunnerMock).toHaveBeenCalledWith(
      conversationWithoutRepo.conversation_url,
      conversationWithoutRepo.session_api_key,
      true,
    );
    // All git probing is now done in a single bash round-trip.
    expect(runCommandMock).toHaveBeenCalledTimes(1);
    expect(runCommandMock).toHaveBeenCalledWith(
      expect.stringContaining("git remote get-url origin"),
      "/workspace/project",
      10,
    );
    expect(runCommandMock.mock.calls[0][0]).toContain("-name 'node_modules'");
    expect(runCommandMock.mock.calls[0][0]).toContain(
      "-prune -o -path '*/.git'",
    );
    expect(result.current.data).toMatchObject({
      repository: "acme/widgets",
      branch: "main",
    });
  });

  it("prunes heavy directories in the nested .git find so node_modules is never walked", () => {
    const command = buildGitInfoCommand();
    expect(command).toContain("-name 'node_modules'");
    expect(command).toContain("-name '.venv'");
    expect(command).toContain("-name 'models'");
    expect(command).toContain("-o -path '*/.git' ! -path './.git' -print");
    expect(command).toContain("-maxdepth 4");
    expect(command).not.toMatch(/-name '\.git'/);
    // Probe find must not use -mindepth before prune (GNU find would then
    // skip pruning depth-1 heavy dirs). Fat-dir detection may still use
    // -mindepth on its own shallow walk.
    expect(command).toMatch(
      /timeout \d+s find \. -maxdepth 4 \\\( "\$\{prunes\[@\]\}"/,
    );
    expect(command).not.toMatch(/timeout \d+s find \. -mindepth/);
  });

  it("auto-detects fat directories and hard-caps the probe with a timeout", () => {
    const command = buildGitInfoCommand();
    expect(command).toContain("path_prunes");
    expect(command).toContain("timeout");
    expect(command).toContain("'.agentcanvasignore'");
  });

  it("backs off the poll interval after an empty (non-git) probe", async () => {
    // Arrange
    useActiveBackendMock.mockReturnValue(makeBackend("local"));
    runCommandMock.mockResolvedValue({
      exit_code: 0,
      stdout: "\n",
      stderr: "",
    });

    // Act
    const { result } = renderHook(() => useLocalGitInfo(), {
      wrapper: makeWrapper(),
    });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(EMPTY_LOCAL_GIT_INFO);
    expect(isEmptyLocalGitInfo(result.current.data)).toBe(true);
    expect(resolveLocalGitInfoPollMs(result.current.data)).toBe(
      LOCAL_GIT_INFO_EMPTY_POLL_MS,
    );
  });

  it("keeps the fast poll interval when git metadata is found", async () => {
    useActiveBackendMock.mockReturnValue(makeBackend("local"));
    runCommandMock.mockResolvedValue({
      exit_code: 0,
      stdout: "git@github.com:acme/widgets.git\nmain",
      stderr: "",
    });

    const { result } = renderHook(() => useLocalGitInfo(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(isEmptyLocalGitInfo(result.current.data)).toBe(false);
    expect(resolveLocalGitInfoPollMs(result.current.data)).toBe(
      LOCAL_GIT_INFO_POLL_MS,
    );
  });
});
