import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDeleteLlmProfile } from "#/hooks/mutation/use-delete-llm-profile";
import ProfilesService from "#/api/profiles-service/profiles-service.api";
import AgentProfilesService from "#/api/agent-profiles-service/agent-profiles-service.api";
import SettingsService from "#/api/settings-service/settings-service.api";
import {
  CANNOT_DELETE_LAST_LLM_PROFILE_CODE,
  CannotDeleteLastLlmProfileError,
} from "#/api/profiles-service/delete-llm-profile-unblocking";
import {
  LLM_PROFILES_QUERY_KEYS,
  SETTINGS_QUERY_KEYS,
} from "#/hooks/query/query-keys";

vi.mock("#/api/profiles-service/profiles-service.api");
vi.mock("#/api/agent-profiles-service/agent-profiles-service.api");
vi.mock("#/api/settings-service/settings-service.api");

describe("useDeleteLlmProfile", () => {
  let queryClient: QueryClient;
  let wrapper: ({
    children,
  }: {
    children: React.ReactNode;
  }) => React.ReactElement;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
      );

    vi.mocked(ProfilesService.listProfiles).mockResolvedValue({
      profiles: [
        {
          name: "default",
          model: "gpt-4",
          base_url: null,
          api_key_set: true,
        },
        {
          name: "old-profile",
          model: "gpt-4",
          base_url: null,
          api_key_set: true,
        },
      ],
      active_profile: null,
    });
    vi.mocked(AgentProfilesService.listProfiles).mockResolvedValue({
      profiles: [],
      active_agent_profile_id: null,
    });
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it("repoints referencing OpenHands agent profiles before delete", async () => {
    vi.mocked(AgentProfilesService.listProfiles).mockResolvedValue({
      profiles: [
        {
          id: "id-default",
          name: "default",
          agent_kind: "openhands",
          revision: 1,
          llm_profile_ref: "old-profile",
          mcp_server_refs: null,
        },
      ],
      active_agent_profile_id: "id-default",
    });
    vi.mocked(AgentProfilesService.getProfile).mockResolvedValue({
      profile: {
        id: "id-default",
        name: "default",
        agent_kind: "openhands",
        revision: 1,
        llm_profile_ref: "old-profile",
        enable_sub_agents: false,
      },
    } as never);
    vi.mocked(AgentProfilesService.saveProfile).mockResolvedValue({
      name: "default",
      message: "saved",
    });
    vi.mocked(ProfilesService.deleteProfile).mockResolvedValue({
      name: "old-profile",
      message: "Profile deleted",
    });

    const { result } = renderHook(() => useDeleteLlmProfile(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("old-profile");
    });

    expect(AgentProfilesService.saveProfile).toHaveBeenCalledWith(
      "default",
      expect.objectContaining({ llm_profile_ref: "default" }),
    );
    expect(ProfilesService.deleteProfile).toHaveBeenCalledWith("old-profile");
    expect(vi.mocked(AgentProfilesService.saveProfile).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(ProfilesService.deleteProfile).mock.invocationCallOrder[0],
    );
  });

  it("repoints agent profiles when deleting a non-default referenced LLM", async () => {
    vi.mocked(ProfilesService.listProfiles).mockResolvedValue({
      profiles: [
        {
          name: "default",
          model: "gpt-5.5",
          base_url: null,
          api_key_set: true,
        },
        {
          name: "gpt-5.5",
          model: "gpt-5.5",
          base_url: null,
          api_key_set: true,
        },
        {
          name: "qwen3-coder-30b",
          model: "qwen3-coder-30b",
          base_url: null,
          api_key_set: true,
        },
      ],
      active_profile: null,
    });
    vi.mocked(AgentProfilesService.listProfiles).mockResolvedValue({
      profiles: [
        {
          id: "id-default",
          name: "default",
          agent_kind: "openhands",
          revision: 1,
          llm_profile_ref: "qwen3-coder-30b",
          mcp_server_refs: null,
        },
        {
          id: "id-acp",
          name: "claude-code",
          agent_kind: "acp",
          revision: 1,
          llm_profile_ref: null,
          mcp_server_refs: null,
        },
      ],
      active_agent_profile_id: "id-default",
    });
    vi.mocked(AgentProfilesService.getProfile).mockResolvedValue({
      profile: {
        id: "id-default",
        name: "default",
        agent_kind: "openhands",
        revision: 1,
        llm_profile_ref: "qwen3-coder-30b",
        enable_sub_agents: false,
      },
    } as never);
    vi.mocked(AgentProfilesService.saveProfile).mockResolvedValue({
      name: "default",
      message: "saved",
    });
    vi.mocked(ProfilesService.deleteProfile).mockResolvedValue({
      name: "qwen3-coder-30b",
      message: "Profile deleted",
    });

    const { result } = renderHook(() => useDeleteLlmProfile(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("qwen3-coder-30b");
    });

    expect(AgentProfilesService.saveProfile).toHaveBeenCalledWith(
      "default",
      expect.objectContaining({ llm_profile_ref: "default" }),
    );
    expect(ProfilesService.deleteProfile).toHaveBeenCalledWith(
      "qwen3-coder-30b",
    );
    expect(vi.mocked(AgentProfilesService.saveProfile).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(ProfilesService.deleteProfile).mock.invocationCallOrder[0],
    );
  });

  it("invalidates LLM_PROFILES_QUERY_KEYS.all on success", async () => {
    vi.mocked(ProfilesService.deleteProfile).mockResolvedValue({
      name: "deleted-profile",
      message: "Profile deleted",
    });

    queryClient.setQueryData(LLM_PROFILES_QUERY_KEYS.all, {
      profiles: [
        {
          name: "deleted-profile",
          model: "gpt-4",
          base_url: null,
          api_key_set: true,
        },
      ],
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const invalidateCacheSpy = vi.spyOn(SettingsService, "invalidateCache");

    const { result } = renderHook(() => useDeleteLlmProfile(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("deleted-profile");
    });

    expect(invalidateCacheSpy).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: LLM_PROFILES_QUERY_KEYS.all,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: SETTINGS_QUERY_KEYS.personal(),
    });
  });

  it("clears a deleted local title profile preference", async () => {
    vi.mocked(ProfilesService.deleteProfile).mockResolvedValue({
      name: "Titles",
      message: "Profile deleted",
    });
    vi.mocked(SettingsService.getSettings).mockResolvedValue({
      title_llm_profile: "Titles",
    } as never);

    const { result } = renderHook(() => useDeleteLlmProfile(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("Titles");
    });

    expect(SettingsService.saveSettings).toHaveBeenCalledWith({
      title_llm_profile: null,
    });
  });

  it("rejects deleting the last remaining LLM profile", async () => {
    vi.mocked(ProfilesService.listProfiles).mockResolvedValue({
      profiles: [
        {
          name: "only-profile",
          model: "gpt-4",
          base_url: null,
          api_key_set: true,
        },
      ],
      active_profile: null,
    });

    const { result } = renderHook(() => useDeleteLlmProfile(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync("only-profile");
      }),
    ).rejects.toThrow(CANNOT_DELETE_LAST_LLM_PROFILE_CODE);

    expect(ProfilesService.deleteProfile).not.toHaveBeenCalled();
  });

  it("handles delete errors", async () => {
    const error = new Error("Profile not found");
    vi.mocked(ProfilesService.deleteProfile).mockRejectedValue(error);

    const { result } = renderHook(() => useDeleteLlmProfile(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync("nonexistent-profile");
      }),
    ).rejects.toThrow("Profile not found");

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("CannotDeleteLastLlmProfileError", () => {
  it("exposes a stable error code for i18n mapping", () => {
    const error = new CannotDeleteLastLlmProfileError();
    expect(error.code).toBe(CANNOT_DELETE_LAST_LLM_PROFILE_CODE);
  });
});
