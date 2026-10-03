import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { SettingsDropdownInput } from "../settings-dropdown-input";
import {
  applyColorTheme,
  readPersistedColorTheme,
} from "#/themes/color-themes";
import {
  type AppearanceMode,
  persistAppearance,
  readPersistedAppearance,
} from "#/themes/appearance";

const APPEARANCE_KEYS = ["light", "dark"] as const;

export function AppearanceInput() {
  const { t } = useTranslation("openhands");

  const items = APPEARANCE_KEYS.map((key) => ({
    key,
    label:
      key === "light"
        ? t(I18nKey.SETTINGS$APPEARANCE_LIGHT)
        : t(I18nKey.SETTINGS$APPEARANCE_DARK),
  }));

  const handleSelectionChange = React.useCallback((key: React.Key | null) => {
    if (!key) return;
    const next = key as AppearanceMode;
    persistAppearance(next);
    applyColorTheme(readPersistedColorTheme());
  }, []);

  return (
    <SettingsDropdownInput
      testId="appearance-input"
      name="appearance-input"
      label={t(I18nKey.SETTINGS$APPEARANCE)}
      items={items}
      defaultSelectedKey={readPersistedAppearance()}
      onSelectionChange={handleSelectionChange}
      isClearable={false}
      wrapperClassName="w-full min-w-0"
    />
  );
}
