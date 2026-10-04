import { useMutation } from "@tanstack/react-query";
import EventService, {
  type ConversationConfirmationPolicy,
} from "#/api/event-service/event-service.api";

interface UseSetConfirmationPolicyVariables {
  conversationId: string;
  conversationUrl: string;
  sessionApiKey?: string | null;
  policy: ConversationConfirmationPolicy;
}

/**
 * Mid-run confirmation policy update (e.g. NeverConfirm after "Always allow").
 */
export const useSetConfirmationPolicy = () =>
  useMutation({
    mutationKey: ["set-confirmation-policy"],
    mutationFn: async ({
      conversationId,
      conversationUrl,
      sessionApiKey,
      policy,
    }: UseSetConfirmationPolicyVariables) =>
      EventService.setConfirmationPolicy(
        conversationId,
        conversationUrl,
        policy,
        sessionApiKey,
      ),
  });
