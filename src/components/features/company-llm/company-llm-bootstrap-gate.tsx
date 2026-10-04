import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  bootstrapCompanyManagedProfile,
  readCompanyLlmSession,
} from "#/api/company-llm";
import { isCompanyLlmManagedMode } from "#/api/company-llm/company-llm-config";
import { COMPANY_LLM_QUERY_KEYS } from "#/hooks/query/query-keys";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { useCompanyLlmSession } from "#/hooks/use-company-llm-session";

/**
 * Ensures the local managed LLM profile matches the stored company session
 * (token + selected model) before rendering children.
 */
export function CompanyLlmBootstrapGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = useCompanyLlmSession();
  const enabled = isCompanyLlmManagedMode() && Boolean(session?.access_token);

  const bootstrap = useQuery({
    queryKey: [
      ...COMPANY_LLM_QUERY_KEYS.bootstrap,
      session?.access_token ?? "",
      session?.selected_model ?? "",
    ],
    enabled,
    staleTime: Infinity,
    retry: 1,
    meta: { disableToast: true },
    queryFn: async () => {
      const current = readCompanyLlmSession();
      if (!current?.access_token) {
        throw new Error("Missing company LLM session.");
      }
      const model = current.selected_model?.trim();
      if (!model) {
        throw new Error("No selected company LLM model.");
      }
      return bootstrapCompanyManagedProfile({
        accessToken: current.access_token,
        model,
      });
    },
  });

  if (!enabled) {
    return <>{children}</>;
  }

  if (bootstrap.isPending || bootstrap.isLoading) {
    return (
      <main
        data-testid="company-llm-bootstrap-loading"
        className="flex min-h-screen items-center justify-center bg-base"
      >
        <LoadingSpinner size="large" />
      </main>
    );
  }

  // Soft-fail: still render the app; chat/settings can surface LLM errors.
  return <>{children}</>;
}
