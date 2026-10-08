export type ColorThemeKey =
  | "dorj-dark"
  | "dorj-light"
  | "openhands-deepsea"
  | "openhands-neutral"
  | "openhands-neo";

export interface ColorThemeDefinition {
  label: string;
  /** Overrides for --cool-grey-* CSS custom properties (our semantic scale) */
  scale: Record<string, string>;
  /**
   * Overrides for --heroui-* CSS custom properties.
   * HeroUI stores colors as space-separated HSL channels ("H S% L%") so Tailwind
   * utilities like bg-default-200 resolve to hsl(var(--heroui-default-200)).
   * These vars are set by the heroui() plugin on :root, [data-theme=dark] at
   * build time, so they must be overridden at the same or lower specificity
   * from a later stylesheet to pick up theme changes at runtime.
   */
  heroui: Record<string, string>;
  /** Overrides for --oh-* semantic tokens such as brand / button colors. */
  tokens?: Record<string, string>;
}

// HSL channel strings for the neutral grey palette (H=0, S=0%, L=hex/255*100)
// prettier-ignore
/**
 * Dorj platform palette: deep navy surfaces, lapis interaction, and restrained
 * gold highlights. This is the default palette so Agent and Platform feel like
 * one product family.
 */
const DORJ_LIGHT_HSL = {
  50: "218.46 61.90% 12.35%",
  100: "221.67 45.00% 15.69%",
  200: "224.17 62.07% 22.75%",
  300: "224.44 64.29% 32.94%",
  400: "218.05 19.25% 41.76%",
  500: "218.05 19.25% 41.76%",
  600: "210.73 22.40% 64.12%",
  700: "217.89 35.85% 89.61%",
  800: "213.33 36.00% 95.10%",
  850: "220.00 42.86% 97.25%",
  900: "210.00 40.00% 98.04%",
  950: "220.00 30.00% 96.08%",
  975: "0 0% 100%",
};

const DORJ_LIGHT_SCALE = {
  "--cool-grey-50": "#0C1A33",
  "--cool-grey-100": "#16213A",
  "--cool-grey-200": "#16295E",
  "--cool-grey-300": "#1E3A8A",
  "--cool-grey-400": "#56657F",
  "--cool-grey-500": "#56657F",
  "--cool-grey-600": "#8FA3B8",
  "--cool-grey-700": "#DBE2EE",
  "--cool-grey-800": "#EEF2F7",
  "--cool-grey-850": "#F5F7FB",
  "--cool-grey-900": "#F8FAFC",
  "--cool-grey-925": "#F2F4F8",
  "--cool-grey-950": "#F2F4F8",
  "--cool-grey-975": "#FFFFFF",
};

const DORJ_LIGHT_HEROUI = {
  "--heroui-background": DORJ_LIGHT_HSL[950],
  "--heroui-background-foreground": DORJ_LIGHT_HSL[50],
  "--heroui-foreground-50": DORJ_LIGHT_HSL[975],
  "--heroui-foreground-100": DORJ_LIGHT_HSL[950],
  "--heroui-foreground-200": DORJ_LIGHT_HSL[900],
  "--heroui-foreground-300": DORJ_LIGHT_HSL[800],
  "--heroui-foreground-400": DORJ_LIGHT_HSL[700],
  "--heroui-foreground-500": DORJ_LIGHT_HSL[600],
  "--heroui-foreground-600": DORJ_LIGHT_HSL[500],
  "--heroui-foreground-700": DORJ_LIGHT_HSL[400],
  "--heroui-foreground-800": DORJ_LIGHT_HSL[300],
  "--heroui-foreground-900": DORJ_LIGHT_HSL[200],
  "--heroui-foreground": DORJ_LIGHT_HSL[50],
  "--heroui-content1": DORJ_LIGHT_HSL[975],
  "--heroui-content1-foreground": DORJ_LIGHT_HSL[50],
  "--heroui-content2": DORJ_LIGHT_HSL[950],
  "--heroui-content2-foreground": DORJ_LIGHT_HSL[100],
  "--heroui-content3": DORJ_LIGHT_HSL[900],
  "--heroui-content3-foreground": DORJ_LIGHT_HSL[200],
  "--heroui-content4": DORJ_LIGHT_HSL[800],
  "--heroui-content4-foreground": DORJ_LIGHT_HSL[300],
  "--heroui-default-50": DORJ_LIGHT_HSL[975],
  "--heroui-default-100": DORJ_LIGHT_HSL[950],
  "--heroui-default-200": DORJ_LIGHT_HSL[900],
  "--heroui-default-300": DORJ_LIGHT_HSL[850],
  "--heroui-default-400": DORJ_LIGHT_HSL[800],
  "--heroui-default-500": DORJ_LIGHT_HSL[700],
  "--heroui-default-600": DORJ_LIGHT_HSL[600],
  "--heroui-default-700": DORJ_LIGHT_HSL[500],
  "--heroui-default-800": DORJ_LIGHT_HSL[400],
  "--heroui-default-900": DORJ_LIGHT_HSL[300],
  "--heroui-default-foreground": DORJ_LIGHT_HSL[50],
  "--heroui-default": DORJ_LIGHT_HSL[800],
};

const NEUTRAL_HSL = {
  50: "0 0% 96.86%", // #F7F7F7
  100: "0 0% 92.55%", // #ECECEC
  200: "0 0% 86.27%", // #DCDCDC
  300: "0 0% 74.51%", // #BEBEBE
  400: "0 0% 59.22%", // #979797
  500: "0 0% 45.1%", // #737373
  600: "0 0% 33.73%", // #565656
  700: "0 0% 25.1%", // #404040
  800: "0 0% 19.22%", // #313131
  850: "0 0% 15.69%", // #282828
  900: "0 0% 12.55%", // #202020
  950: "0 0% 9.41%", // #181818
  975: "0 0% 6.27%", // #101010
};

const NEUTRAL_SCALE = {
  "--cool-grey-50": "#F7F7F7",
  "--cool-grey-100": "#ECECEC",
  "--cool-grey-200": "#DCDCDC",
  "--cool-grey-300": "#BEBEBE",
  "--cool-grey-400": "#979797",
  "--cool-grey-500": "#737373",
  "--cool-grey-600": "#565656",
  "--cool-grey-700": "#404040",
  "--cool-grey-800": "#313131",
  "--cool-grey-900": "#282828",
  "--cool-grey-925": "#202020",
  "--cool-grey-950": "#181818",
  "--cool-grey-975": "#101010",
};

const NEUTRAL_HEROUI = {
  "--heroui-background": NEUTRAL_HSL[950],
  "--heroui-background-foreground": NEUTRAL_HSL[50],
  "--heroui-foreground-50": NEUTRAL_HSL[975],
  "--heroui-foreground-100": NEUTRAL_HSL[950],
  "--heroui-foreground-200": NEUTRAL_HSL[900],
  "--heroui-foreground-300": NEUTRAL_HSL[850],
  "--heroui-foreground-400": NEUTRAL_HSL[800],
  "--heroui-foreground-500": NEUTRAL_HSL[700],
  "--heroui-foreground-600": NEUTRAL_HSL[600],
  "--heroui-foreground-700": NEUTRAL_HSL[500],
  "--heroui-foreground-800": NEUTRAL_HSL[400],
  "--heroui-foreground-900": NEUTRAL_HSL[300],
  "--heroui-foreground": NEUTRAL_HSL[300],
  "--heroui-content1": NEUTRAL_HSL[900],
  "--heroui-content1-foreground": NEUTRAL_HSL[100],
  "--heroui-content2": NEUTRAL_HSL[850],
  "--heroui-content2-foreground": NEUTRAL_HSL[200],
  "--heroui-content3": NEUTRAL_HSL[800],
  "--heroui-content3-foreground": NEUTRAL_HSL[300],
  "--heroui-content4": NEUTRAL_HSL[700],
  "--heroui-content4-foreground": NEUTRAL_HSL[400],
  "--heroui-default-50": NEUTRAL_HSL[975],
  "--heroui-default-100": NEUTRAL_HSL[950],
  "--heroui-default-200": NEUTRAL_HSL[900],
  "--heroui-default-300": NEUTRAL_HSL[850],
  "--heroui-default-400": NEUTRAL_HSL[800],
  "--heroui-default-500": NEUTRAL_HSL[700],
  "--heroui-default-600": NEUTRAL_HSL[600],
  "--heroui-default-700": NEUTRAL_HSL[500],
  "--heroui-default-800": NEUTRAL_HSL[400],
  "--heroui-default-900": NEUTRAL_HSL[300],
  "--heroui-default-foreground": NEUTRAL_HSL[50],
  "--heroui-default": NEUTRAL_HSL[800],
};

/**
 * Dorj dark palette (default since 2026-10-08): the portal's navy surfaces
 * (#081430 / #0f1e40 / #182850), light navy-tinted text, gold primary actions
 * and sky accents - the same family as dorj.isigpu.local and the platform.
 */
// prettier-ignore
const DORJ_DARK_HSL = {
  50: "220.00 42.86% 97.25%", // #F5F7FB
  100: "220.00 56.25% 93.73%", // #E6ECF8
  200: "221.25 51.61% 87.84%", // #D0DAF0
  300: "221.25 46.15% 79.61%", // #B3C2E3
  400: "222.30 36.97% 67.65%", // #8EA0CB
  500: "222.09 29.26% 55.10%", // #6B7FAE
  600: "222.35 30.09% 44.31%", // #4F6393
  700: "222.35 36.96% 36.08%", // #3A4E7E
  800: "222.46 43.62% 29.22%", // #2A3D6B
  850: "222.30 47.29% 25.29%", // #22345F
  900: "222.86 53.85% 20.39%", // #182850
  950: "221.63 62.03% 15.49%", // #0F1E40
  975: "222.00 71.43% 10.98%", // #081430
};

const DORJ_DARK_SCALE = {
  "--cool-grey-50": "#F5F7FB",
  "--cool-grey-100": "#E6ECF8",
  "--cool-grey-200": "#D0DAF0",
  "--cool-grey-300": "#B3C2E3",
  "--cool-grey-400": "#8EA0CB",
  "--cool-grey-500": "#6B7FAE",
  "--cool-grey-600": "#4F6393",
  "--cool-grey-700": "#3A4E7E",
  "--cool-grey-800": "#2A3D6B",
  "--cool-grey-900": "#22345F",
  "--cool-grey-925": "#182850",
  "--cool-grey-950": "#0F1E40",
  "--cool-grey-975": "#081430",
};

const DORJ_DARK_HEROUI = {
  "--heroui-background": DORJ_DARK_HSL[950],
  "--heroui-background-foreground": DORJ_DARK_HSL[50],
  "--heroui-foreground-50": DORJ_DARK_HSL[975],
  "--heroui-foreground-100": DORJ_DARK_HSL[950],
  "--heroui-foreground-200": DORJ_DARK_HSL[900],
  "--heroui-foreground-300": DORJ_DARK_HSL[850],
  "--heroui-foreground-400": DORJ_DARK_HSL[800],
  "--heroui-foreground-500": DORJ_DARK_HSL[700],
  "--heroui-foreground-600": DORJ_DARK_HSL[600],
  "--heroui-foreground-700": DORJ_DARK_HSL[500],
  "--heroui-foreground-800": DORJ_DARK_HSL[400],
  "--heroui-foreground-900": DORJ_DARK_HSL[300],
  "--heroui-foreground": DORJ_DARK_HSL[300],
  "--heroui-content1": DORJ_DARK_HSL[900],
  "--heroui-content1-foreground": DORJ_DARK_HSL[100],
  "--heroui-content2": DORJ_DARK_HSL[850],
  "--heroui-content2-foreground": DORJ_DARK_HSL[200],
  "--heroui-content3": DORJ_DARK_HSL[800],
  "--heroui-content3-foreground": DORJ_DARK_HSL[300],
  "--heroui-content4": DORJ_DARK_HSL[700],
  "--heroui-content4-foreground": DORJ_DARK_HSL[400],
  "--heroui-default-50": DORJ_DARK_HSL[975],
  "--heroui-default-100": DORJ_DARK_HSL[950],
  "--heroui-default-200": DORJ_DARK_HSL[900],
  "--heroui-default-300": DORJ_DARK_HSL[850],
  "--heroui-default-400": DORJ_DARK_HSL[800],
  "--heroui-default-500": DORJ_DARK_HSL[700],
  "--heroui-default-600": DORJ_DARK_HSL[600],
  "--heroui-default-700": DORJ_DARK_HSL[500],
  "--heroui-default-800": DORJ_DARK_HSL[400],
  "--heroui-default-900": DORJ_DARK_HSL[300],
  "--heroui-default-foreground": DORJ_DARK_HSL[50],
  "--heroui-default": DORJ_DARK_HSL[800],
};

import { AGENT_SERVER_UI_THEMEABLE_BRAND_VARIABLES } from "#/styles/agent-server-ui-style-scope";
import { applyAppearance, readPersistedAppearance } from "#/themes/appearance";

/** CSS custom properties overridden by color themes (see applyColorTheme). */
export const COLOR_THEME_TOKEN_KEYS = AGENT_SERVER_UI_THEMEABLE_BRAND_VARIABLES;

/** White primary/accent tokens — used by OpenHands-Neo for button surfaces. */
const NEO_WHITE_BUTTON_TOKENS: Record<
  (typeof COLOR_THEME_TOKEN_KEYS)[number],
  string
> = {
  "--oh-color-primary": "#ffffff",
  "--oh-accent": "#ffffff",
  "--oh-warning": "#ffffff",
};

export const COLOR_THEMES: Record<ColorThemeKey, ColorThemeDefinition> = {
  "dorj-dark": {
    label: "Dorj Dark",
    scale: DORJ_DARK_SCALE,
    heroui: DORJ_DARK_HEROUI,
    tokens: {
      "--oh-color-primary": "#E8A317",
      "--oh-accent": "#5B8CFF",
      "--oh-warning": "#F4C24B",
    },
  },
  "dorj-light": {
    label: "Dorj",
    scale: DORJ_LIGHT_SCALE,
    heroui: DORJ_LIGHT_HEROUI,
    tokens: {
      "--oh-color-primary": "#1E3A8A",
      "--oh-accent": "#1E3A8A",
      "--oh-warning": "#E8A317",
    },
  },

  "openhands-deepsea": {
    label: "DeepSea",
    // Matches the values already set by index.css; included so switching back
    // from another theme restores the original palette explicitly.
    scale: {
      "--cool-grey-50": "#F7F9FC",
      "--cool-grey-100": "#EEF2F7",
      "--cool-grey-200": "#DCE3EE",
      "--cool-grey-300": "#C3CDDC",
      "--cool-grey-400": "#A3B0C4",
      "--cool-grey-500": "#7E8A9E",
      "--cool-grey-600": "#626D82",
      "--cool-grey-700": "#4B5468",
      "--cool-grey-800": "#383F50",
      "--cool-grey-900": "#2C313F",
      "--cool-grey-925": "#21252F",
      "--cool-grey-950": "#0B0E14",
      "--cool-grey-975": "#05070A",
    },
    // Values generated by heroui() from hero.ts — restore them explicitly when
    // switching back from another theme.
    heroui: {
      "--heroui-background": "220 29.03% 6.08%",
      "--heroui-background-foreground": "216 45.45% 97.84%",
      "--heroui-foreground-50": "216 33.33% 2.94%",
      "--heroui-foreground-100": "220 29.03% 6.08%",
      "--heroui-foreground-200": "222.86 17.5% 15.69%",
      "--heroui-foreground-300": "224.21 17.76% 20.98%",
      "--heroui-foreground-400": "222.5 17.65% 26.67%",
      "--heroui-foreground-500": "221.38 16.2% 35.1%",
      "--heroui-foreground-600": "219.38 14.04% 44.71%",
      "--heroui-foreground-700": "217.5 14.16% 55.69%",
      "--heroui-foreground-800": "216.36 21.85% 70.39%",
      "--heroui-foreground-900": "216 26.32% 81.37%",
      "--heroui-foreground": "216 26.32% 81.37%",
      "--heroui-content1": "222.86 17.5% 15.69%",
      "--heroui-content1-foreground": "213.33 36% 95.1%",
      "--heroui-content2": "224.21 17.76% 20.98%",
      "--heroui-content2-foreground": "216.67 34.62% 89.8%",
      "--heroui-content3": "222.5 17.65% 26.67%",
      "--heroui-content3-foreground": "216 26.32% 81.37%",
      "--heroui-content4": "221.38 16.2% 35.1%",
      "--heroui-content4-foreground": "216.36 21.85% 70.39%",
      "--heroui-default-50": "216 33.33% 2.94%",
      "--heroui-default-100": "220 29.03% 6.08%",
      "--heroui-default-200": "222.86 17.5% 15.69%",
      "--heroui-default-300": "224.21 17.76% 20.98%",
      "--heroui-default-400": "222.5 17.65% 26.67%",
      "--heroui-default-500": "221.38 16.2% 35.1%",
      "--heroui-default-600": "219.38 14.04% 44.71%",
      "--heroui-default-700": "217.5 14.16% 55.69%",
      "--heroui-default-800": "216.36 21.85% 70.39%",
      "--heroui-default-900": "216 26.32% 81.37%",
      "--heroui-default-foreground": "216 45.45% 97.84%",
      "--heroui-default": "222.5 17.65% 26.67%",
    },
  },

  "openhands-neutral": {
    label: "Neutral",
    scale: NEUTRAL_SCALE,
    // Each stop follows the same positional mapping as hero.ts:
    //   heroui-default-100 ← cool-grey-950 position ← neutral-950 (#181818)
    //   heroui-default-200 ← cool-grey-925 position ← neutral-900 (#202020)
    //   ...etc.
    heroui: NEUTRAL_HEROUI,
  },

  "openhands-neo": {
    label: "Neo",
    scale: NEUTRAL_SCALE,
    heroui: NEUTRAL_HEROUI,
    tokens: NEO_WHITE_BUTTON_TOKENS,
  },
};

export const DEFAULT_COLOR_THEME: ColorThemeKey = "dorj-dark";

export const AVAILABLE_COLOR_THEMES = Object.entries(COLOR_THEMES).map(
  ([key, def]) => ({ key: key as ColorThemeKey, label: def.label }),
);

const STORAGE_KEY = "openhands-color-theme";

/** Read the persisted theme key from localStorage, falling back to the default. */
export function readPersistedColorTheme(): ColorThemeKey {
  if (typeof window === "undefined") return DEFAULT_COLOR_THEME;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // Neutral was the previous default; migrate it to the unified Dorj palette.
    if (stored === "openhands-neutral") return DEFAULT_COLOR_THEME;
    if (stored && stored in COLOR_THEMES) return stored as ColorThemeKey;
  } catch {
    // ignore quota / privacy-mode failures
  }
  return DEFAULT_COLOR_THEME;
}

/** Persist the theme key to localStorage. */
export function persistColorTheme(key: ColorThemeKey): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // ignore
  }
}

const THEME_STYLE_TAG_ID = "oh-color-theme-override";

/**
 * Apply a theme by injecting (or replacing) a <style> tag that overrides
 * both our custom --cool-grey-* primitives and HeroUI's --heroui-* tokens.
 *
 * Why a <style> tag:
 *   PostCSS transforms :root / body to [data-agent-server-ui], so --cool-grey-*
 *   is set on EVERY element carrying that attribute. A body inline-style only
 *   overrides body itself — inner matching elements keep the stylesheet value.
 *
 * Why heroui variables:
 *   HeroUI stores colors as HSL channels in --heroui-* vars on [data-theme=dark].
 *   They reference their own token system and are unaffected by --cool-grey-*
 *   changes, so we override them from the same injected sheet.
 *
 * Why doubled selectors + re-append on every call:
 *   "Later sheet wins the tie" cannot be relied on: in the built SPA
 *   (ssr:false, prerendered shell) React 19 re-creates the <head> elements it
 *   manages (<Meta/>/<Links/>) whenever the tree above the router remounts.
 *   That can re-insert the base stylesheet <link> AFTER this tag, allowing its
 *   unlayered [data-agent-server-ui] variable rules (0,1,0) to win every tie.
 *   Doubling the attribute selectors ([x][x], 0,2,0) beats them from any
 *   position in <head>; re-appending on each apply keeps document order
 *   favorable as well.
 */
export function applyColorTheme(key: ColorThemeKey): void {
  if (typeof document === "undefined") return;
  const { scale, heroui, tokens = {} } = COLOR_THEMES[key];

  const scaleDecls = Object.entries(scale)
    .map(([p, v]) => `  ${p}: ${v};`)
    .join("\n");

  const herouiDecls = Object.entries(heroui)
    .map(([p, v]) => `  ${p}: ${v};`)
    .join("\n");

  const tokenDecls = Object.entries(tokens)
    .map(([p, v]) => `  ${p}: ${v};`)
    .join("\n");

  // Target both selectors for heroui vars:
  //   [data-agent-server-ui] — covers document.body (portal destination) so
  //     portalled popover/listbox content inherits the overridden values.
  //   [data-theme=dark|light] — covers the inner AgentServerUIRoot wrapper so
  //     components scoped inside the theme wrapper also pick them up.
  // Both are doubled to out-specify the base sheet regardless of stylesheet
  // order (see the doc comment above).
  const css = [
    `[data-agent-server-ui][data-agent-server-ui] {\n${scaleDecls}\n${herouiDecls}\n${tokenDecls}\n}`,
    `[data-theme=dark][data-theme=dark] {\n${herouiDecls}\n}`,
    `[data-theme=light][data-theme=light] {\n${herouiDecls}\n}`,
  ].join("\n");

  let styleEl = document.getElementById(
    THEME_STYLE_TAG_ID,
  ) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = THEME_STYLE_TAG_ID;
  }
  styleEl.textContent = css;
  // Re-append even when the tag already exists (appendChild relocates a
  // connected node) so the override also stays after any re-inserted <link>.
  document.head.appendChild(styleEl);

  syncColorThemeTokensOnScopeRoots(tokens);
  // Re-apply appearance last so light-mode overrides stay above palette tokens.
  applyAppearance(readPersistedAppearance());
}

function syncColorThemeTokensOnScopeRoots(
  tokens: Record<string, string>,
): void {
  const roots = document.querySelectorAll("[data-agent-server-ui]");
  for (const root of roots) {
    if (!(root instanceof HTMLElement)) continue;

    for (const key of COLOR_THEME_TOKEN_KEYS) {
      const value = tokens[key];
      if (value) {
        root.style.setProperty(key, value);
      } else {
        root.style.removeProperty(key);
      }
    }
  }
}
