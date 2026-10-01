import { Bot, ExternalLink, Monitor } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { useBrowserStore } from "#/stores/browser-store";

type BrowserChromeBarProps = {
  url: string;
  hasPage: boolean;
};

export function BrowserChromeBar({ url, hasPage }: BrowserChromeBarProps) {
  const { t } = useTranslation("openhands");
  const { mode, setMode, navigateLocal, localUrl } = useBrowserStore();
  const [draft, setDraft] = useState<string | null>(null);

  const isLocal = mode === "local";
  const displayUrl = isLocal ? localUrl : url;
  const iconClassName = "w-3.5 h-3.5";

  const submit = () => {
    if (draft?.trim()) navigateLocal(draft);
    setDraft(null);
  };

  return (
    <div
      className="flex w-full min-h-[34px] shrink-0 items-center gap-1 border-b border-[var(--oh-border)] px-2 py-1.5"
      data-testid="browser-chrome-bar"
    >
      <form
        className={cn(
          "flex min-h-7 min-w-0 flex-1 items-center rounded-md border border-[var(--oh-border)]",
          "bg-[var(--oh-surface-raised)] px-2",
        )}
        data-testid="browser-chrome-url"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          value={draft ?? displayUrl}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setDraft(displayUrl)}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setDraft(null);
          }}
          placeholder={t(I18nKey.BROWSER$URL_INPUT_PLACEHOLDER)}
          data-testid="browser-chrome-url-input"
          aria-label={t(I18nKey.BROWSER$URL_INPUT_PLACEHOLDER)}
          className="min-w-0 flex-1 bg-transparent text-xs leading-5 text-[var(--oh-text-tertiary)] outline-none placeholder:text-[var(--oh-text-dim)]"
        />
      </form>

      <button
        type="button"
        onClick={() => setMode(isLocal ? "agent" : "local")}
        title={t(
          isLocal ? I18nKey.BROWSER$MODE_AGENT : I18nKey.BROWSER$MODE_LOCAL,
        )}
        aria-label={t(
          isLocal ? I18nKey.BROWSER$MODE_AGENT : I18nKey.BROWSER$MODE_LOCAL,
        )}
        data-testid="browser-mode-toggle"
        className={cn(
          "shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md cursor-pointer",
          isLocal
            ? "text-[var(--oh-accent)] bg-tertiary"
            : "text-[var(--oh-text-tertiary)] hover:bg-tertiary",
        )}
      >
        {isLocal ? (
          <Bot className={iconClassName} aria-hidden strokeWidth={2} />
        ) : (
          <Monitor className={iconClassName} aria-hidden strokeWidth={2} />
        )}
      </button>

      {hasPage && displayUrl ? (
        <a
          href={displayUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t(I18nKey.BUTTON$OPEN_IN_NEW_TAB)}
          title={t(I18nKey.BUTTON$OPEN_IN_NEW_TAB)}
          data-testid="browser-chrome-open-external"
          className={cn(
            "shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md",
            "text-[var(--oh-text-tertiary)] hover:bg-tertiary cursor-pointer",
          )}
        >
          <ExternalLink className={iconClassName} aria-hidden strokeWidth={2} />
        </a>
      ) : (
        <button
          type="button"
          disabled
          aria-label={t(I18nKey.BUTTON$OPEN_IN_NEW_TAB)}
          title={t(I18nKey.BUTTON$OPEN_IN_NEW_TAB)}
          className={cn(
            "shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md",
            "text-[var(--oh-text-tertiary)] opacity-40 cursor-not-allowed",
          )}
        >
          <ExternalLink className={iconClassName} aria-hidden strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
