import { useTranslation } from "react-i18next";
import { Bot } from "lucide-react";
import { NavigationLink } from "#/components/shared/navigation-link";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

const DEFAULT_LOGO_WIDTH = 46;
const DEFAULT_LOGO_HEIGHT = 30;

export type OpenHandsLogoButtonProps = {
  className?: string;
  /** Applied to the root mark (kept for call-site compatibility). */
  logoClassName?: string;
  logoWidth?: number;
  logoHeight?: number;
};

/**
 * Home / brand mark in the sidebar. Uses a neutral bot icon instead of the
 * OpenHands raised-hands logo so white-label / light UI builds stay unbranded.
 */
export function OpenHandsLogoButton({
  className,
  logoClassName,
  logoWidth = DEFAULT_LOGO_WIDTH,
  logoHeight = DEFAULT_LOGO_HEIGHT,
}: OpenHandsLogoButtonProps = {}) {
  const { t } = useTranslation("openhands");

  const ariaLabel = t(I18nKey.BRANDING$OPENHANDS_LOGO);
  const size = Math.round(Math.min(logoWidth, logoHeight) * 0.85);

  return (
    <NavigationLink
      to="/conversations"
      aria-label={ariaLabel}
      className={cn(className)}
    >
      <Bot
        width={size}
        height={size}
        className={cn("shrink-0 text-foreground", logoClassName)}
        aria-hidden
      />
    </NavigationLink>
  );
}
