import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { useSettings } from "#/hooks/query/use-settings";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { displaySuccessToast } from "#/utils/custom-toast-handlers";
import { Typography } from "#/ui/typography";
import {
  isAutoContinueEnabled,
  setAutoContinueEnabled,
} from "#/constants/auto-continue";

type NumberFields = {
  max_iterations: number;
  keep_first: number;
  max_tokens: string;
  minimum_progress: string;
  action_observation: number;
  action_error: number;
  monologue: number;
  alternating_pattern: number;
};

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Settings UI for long autonomous runs: max_iterations, condenser knobs,
 * and stuck-detection thresholds.
 */
function LongRunSettingsScreen() {
  const { t } = useTranslation("openhands");
  const { data: settings, isLoading } = useSettings();
  const { mutate: saveSettings, isPending } = useSaveSettings();

  const [fields, setFields] = React.useState<NumberFields | null>(null);
  const [autoContinue, setAutoContinue] = React.useState(isAutoContinueEnabled);

  React.useEffect(() => {
    if (!settings || fields) {
      return;
    }
    const conversation = (settings.conversation_settings ?? {}) as Record<
      string,
      unknown
    >;
    const agent = (settings.agent_settings ?? {}) as Record<string, unknown>;
    const condenser = (agent.condenser ?? {}) as Record<string, unknown>;
    const stuck = (conversation.stuck_detection_thresholds ?? {}) as Record<
      string,
      unknown
    >;
    setFields({
      max_iterations: readNumber(
        conversation.max_iterations ?? settings.max_iterations,
        500,
      ),
      keep_first: readNumber(condenser.keep_first, 2),
      max_tokens:
        typeof condenser.max_tokens === "number"
          ? String(condenser.max_tokens)
          : "",
      minimum_progress:
        typeof condenser.minimum_progress === "number"
          ? String(condenser.minimum_progress)
          : "0.1",
      action_observation: readNumber(stuck.action_observation, 4),
      action_error: readNumber(stuck.action_error, 3),
      monologue: readNumber(stuck.monologue, 3),
      alternating_pattern: readNumber(stuck.alternating_pattern, 6),
    });
  }, [settings, fields]);

  const update = (key: keyof NumberFields, value: string) => {
    setFields((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const updateNumber = (key: keyof NumberFields, value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return;
    }
    setFields((prev) => (prev ? { ...prev, [key]: parsed } : prev));
  };

  const onSave = () => {
    if (!fields) {
      return;
    }
    const maxTokens =
      fields.max_tokens.trim() === "" ? null : Number(fields.max_tokens);
    const minimumProgress = Number(fields.minimum_progress);
    saveSettings(
      {
        max_iterations: fields.max_iterations,
        agent_settings_diff: {
          condenser: {
            enabled: true,
            keep_first: fields.keep_first,
            ...(typeof maxTokens === "number" && Number.isFinite(maxTokens)
              ? { max_tokens: maxTokens }
              : { max_tokens: null }),
            ...(Number.isFinite(minimumProgress)
              ? { minimum_progress: minimumProgress }
              : {}),
          },
        },
        conversation_settings_diff: {
          max_iterations: fields.max_iterations,
          stuck_detection_thresholds: {
            action_observation: fields.action_observation,
            action_error: fields.action_error,
            monologue: fields.monologue,
            alternating_pattern: fields.alternating_pattern,
          },
        },
      },
      {
        onSuccess: () => displaySuccessToast(t(I18nKey.LONG_RUN$SAVED)),
      },
    );
  };

  if (isLoading || !fields) {
    return (
      <div data-testid="long-run-settings-screen" className="p-4">
        <Typography.Text>{t(I18nKey.HOME$LOADING)}</Typography.Text>
      </div>
    );
  }

  return (
    <div
      data-testid="long-run-settings-screen"
      className="flex flex-col gap-6 p-4"
    >
      <SettingsInput
        name="max_iterations"
        type="number"
        label={t(I18nKey.LONG_RUN$MAX_ITERATIONS_LABEL)}
        value={String(fields.max_iterations)}
        onChange={(value) => updateNumber("max_iterations", value)}
      />
      <Typography.Text className="text-sm text-[var(--oh-muted)]">
        {t(I18nKey.LONG_RUN$MAX_ITERATIONS_HELP)}
      </Typography.Text>

      <SettingsInput
        name="keep_first"
        type="number"
        label={t(I18nKey.LONG_RUN$KEEP_FIRST_LABEL)}
        value={String(fields.keep_first)}
        onChange={(value) => updateNumber("keep_first", value)}
      />
      <Typography.Text className="text-sm text-[var(--oh-muted)]">
        {t(I18nKey.LONG_RUN$KEEP_FIRST_HELP)}
      </Typography.Text>

      <SettingsInput
        name="max_tokens"
        type="number"
        label={t(I18nKey.LONG_RUN$MAX_TOKENS_LABEL)}
        value={fields.max_tokens}
        onChange={(value) => update("max_tokens", value)}
      />
      <Typography.Text className="text-sm text-[var(--oh-muted)]">
        {t(I18nKey.LONG_RUN$MAX_TOKENS_HELP)}
      </Typography.Text>

      <SettingsInput
        name="minimum_progress"
        type="number"
        label={t(I18nKey.LONG_RUN$MINIMUM_PROGRESS_LABEL)}
        value={fields.minimum_progress}
        onChange={(value) => update("minimum_progress", value)}
      />
      <Typography.Text className="text-sm text-[var(--oh-muted)]">
        {t(I18nKey.LONG_RUN$MINIMUM_PROGRESS_HELP)}
      </Typography.Text>

      <SettingsInput
        name="action_observation"
        type="number"
        label={t(I18nKey.LONG_RUN$STUCK_ACTION_OBS_LABEL)}
        value={String(fields.action_observation)}
        onChange={(value) => updateNumber("action_observation", value)}
      />
      <SettingsInput
        name="action_error"
        type="number"
        label={t(I18nKey.LONG_RUN$STUCK_ACTION_ERROR_LABEL)}
        value={String(fields.action_error)}
        onChange={(value) => updateNumber("action_error", value)}
      />
      <SettingsInput
        name="monologue"
        type="number"
        label={t(I18nKey.LONG_RUN$STUCK_MONOLOGUE_LABEL)}
        value={String(fields.monologue)}
        onChange={(value) => updateNumber("monologue", value)}
      />
      <SettingsInput
        name="alternating_pattern"
        type="number"
        label={t(I18nKey.LONG_RUN$STUCK_ALTERNATING_LABEL)}
        value={String(fields.alternating_pattern)}
        onChange={(value) => updateNumber("alternating_pattern", value)}
      />

      <SettingsSwitch
        testId="auto-continue-switch"
        isToggled={autoContinue}
        onToggle={(value) => {
          setAutoContinue(value);
          setAutoContinueEnabled(value);
        }}
      >
        {t(I18nKey.AUTO_CONTINUE$TOGGLE_LABEL)}
      </SettingsSwitch>
      <Typography.Text className="text-sm text-[var(--oh-muted)]">
        {t(I18nKey.AUTO_CONTINUE$TOGGLE_HELP)}
      </Typography.Text>

      <BrandButton
        type="button"
        variant="primary"
        testId="long-run-settings-save"
        isDisabled={isPending}
        onClick={onSave}
      >
        {t(I18nKey.LONG_RUN$SAVE)}
      </BrandButton>
    </div>
  );
}

export default LongRunSettingsScreen;
