import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";

const PHRASES: I18nKey[] = [
  I18nKey.COMMON$WORKING_ON_IT,
  I18nKey.ACTION_MESSAGE$THINK,
  I18nKey.COMMON$WORKING,
];

const PHRASE_INTERVAL_MS = 2600;

/**
 * Claude-style activity indicator: a softly pulsing sparkle next to a
 * shimmering status phrase that cycles while the agent works. Replaces the
 * plain spinning circle.
 */
export function AgentLoading() {
  const { t } = useTranslation("openhands");
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(
      () => setPhraseIndex((i) => (i + 1) % PHRASES.length),
      PHRASE_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      data-testid="agent-loading-spinner"
      role="status"
      aria-live="polite"
      className="flex select-none items-center gap-1.5 whitespace-nowrap"
    >
      <Sparkles
        aria-hidden
        className="nova-agent-loading-sparkle h-3.5 w-3.5 text-[var(--oh-muted)]"
      />
      <span className="nova-agent-loading-shimmer text-xs font-medium leading-5">
        {t(PHRASES[phraseIndex])}…
      </span>
    </div>
  );
}
