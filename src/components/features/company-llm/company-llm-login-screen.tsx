import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import {
  MODAL_MAX_WIDTH_VIEWPORT,
  modalWidthClassName,
} from "#/components/shared/modals/modal-body";
import { cn } from "#/utils/utils";
import { PRODUCT_NAME } from "#/constants/brand";
import {
  bootstrapCompanyManagedProfile,
  CompanyLlmClientError,
  listCompanyLlmModels,
  loginToCompanyLlm,
  writeCompanyLlmSession,
} from "#/api/company-llm";
import { getCompanyLlmUrl } from "#/api/company-llm/company-llm-config";
import { ONBOARDING_COMPLETED_STORAGE_KEY } from "#/components/features/onboarding/use-onboarding-completion";

interface CompanyLlmLoginScreenProps {
  /** Called after login + managed profile bootstrap succeed. */
  onSuccess?: () => void;
}

/**
 * Full-screen company LLM gateway login (username / password).
 * Shown only when Hybrid company-managed mode is configured and no session
 * exists. Does not replace ApiKeyEntryScreen (agent-server public auth).
 */
export default function CompanyLlmLoginScreen({
  onSuccess,
}: CompanyLlmLoginScreenProps) {
  const { t } = useTranslation("openhands");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const companyUrl = getCompanyLlmUrl();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const login = await loginToCompanyLlm(username.trim(), password);
      const models = await listCompanyLlmModels(login.access_token);
      const selectedModel = models[0];
      if (!selectedModel) {
        throw new CompanyLlmClientError(t(I18nKey.COMPANY_LLM$NO_MODELS));
      }

      await bootstrapCompanyManagedProfile({
        accessToken: login.access_token,
        model: selectedModel,
      });

      writeCompanyLlmSession({
        access_token: login.access_token,
        refresh_token: login.refresh_token,
        expires_at:
          typeof login.expires_in === "number"
            ? Date.now() + login.expires_in * 1000
            : undefined,
        username: username.trim(),
        selected_model: selectedModel,
      });

      // Company login replaces manual LLM onboarding — mark welcome done.
      try {
        window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
      } catch {
        // best-effort
      }

      onSuccess?.();
    } catch (err: unknown) {
      if (err instanceof CompanyLlmClientError) {
        setErrorMessage(
          err.status === 401 || err.status === 403
            ? t(I18nKey.COMPANY_LLM$INVALID_CREDENTIALS)
            : err.message || t(I18nKey.COMPANY_LLM$LOGIN_FAILED),
        );
      } else {
        const detail = err instanceof Error ? err.message : String(err);
        setErrorMessage(
          detail
            ? `${t(I18nKey.COMPANY_LLM$LOGIN_FAILED)}: ${detail}`
            : t(I18nKey.COMPANY_LLM$LOGIN_FAILED),
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="company-llm-login-screen"
      className="flex min-h-screen items-center justify-center bg-base px-6"
    >
      <div
        className={cn(
          "relative rounded-xl border border-[var(--oh-border)] bg-base-secondary",
          modalWidthClassName("md"),
          MODAL_MAX_WIDTH_VIEWPORT,
        )}
      >
        <div className="px-6 pt-6 pb-2">
          <h2 className="text-lg font-semibold text-white">
            {t(I18nKey.COMPANY_LLM$LOGIN_TITLE, { product: PRODUCT_NAME })}
          </h2>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">
            {t(I18nKey.COMPANY_LLM$LOGIN_SUBTITLE)}
          </p>
          {companyUrl ? (
            <p
              data-testid="company-llm-gateway-url"
              className="mt-2 truncate text-xs text-[var(--oh-text-dim)]"
              title={companyUrl}
            >
              {companyUrl}
            </p>
          ) : null}
        </div>

        <form
          className="flex flex-col gap-4 px-6 pb-6 pt-2"
          onSubmit={handleSubmit}
          data-testid="company-llm-login-form"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-[var(--oh-foreground)]">
              {t(I18nKey.COMPANY_LLM$USERNAME_LABEL)}
            </span>
            <input
              data-testid="company-llm-username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-10 rounded-md border border-[var(--oh-border)] bg-base px-3 text-sm text-white outline-none focus:border-[var(--oh-accent)]"
              disabled={isSubmitting}
              required
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-[var(--oh-foreground)]">
              {t(I18nKey.COMPANY_LLM$PASSWORD_LABEL)}
            </span>
            <input
              data-testid="company-llm-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 rounded-md border border-[var(--oh-border)] bg-base px-3 text-sm text-white outline-none focus:border-[var(--oh-accent)]"
              disabled={isSubmitting}
              required
            />
          </label>

          {errorMessage ? (
            <p
              data-testid="company-llm-login-error"
              className="text-sm text-danger"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}

          <BrandButton
            testId="company-llm-login-submit"
            type="submit"
            variant="primary"
            isDisabled={isSubmitting || !username.trim() || !password}
          >
            {isSubmitting
              ? t(I18nKey.COMPANY_LLM$LOGGING_IN)
              : t(I18nKey.COMPANY_LLM$LOGIN_BUTTON)}
          </BrandButton>
        </form>
      </div>
    </div>
  );
}
