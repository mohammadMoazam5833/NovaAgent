import { useQuery } from "@tanstack/react-query";
import { listCompanyLlmModels } from "#/api/company-llm";
import { isCompanyLlmManagedMode } from "#/api/company-llm/company-llm-config";
import { COMPANY_LLM_QUERY_KEYS } from "#/hooks/query/query-keys";
import { useCompanyLlmSession } from "#/hooks/use-company-llm-session";

export function useCompanyLlmModels(options?: { enabled?: boolean }) {
  const session = useCompanyLlmSession();
  const enabled =
    (options?.enabled ?? true) &&
    isCompanyLlmManagedMode() &&
    Boolean(session?.access_token);

  return useQuery({
    queryKey: [...COMPANY_LLM_QUERY_KEYS.models, session?.access_token],
    queryFn: () => listCompanyLlmModels(session!.access_token),
    enabled,
    staleTime: 1000 * 60 * 5,
    meta: { disableToast: true },
  });
}
