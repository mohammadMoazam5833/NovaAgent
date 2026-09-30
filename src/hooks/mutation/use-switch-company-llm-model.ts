import { useMutation, useQueryClient } from "@tanstack/react-query";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import {
  patchCompanyLlmSession,
  updateCompanyManagedProfileModel,
} from "#/api/company-llm";
import { useCompanyLlmSession } from "#/hooks/use-company-llm-session";
import {
  COMPANY_LLM_QUERY_KEYS,
  LLM_PROFILES_QUERY_KEYS,
  SETTINGS_QUERY_KEYS,
} from "#/hooks/query/query-keys";
import SettingsService from "#/api/settings-service/settings-service.api";
import { invalidateConversationQueries } from "#/hooks/mutation/conversation-mutation-utils";
import { COMPANY_LLM_MANAGED_PROFILE_NAME } from "#/constants/company-llm";

interface SwitchCompanyLlmModelVars {
  conversationId: string | null;
  model: string;
}

/**
 * Updates the single managed company profile's `model` field, then activates
 * it globally or live-switches the running conversation via `/switch_profile`.
 */
export function useSwitchCompanyLlmModel() {
  const queryClient = useQueryClient();
  const session = useCompanyLlmSession();

  return useMutation({
    mutationFn: async ({
      conversationId,
      model,
    }: SwitchCompanyLlmModelVars) => {
      const { profileName } = await updateCompanyManagedProfileModel(model, {
        accessToken: session?.access_token,
      });
      patchCompanyLlmSession({ selected_model: model });
      await AgentServerConversationService.switchProfile(
        conversationId,
        profileName,
      );
      return { profileName, model };
    },
    onSuccess: (_data, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: LLM_PROFILES_QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: COMPANY_LLM_QUERY_KEYS.all });
      if (conversationId) {
        invalidateConversationQueries(queryClient, conversationId);
      } else {
        SettingsService.invalidateCache();
        queryClient.invalidateQueries({
          queryKey: SETTINGS_QUERY_KEYS.personal(),
        });
      }
    },
  });
}

export { COMPANY_LLM_MANAGED_PROFILE_NAME };
