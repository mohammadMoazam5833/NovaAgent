import { useMutation } from "@tanstack/react-query";
import EventService from "#/api/event-service/event-service.api";
import type { ConfirmationResponseRequest } from "#/api/event-service/event-service.types";

interface UseRespondToConfirmationVariables {
  conversationId: string;
  conversationUrl: string;
  sessionApiKey?: string | null;
  accept: boolean;
  reason?: string;
}

export const useRespondToConfirmation = () =>
  useMutation({
    mutationKey: ["respond-to-confirmation"],
    mutationFn: async ({
      conversationId,
      conversationUrl,
      sessionApiKey,
      accept,
      reason,
    }: UseRespondToConfirmationVariables) => {
      const request: ConfirmationResponseRequest = {
        accept,
        ...(reason ? { reason } : {}),
      };

      return EventService.respondToConfirmation(
        conversationId,
        conversationUrl,
        request,
        sessionApiKey,
      );
    },
  });
