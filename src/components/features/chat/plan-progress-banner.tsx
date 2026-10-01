import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useTaskList } from "#/hooks/use-task-list";
import { Typography } from "#/ui/typography";

/**
 * Compact plan/task progress strip driven by the latest TaskTrackerObservation.
 */
export function PlanProgressBanner() {
  const { t } = useTranslation("openhands");
  const { taskList, hasTaskList } = useTaskList();

  if (!hasTaskList || taskList.length === 0) {
    return null;
  }

  const done = taskList.filter((item) => item.status === "done").length;
  const total = taskList.length;

  return (
    <div
      data-testid="plan-progress-banner"
      className="mx-1 rounded-lg border border-[var(--oh-border-subtle)] bg-[var(--oh-surface)] px-4 py-2"
    >
      <Typography.Text className="text-xs text-foreground">
        {t(I18nKey.PLAN_BUILD$PROGRESS, { done, total })}
      </Typography.Text>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--oh-foreground)_12%,transparent)]">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${Math.round((done / total) * 100)}%` }}
        />
      </div>
    </div>
  );
}
