import { useTranslation } from "react-i18next";
import DorjAgentLogo from "#/assets/branding/dorj-agent-logo.svg?react";
import { NavigationLink } from "#/components/shared/navigation-link";
import { I18nKey } from "#/i18n/declaration";
import { PRODUCT_NAME } from "#/constants/brand";
import { cn } from "#/utils/utils";

const DEFAULT_LOGO_WIDTH = 40;
const DEFAULT_LOGO_HEIGHT = 40;

export type OpenHandsLogoButtonProps = {
  className?: string;
  /** Applied to the root mark (kept for call-site compatibility). */
  logoClassName?: string;
  logoWidth?: number;
  logoHeight?: number;
};

/**
 * Home / brand mark in the sidebar — Dorj Agent geometric N mark.
 */
export function OpenHandsLogoButton({
  className,
  logoClassName,
  logoWidth = DEFAULT_LOGO_WIDTH,
  logoHeight = DEFAULT_LOGO_HEIGHT,
}: OpenHandsLogoButtonProps = {}) {
  const { t } = useTranslation("openhands");

  const ariaLabel = t(I18nKey.BRANDING$OPENHANDS_LOGO);

  return (
    <NavigationLink
      to="/conversations"
      aria-label={ariaLabel}
      title={PRODUCT_NAME}
      className={cn(className)}
    >
      <DorjAgentLogo
        width={logoWidth}
        height={logoHeight}
        className={cn("shrink-0 text-foreground", logoClassName)}
        aria-hidden
      />
    </NavigationLink>
  );
}
