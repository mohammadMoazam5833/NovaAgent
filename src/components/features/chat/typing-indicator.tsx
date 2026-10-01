import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";

/**
 * Claude-style "agent is working" pill shown at the bottom of the message
 * list while the agent runs: a pulsing sparkle plus a shimmering status
 * phrase. Replaces the three bouncing dots.
 */
export function TypingIndicator() {
  const { t } = useTranslation("openhands");

  return (
    <div
      data-testid="typing-indicator"
      role="status"
      aria-live="polite"
      className="flex select-none items-center gap-1.5 whitespace-nowrap px-1"
    >
      <Sparkles
        aria-hidden
        className="nova-agent-loading-sparkle h-3.5 w-3.5 text-[var(--oh-muted)]"
      />
      <span className="nova-agent-loading-shimmer text-xs font-medium leading-5">
        {t(I18nKey.ACTION_MESSAGE$THINK)}…
      </span>
    </div>
  );
}
