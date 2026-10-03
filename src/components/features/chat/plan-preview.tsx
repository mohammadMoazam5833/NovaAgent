import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight } from "lucide-react";
import LessonPlanIcon from "#/icons/lesson-plan.svg?react";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import { MarkdownRenderer } from "#/components/features/markdown/markdown-renderer";
import { useHandleBuildPlanClick } from "#/hooks/use-handle-build-plan-click";
import { cn } from "#/utils/utils";
import { useSelectConversationTab } from "#/hooks/use-select-conversation-tab";
import {
  planComponents,
  createPlanComponents,
} from "#/components/features/markdown/plan-components";
import { useScrollContext } from "#/context/scroll-context";
import { ToggleSwitch } from "#/ui/toggle-switch";
import {
  isPlanAutoExecuteEnabled,
  setPlanAutoExecuteEnabled,
} from "#/constants/plan-auto-execute";

const MAX_CONTENT_LENGTH = 300;

const SHINE_TEXT_CLASS = "shine-text";
const shineComponents = createPlanComponents(SHINE_TEXT_CLASS);

interface PlanPreviewProps {
  planContent?: string | null;
  isStreaming?: boolean;
  isBuildDisabled?: boolean;
}

/* eslint-disable i18next/no-literal-string */
export function PlanPreview({
  planContent,
  isStreaming,
  isBuildDisabled,
}: PlanPreviewProps) {
  const { t } = useTranslation("openhands");
  const { navigateToTab } = useSelectConversationTab();
  const { handleBuildPlanClick } = useHandleBuildPlanClick();
  const { scrollDomToBottom } = useScrollContext();
  const [autoExecute, setAutoExecute] = useState(isPlanAutoExecuteEnabled);
  const autoExecutedForContentRef = useRef<string | null>(null);

  const handleViewClick = () => {
    navigateToTab("planner");
  };

  const handleBuildClick = useCallback(
    (event?: React.MouseEvent<HTMLButtonElement>) => {
      handleBuildPlanClick(event);
      scrollDomToBottom();
    },
    [handleBuildPlanClick, scrollDomToBottom],
  );

  useEffect(() => {
    if (!autoExecute || isStreaming || isBuildDisabled || !planContent) {
      return;
    }
    if (autoExecutedForContentRef.current === planContent) {
      return;
    }
    autoExecutedForContentRef.current = planContent;
    handleBuildPlanClick();
    scrollDomToBottom();
  }, [
    autoExecute,
    isStreaming,
    isBuildDisabled,
    planContent,
    handleBuildPlanClick,
    scrollDomToBottom,
  ]);

  const truncatedContent = useMemo(() => {
    if (!planContent) return "";
    if (planContent.length <= MAX_CONTENT_LENGTH) return planContent;
    return `${planContent.slice(0, MAX_CONTENT_LENGTH)}...`;
  }, [planContent]);

  if (!planContent) {
    return null;
  }

  return (
    <div className="bg-[var(--oh-surface)] border border-[#597FF4] rounded-[12px] w-full mt-2">
      <div className="border-b border-[var(--oh-border)] flex h-[41px] items-center px-2 gap-1">
        <LessonPlanIcon width={18} height={18} color="var(--oh-muted)" />
        <Typography.Text className="font-normal text-[11px] text-white tracking-[0.11px] leading-4">
          {t(I18nKey.COMMON$PLAN_MD)}
        </Typography.Text>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleViewClick}
          className="flex items-center gap-1 hover:opacity-80 transition-opacity cursor-pointer"
          data-testid="plan-preview-view-button"
        >
          <Typography.Text className="font-normal text-[11px] text-white tracking-[0.11px] leading-4">
            {t(I18nKey.COMMON$VIEW)}
          </Typography.Text>
          <ArrowUpRight className="text-white" size={18} />
        </button>
      </div>

      <div
        data-testid="plan-preview-content"
        className="flex flex-col gap-[10px] p-4 text-[15px] text-white leading-[29px]"
      >
        {truncatedContent && (
          <>
            <MarkdownRenderer
              includeStandard
              components={isStreaming ? shineComponents : planComponents}
            >
              {truncatedContent}
            </MarkdownRenderer>
            {planContent && planContent.length > MAX_CONTENT_LENGTH && (
              <button
                type="button"
                onClick={handleViewClick}
                className="text-[#4a67bd] cursor-pointer hover:underline text-left"
                data-testid="plan-preview-read-more-button"
              >
                {t(I18nKey.COMMON$READ_MORE)}
              </button>
            )}
          </>
        )}
      </div>

      <div className="border-t border-[var(--oh-border)] flex h-[54px] items-center justify-between gap-3 px-4">
        <button
          type="button"
          onClick={handleBuildClick}
          disabled={isBuildDisabled}
          className={cn(
            "bg-white flex items-center justify-center h-[26px] px-2 rounded-[4px] w-[93px] transition-opacity",
            isBuildDisabled
              ? "opacity-50 cursor-not-allowed"
              : "hover:opacity-90 cursor-pointer",
          )}
          data-testid="plan-preview-build-button"
        >
          <Typography.Text className="font-normal text-[14px] text-black leading-5">
            {t(I18nKey.COMMON$BUILD)}{" "}
            <Typography.Text className="font-normal text-black">
              ⌘↩
            </Typography.Text>
          </Typography.Text>
        </button>
        <div className="flex items-center gap-2">
          <ToggleSwitch
            enabled={autoExecute}
            label={t(I18nKey.PLAN_BUILD$AUTO_EXECUTE)}
            onToggle={() => {
              const next = !autoExecute;
              setAutoExecute(next);
              setPlanAutoExecuteEnabled(next);
            }}
          />
          <Typography.Text className="hidden text-[11px] text-white sm:inline">
            {t(I18nKey.PLAN_BUILD$AUTO_EXECUTE)}
          </Typography.Text>
        </div>
      </div>
    </div>
  );
}
