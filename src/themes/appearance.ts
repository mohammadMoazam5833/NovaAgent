/**
 * Light / dark appearance mode (orthogonal to color palette themes).
 * Persisted in localStorage; applied via an injected <style> overlay so it
 * wins over the base stylesheet and palette tokens on the UI scope roots.
 */

export type AppearanceMode = "dark" | "light";

export const DEFAULT_APPEARANCE: AppearanceMode = "dark";

const STORAGE_KEY = "openhands-appearance";
const APPEARANCE_STYLE_TAG_ID = "oh-appearance-override";

/** Reversed neutral greys: low stops are dark ink, high stops are light surfaces. */
const LIGHT_SCALE: Record<string, string> = {
  "--cool-grey-50": "#0C1A33",
  "--cool-grey-100": "#16213A",
  "--cool-grey-200": "#2747B8",
  "--cool-grey-300": "#5B8CFF",
  "--cool-grey-400": "#56657F",
  "--cool-grey-500": "#56657F",
  "--cool-grey-600": "#8FA3B8",
  "--cool-grey-700": "#DBE2EE",
  "--cool-grey-800": "#EEF2F7",
  "--cool-grey-900": "#F8FAFC",
  "--cool-grey-925": "#F2F4F8",
  "--cool-grey-950": "#F2F4F8",
  "--cool-grey-975": "#FFFFFF",
};

const LIGHT_HSL = {
  50: "218.46 61.90% 12.35%",
  100: "221.67 45.00% 15.69%",
  200: "226.76 65.02% 43.73%",
  300: "222.07 100.00% 67.84%",
  400: "218.05 19.25% 41.76%",
  500: "218.05 19.25% 41.76%",
  600: "210.73 22.40% 64.12%",
  700: "217.89 35.85% 89.61%",
  800: "213.33 36.00% 95.10%",
  900: "210.00 40.00% 98.04%",
  925: "210.00 40.00% 98.04%",
  950: "220.00 30.00% 96.08%",
  975: "0 0% 100%",
};

const LIGHT_HEROUI: Record<string, string> = {
  "--heroui-background": LIGHT_HSL[975],
  "--heroui-background-foreground": LIGHT_HSL[50],
  "--heroui-foreground-50": LIGHT_HSL[975],
  "--heroui-foreground-100": LIGHT_HSL[950],
  "--heroui-foreground-200": LIGHT_HSL[900],
  "--heroui-foreground-300": LIGHT_HSL[800],
  "--heroui-foreground-400": LIGHT_HSL[700],
  "--heroui-foreground-500": LIGHT_HSL[600],
  "--heroui-foreground-600": LIGHT_HSL[400],
  "--heroui-foreground-700": LIGHT_HSL[300],
  "--heroui-foreground-800": LIGHT_HSL[200],
  "--heroui-foreground-900": LIGHT_HSL[100],
  "--heroui-foreground": LIGHT_HSL[50],
  "--heroui-content1": LIGHT_HSL[975],
  "--heroui-content1-foreground": LIGHT_HSL[50],
  "--heroui-content2": LIGHT_HSL[950],
  "--heroui-content2-foreground": LIGHT_HSL[100],
  "--heroui-content3": LIGHT_HSL[900],
  "--heroui-content3-foreground": LIGHT_HSL[200],
  "--heroui-content4": LIGHT_HSL[800],
  "--heroui-content4-foreground": LIGHT_HSL[300],
  "--heroui-default-50": LIGHT_HSL[975],
  "--heroui-default-100": LIGHT_HSL[950],
  "--heroui-default-200": LIGHT_HSL[900],
  "--heroui-default-300": LIGHT_HSL[800],
  "--heroui-default-400": LIGHT_HSL[700],
  "--heroui-default-500": LIGHT_HSL[600],
  "--heroui-default-600": LIGHT_HSL[400],
  "--heroui-default-700": LIGHT_HSL[300],
  "--heroui-default-800": LIGHT_HSL[200],
  "--heroui-default-900": LIGHT_HSL[100],
  "--heroui-default-foreground": LIGHT_HSL[50],
  "--heroui-default": LIGHT_HSL[800],
};

/**
 * Explicit semantic tokens for light mode. Do not rely only on reversed
 * cool-grey — some tokens (e.g. modal title) are hard-coded white in CSS.
 */
const LIGHT_OH_TOKENS: Record<string, string> = {
  "--oh-color-base": "#F2F4F8",
  "--oh-color-base-secondary": "#FFFFFF",
  "--oh-color-basic": "#56657F",
  "--oh-color-tertiary": "#FFFFFF",
  "--oh-color-tertiary-light": "#16295E",
  "--oh-color-content": "#0C1A33",
  "--oh-color-content-2": "#081430",
  "--oh-background": "#F2F4F8",
  "--oh-foreground": "#0C1A33",
  "--oh-surface": "#FFFFFF",
  "--oh-surface-foreground": "#0C1A33",
  "--oh-surface-raised": "#EEF2F7",
  "--oh-surface-deep": "#F7F9FC",
  "--oh-overlay": "#FFFFFF",
  "--oh-overlay-foreground": "#0C1A33",
  "--oh-muted": "#56657F",
  "--oh-text-secondary": "#16213A",
  "--oh-text-tertiary": "#16295E",
  "--oh-text-dim": "#56657F",
  "--oh-text-subtle": "#8FA3B8",
  "--oh-interactive-hover": "#EEF3F8",
  "--oh-interactive-hover-low": "#F5F7FB",
  "--oh-interactive-active": "#E3E9F8",
  "--oh-interactive-selected": "#1E3A8A",
  "--oh-default": "#EEF2F7",
  "--oh-default-foreground": "#0C1A33",
  "--oh-border": "#DBE2EE",
  "--oh-border-input": "#DDE5F0",
  "--oh-border-subtle": "#DDE3EE",
  "--oh-separator": "rgba(11, 27, 58, 0.12)",
  "--oh-focus": "#2747B8",
  "--oh-link": "#2747B8",
  "--oh-modal-title-foreground": "#0C1A33",
  "--oh-bg-dark": "#F2F4F8",
  "--oh-bg-light": "#F8FAFC",
  "--oh-bg-input": "#F5F7FB",
  "--oh-bg-workspace": "#F2F4F8",
  "--oh-text-editor-base": "#56657F",
  "--oh-text-editor-active": "#0C1A33",
  "--oh-bg-editor-sidebar": "#F8FAFC",
  "--oh-bg-editor-active": "#EEF2F7",
  "--oh-border-editor-sidebar": "#DBE2EE",
  "--oh-color-primary": "#E8A317",
  "--oh-accent": "#5B8CFF",
  "--oh-warning": "#E8A317",
  "--oh-accent-foreground": "#081430",
  "--oh-warning-foreground": "#081430",
  "color-scheme": "light",
};

/**
 * Hardcoded Tailwind `text-white` / `hover:text-white` / icon fills were written
 * for dark chrome. In light mode remap them to readable ink, except on solid
 * danger / primary filled controls that still need light glyphs.
 */
const LIGHT_TEXT_REMAP_CSS = `
[data-theme=light][data-theme=light] :where(.text-white):not(:where(.bg-red-600, .bg-red-700, .bg-danger, .bg-primary, [class*="bg-red-"])) {
  color: var(--oh-foreground) !important;
}
[data-theme=light][data-theme=light] :where(.hover\\:text-white:hover, .group:hover .group-hover\\:text-white, .group-hover\\:text-white):not(:where(.bg-red-600, .bg-red-700, .bg-danger, .bg-primary, [class*="bg-red-"])) {
  color: var(--oh-foreground) !important;
}
[data-theme=light][data-theme=light] :where(.group-focus-visible\\:text-white):not(:where(.bg-red-600, .bg-red-700, .bg-danger)) {
  color: var(--oh-foreground) !important;
}
[data-theme=light][data-theme=light] :where(.placeholder\\:text-white)::placeholder {
  color: var(--oh-muted) !important;
}
[data-theme=light][data-theme=light] :where(.fill-white) {
  fill: var(--oh-foreground) !important;
}
[data-theme=light][data-theme=light] :where(.stroke-white) {
  stroke: var(--oh-foreground) !important;
}
[data-theme=light][data-theme=light] :where(.border-white\\/40) {
  border-color: color-mix(in srgb, var(--oh-foreground) 25%, transparent) !important;
}
[data-theme=light][data-theme=light] :where(.ring-white\\/20) {
  --tw-ring-color: color-mix(in srgb, var(--oh-foreground) 20%, transparent) !important;
}
[data-theme=light][data-theme=light] :where(.bg-white\\/10):hover,
[data-theme=light][data-theme=light] :where(.hover\\:bg-white\\/10:hover) {
  background-color: color-mix(in srgb, var(--oh-foreground) 8%, transparent) !important;
}
/* Pale Tailwind status colors were tuned for dark chrome — deepen in light mode. */
[data-theme=light][data-theme=light] :where(.text-red-200, .text-red-300, .text-red-400) {
  color: #b91c1c !important; /* red-700 */
}
[data-theme=light][data-theme=light] :where(.text-red-200\\/80, .text-red-200\\/90, .text-red-300\\/80) {
  color: color-mix(in srgb, #b91c1c 90%, transparent) !important;
}
[data-theme=light][data-theme=light] :where(.text-green-200, .text-green-300, .text-green-400) {
  color: #15803d !important; /* green-700 */
}
[data-theme=light][data-theme=light] :where(.text-green-200\\/80) {
  color: color-mix(in srgb, #15803d 90%, transparent) !important;
}
[data-theme=light][data-theme=light] :where(.border-red-500\\/40) {
  border-color: color-mix(in srgb, #dc2626 55%, transparent) !important;
}
[data-theme=light][data-theme=light] :where(.border-green-500\\/40) {
  border-color: color-mix(in srgb, #16a34a 55%, transparent) !important;
}
`.trim();

export function readPersistedAppearance(): AppearanceMode {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // ignore
  }
  return DEFAULT_APPEARANCE;
}

export function persistAppearance(mode: AppearanceMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

function syncDataThemeAttributes(mode: AppearanceMode): void {
  const roots = document.querySelectorAll(
    "[data-agent-server-ui], [data-theme]",
  );
  for (const el of roots) {
    if (!(el instanceof HTMLElement)) continue;
    if (
      el.hasAttribute("data-theme") ||
      el.hasAttribute("data-agent-server-ui")
    ) {
      el.setAttribute("data-theme", mode);
      el.classList.remove("dark", "light");
      el.classList.add(mode);
    }
  }
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.classList.remove("dark", "light");
  document.documentElement.classList.add(mode);
  document.documentElement.style.colorScheme = mode;
  if (document.body) {
    document.body.style.colorScheme = mode;
  }
}

function removeAppearanceStyle(): void {
  document.getElementById(APPEARANCE_STYLE_TAG_ID)?.remove();
}

function injectLightAppearanceStyle(): void {
  const decls = [
    ...Object.entries(LIGHT_SCALE),
    ...Object.entries(LIGHT_HEROUI),
    ...Object.entries(LIGHT_OH_TOKENS),
  ]
    .map(([p, v]) => `  ${p}: ${v};`)
    .join("\n");

  const herouiOnly = Object.entries(LIGHT_HEROUI)
    .map(([p, v]) => `  ${p}: ${v};`)
    .join("\n");

  const css = [
    `[data-agent-server-ui][data-agent-server-ui] {\n${decls}\n  color: var(--oh-foreground);\n}`,
    `[data-theme=light][data-theme=light] {\n${herouiOnly}\n${Object.entries(
      LIGHT_OH_TOKENS,
    )
      .map(([p, v]) => `  ${p}: ${v};`)
      .join("\n")}\n  color: var(--oh-foreground);\n}`,
    LIGHT_TEXT_REMAP_CSS,
  ].join("\n");

  let styleEl = document.getElementById(
    APPEARANCE_STYLE_TAG_ID,
  ) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = APPEARANCE_STYLE_TAG_ID;
  }
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
}

/**
 * Apply light/dark appearance. Call after applyColorTheme so light overrides
 * sit above palette tokens when needed.
 */
export function applyAppearance(mode: AppearanceMode): void {
  if (typeof document === "undefined") return;

  syncDataThemeAttributes(mode);

  if (mode === "light") {
    injectLightAppearanceStyle();
  } else {
    removeAppearanceStyle();
  }
}

export function setAppearance(mode: AppearanceMode): void {
  persistAppearance(mode);
  applyAppearance(mode);
}
