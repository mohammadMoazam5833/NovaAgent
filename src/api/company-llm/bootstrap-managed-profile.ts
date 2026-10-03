import AgentProfilesService, {
  WELL_KNOWN_DEFAULT_AGENT_PROFILE_NAME,
} from "#/api/agent-profiles-service/agent-profiles-service.api";
import ProfilesService from "#/api/profiles-service/profiles-service.api";
import { COMPANY_LLM_MANAGED_PROFILE_NAME } from "#/constants/company-llm";
import {
  getCompanyLlmOpenAiBaseUrl,
  toCompanyLlmAgentServerModel,
} from "./company-llm-config";

export interface BootstrapCompanyManagedProfileInput {
  /** Bearer token from company gateway login (stored as the profile api_key). */
  accessToken: string;
  /** Model id from GET /v1/models (or a previously selected id). */
  model: string;
  /**
   * Company gateway root URL (without requiring /v1). Defaults to the
   * configured company URL from env / window injection.
   */
  companyUrl?: string | null;
  /** Override the managed profile display name (tests). */
  profileName?: string;
}

/**
 * Upsert + activate the single company-managed LLM profile on the local
 * agent-server, and point the default agent profile at it.
 *
 * Workspace/tools stay on the local agent-server — only LLM inference uses
 * the company `base_url` + token.
 */
export async function bootstrapCompanyManagedProfile(
  input: BootstrapCompanyManagedProfileInput,
): Promise<{ profileName: string; model: string; baseUrl: string }> {
  const catalogModel = input.model.trim();
  if (!catalogModel) {
    throw new Error("Company managed profile requires a model id.");
  }
  const model = toCompanyLlmAgentServerModel(catalogModel);
  const accessToken = input.accessToken.trim();
  if (!accessToken) {
    throw new Error("Company managed profile requires an access token.");
  }

  const baseUrl = getCompanyLlmOpenAiBaseUrl(input.companyUrl ?? undefined);
  if (!baseUrl) {
    throw new Error("Company LLM URL is not configured.");
  }

  const profileName = input.profileName ?? COMPANY_LLM_MANAGED_PROFILE_NAME;

  await ProfilesService.saveProfile(profileName, {
    llm: {
      model,
      base_url: baseUrl,
      api_key: accessToken,
    },
    include_secrets: true,
  });
  await ProfilesService.activateProfile(profileName);

  // Best-effort: conversations launch from the active AGENT profile's
  // llm_profile_ref. Older backends without /api/agent-profiles still work
  // via the activated LLM profile / agent_settings fallback.
  try {
    await AgentProfilesService.saveProfile(
      WELL_KNOWN_DEFAULT_AGENT_PROFILE_NAME,
      {
        agent_kind: "openhands",
        llm_profile_ref: profileName,
      },
    );
    const detail = await AgentProfilesService.getProfile(
      WELL_KNOWN_DEFAULT_AGENT_PROFILE_NAME,
    );
    const id = detail.profile.id;
    if (id) {
      await AgentProfilesService.activateProfile(id);
    }
  } catch (error) {
    console.error(
      "Failed to point default agent profile at company LLM profile:",
      error,
    );
  }

  return { profileName, model, baseUrl };
}

/**
 * Update only the model on the managed profile (keeps token + base_url),
 * then activate / live-switch via the caller.
 */
export async function updateCompanyManagedProfileModel(
  model: string,
  options?: {
    accessToken?: string;
    companyUrl?: string | null;
    profileName?: string;
  },
): Promise<{ profileName: string; model: string }> {
  const catalogModel = model.trim();
  if (!catalogModel) {
    throw new Error("Model id is required.");
  }
  const trimmed = toCompanyLlmAgentServerModel(catalogModel);

  const profileName = options?.profileName ?? COMPANY_LLM_MANAGED_PROFILE_NAME;
  const baseUrl = getCompanyLlmOpenAiBaseUrl(options?.companyUrl ?? undefined);
  if (!baseUrl) {
    throw new Error("Company LLM URL is not configured.");
  }

  let apiKey = options?.accessToken?.trim() ?? "";
  if (!apiKey) {
    try {
      const detail = await ProfilesService.getProfile(profileName, "plaintext");
      const existing = detail.config?.api_key;
      if (typeof existing === "string") apiKey = existing;
    } catch {
      // Caller may still succeed if include_secrets merge preserves the key.
    }
  }

  const llm: { model: string; base_url: string; api_key?: string } = {
    model: trimmed,
    base_url: baseUrl,
  };
  if (apiKey) llm.api_key = apiKey;

  await ProfilesService.saveProfile(profileName, {
    llm,
    include_secrets: true,
  });
  await ProfilesService.activateProfile(profileName);

  return { profileName, model: trimmed };
}
