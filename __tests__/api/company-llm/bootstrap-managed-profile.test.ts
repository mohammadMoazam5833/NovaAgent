import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapCompanyManagedProfile } from "#/api/company-llm/bootstrap-managed-profile";
import ProfilesService from "#/api/profiles-service/profiles-service.api";
import AgentProfilesService from "#/api/agent-profiles-service/agent-profiles-service.api";
import { COMPANY_LLM_MANAGED_PROFILE_NAME } from "#/constants/company-llm";

vi.mock("#/api/profiles-service/profiles-service.api", () => ({
  default: {
    saveProfile: vi.fn(),
    activateProfile: vi.fn(),
    getProfile: vi.fn(),
  },
}));

vi.mock("#/api/agent-profiles-service/agent-profiles-service.api", () => ({
  default: {
    saveProfile: vi.fn(),
    getProfile: vi.fn(),
    activateProfile: vi.fn(),
  },
  WELL_KNOWN_DEFAULT_AGENT_PROFILE_NAME: "default",
}));

vi.mock("#/api/company-llm/company-llm-config", () => ({
  getCompanyLlmOpenAiBaseUrl: () => "https://llm.example.com/v1",
  toCompanyLlmAgentServerModel: (model: string) => {
    const trimmed = model.trim();
    if (!trimmed) return trimmed;
    if (trimmed.includes("/")) return trimmed;
    return `openai/${trimmed}`;
  },
}));

describe("bootstrapCompanyManagedProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ProfilesService.saveProfile).mockResolvedValue({
      name: COMPANY_LLM_MANAGED_PROFILE_NAME,
    } as never);
    vi.mocked(ProfilesService.activateProfile).mockResolvedValue({
      active_profile: COMPANY_LLM_MANAGED_PROFILE_NAME,
    } as never);
    vi.mocked(AgentProfilesService.saveProfile).mockResolvedValue({
      name: "default",
    } as never);
    vi.mocked(AgentProfilesService.getProfile).mockResolvedValue({
      profile: { id: "agent-1", name: "default" },
    } as never);
    vi.mocked(AgentProfilesService.activateProfile).mockResolvedValue(
      {} as never,
    );
  });

  it("saves and activates the managed LLM profile with token + /v1 base_url", async () => {
    const result = await bootstrapCompanyManagedProfile({
      accessToken: "tok-123",
      model: "company/model-a",
      companyUrl: "https://llm.example.com",
    });

    expect(ProfilesService.saveProfile).toHaveBeenCalledWith(
      COMPANY_LLM_MANAGED_PROFILE_NAME,
      {
        llm: {
          model: "company/model-a",
          base_url: "https://llm.example.com/v1",
          api_key: "tok-123",
        },
        include_secrets: true,
      },
    );
    expect(ProfilesService.activateProfile).toHaveBeenCalledWith(
      COMPANY_LLM_MANAGED_PROFILE_NAME,
    );
    expect(AgentProfilesService.saveProfile).toHaveBeenCalledWith("default", {
      agent_kind: "openhands",
      llm_profile_ref: COMPANY_LLM_MANAGED_PROFILE_NAME,
    });
    expect(AgentProfilesService.activateProfile).toHaveBeenCalledWith(
      "agent-1",
    );
    expect(result).toEqual({
      profileName: COMPANY_LLM_MANAGED_PROFILE_NAME,
      model: "company/model-a",
      baseUrl: "https://llm.example.com/v1",
    });
  });

  it("prefixes bare catalog model ids with openai/ for LiteLLM", async () => {
    const result = await bootstrapCompanyManagedProfile({
      accessToken: "tok-123",
      model: "qwen3-coder-30b",
      companyUrl: "https://llm.example.com",
    });

    expect(ProfilesService.saveProfile).toHaveBeenCalledWith(
      COMPANY_LLM_MANAGED_PROFILE_NAME,
      {
        llm: {
          model: "openai/qwen3-coder-30b",
          base_url: "https://llm.example.com/v1",
          api_key: "tok-123",
        },
        include_secrets: true,
      },
    );
    expect(result.model).toBe("openai/qwen3-coder-30b");
  });

  it("rejects empty model", async () => {
    await expect(
      bootstrapCompanyManagedProfile({
        accessToken: "tok",
        model: "  ",
      }),
    ).rejects.toThrow(/model/i);
  });
});
