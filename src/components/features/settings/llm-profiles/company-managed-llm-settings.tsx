import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { useCompanyLlmModels } from "#/hooks/query/use-company-llm-models";
import { useCompanyLlmSession } from "#/hooks/use-company-llm-session";
import { useSwitchCompanyLlmModel } from "#/hooks/mutation/use-switch-company-llm-model";
import { useSettings } from "#/hooks/query/use-settings";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { Typography } from "#/ui/typography";
import { displaySuccessToast } from "#/utils/custom-toast-handlers";
import { cn } from "#/utils/utils";

/**
 * Model-only LLM settings for Hybrid company-managed mode.
 * Credentials (base_url / api_key) are owned by the company gateway login.
 */
export function CompanyManagedLlmSettings() {
  const { t } = useTranslation("openhands");
  const session = useCompanyLlmSession();
  const { data: settings } = useSettings();
  const modelsQuery = useCompanyLlmModels();
  const switchModel = useSwitchCompanyLlmModel();
  const [selected, setSelected] = React.useState<string>(
    () => session?.selected_model ?? settings?.llm_model ?? "",
  );

  const firstListedModel = modelsQuery.data?.[0] ?? "";
  React.useEffect(() => {
    const next =
      session?.selected_model ?? settings?.llm_model ?? firstListedModel;
    if (next) setSelected(next);
  }, [session?.selected_model, settings?.llm_model, firstListedModel]);

  const handleSave = async () => {
    if (!selected.trim()) return;
    await switchModel.mutateAsync({ conversationId: null, model: selected });
    displaySuccessToast(t(I18nKey.SETTINGS$SAVED_WARNING));
  };

  return (
    <div
      data-testid="company-managed-llm-settings"
      className="flex flex-col gap-6"
    >
      <p className="text-sm text-[var(--oh-muted)]">
        {t(I18nKey.COMPANY_LLM$MANAGED_SETTINGS_HINT)}
      </p>

      {modelsQuery.isLoading ? (
        <LoadingSpinner size="small" />
      ) : (
        <label className="flex flex-col gap-1.5">
          <Typography.Text className="text-sm">
            {t(I18nKey.COMPANY_LLM$AVAILABLE_MODELS)}
          </Typography.Text>
          <select
            data-testid="company-managed-model-select"
            className={cn(
              "h-10 rounded-md border border-[var(--oh-border)] bg-base px-3 text-sm text-white",
            )}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={switchModel.isPending}
          >
            {(modelsQuery.data ?? []).map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex justify-end">
        <BrandButton
          testId="company-managed-model-save"
          type="button"
          variant="primary"
          isDisabled={
            switchModel.isPending || !selected.trim() || modelsQuery.isLoading
          }
          onClick={() => {
            void handleSave();
          }}
        >
          {t(I18nKey.BUTTON$SAVE)}
        </BrandButton>
      </div>
    </div>
  );
}
