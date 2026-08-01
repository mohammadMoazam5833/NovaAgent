import React from "react";
import { useTranslation } from "react-i18next";
import { Moon, Sun } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  applyColorTheme,
  readPersistedColorTheme,
} from "#/themes/color-themes";
import {
  type AppearanceMode,
  persistAppearance,
  readPersistedAppearance,
} from "#/themes/appearance";

export type AppearanceToggleProps = {
  className?: string;
  iconSize?: number;
};

export function AppearanceToggle({
  className,
  iconSize = 18,
}: AppearanceToggleProps) {
  const { t } = useTranslation("openhands");
  const [mode, setMode] = React.useState<AppearanceMode>(() =>
    readPersistedAppearance(),
  );

  const label =
    mode === "light"
      ? t(I18nKey.SETTINGS$APPEARANCE_SWITCH_TO_DARK)
      : t(I18nKey.SETTINGS$APPEARANCE_SWITCH_TO_LIGHT);

  const onToggle = () => {
    const next: AppearanceMode = mode === "light" ? "dark" : "light";
    persistAppearance(next);
    // Re-apply palette then appearance overlay (applyColorTheme ends with appearance).
    applyColorTheme(readPersistedColorTheme());
    setMode(next);
  };

  return (
    <button
      type="button"
      data-testid="appearance-toggle"
      aria-label={label}
      title={label}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center justify-center rounded-md p-2",
        "text-foreground hover:bg-tertiary transition-colors",
        className,
      )}
    >
      {mode === "light" ? <Moon size={iconSize} /> : <Sun size={iconSize} />}
    </button>
  );
}
