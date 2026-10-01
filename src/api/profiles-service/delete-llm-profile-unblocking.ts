import AgentProfilesService from "#/api/agent-profiles-service/agent-profiles-service.api";
import { mergeAgentProfileSaveInput } from "#/components/features/settings/agent-profiles/merge-agent-profile-save-input";
import ProfilesService from "./profiles-service.api";

export const CANNOT_DELETE_LAST_LLM_PROFILE_CODE =
  "CANNOT_DELETE_LAST_LLM_PROFILE";

export class CannotDeleteLastLlmProfileError extends Error {
  readonly code = CANNOT_DELETE_LAST_LLM_PROFILE_CODE;

  constructor() {
    super(CANNOT_DELETE_LAST_LLM_PROFILE_CODE);
    this.name = "CannotDeleteLastLlmProfileError";
  }
}

function pickReplacementLlmProfile(
  profileNames: string[],
  nameToDelete: string,
): string | null {
  const others = profileNames.filter((name) => name !== nameToDelete);
  if (others.length === 0) return null;
  if (others.includes("default")) return "default";
  return others[0];
}

/**
 * Deletes an LLM profile after repointing any OpenHands agent profiles that
 * reference it, so the backend does not reject the delete with HTTP 409.
 */
export async function deleteLlmProfileWithUnblocking(
  nameToDelete: string,
): Promise<void> {
  const { profiles: llmProfiles } = await ProfilesService.listProfiles();
  const replacement = pickReplacementLlmProfile(
    llmProfiles.map((profile) => profile.name),
    nameToDelete,
  );

  if (replacement === null) {
    throw new CannotDeleteLastLlmProfileError();
  }

  const { profiles: agentProfiles } = await AgentProfilesService.listProfiles();

  const referencingOpenHandsProfiles = agentProfiles.filter(
    (profile) =>
      profile.agent_kind === "openhands" &&
      profile.llm_profile_ref === nameToDelete,
  );

  for (const summary of referencingOpenHandsProfiles) {
    const { profile } = await AgentProfilesService.getProfile(summary.name);
    await AgentProfilesService.saveProfile(
      summary.name,
      mergeAgentProfileSaveInput(profile, {
        agent_kind: "openhands",
        llm_profile_ref: replacement,
      }),
    );
  }

  await ProfilesService.deleteProfile(nameToDelete);
}
