import { heroui } from "@heroui/react";

export default heroui({
  defaultTheme: "dark",
  layout: {
    radius: {
      small: "5px",
      medium: "10px",
      large: "20px",
    },
  },
  themes: {
    dark: {
      colors: {
        primary: "#E8A317",

        // Map HeroUI's zinc-based semantic colours to our cool-grey palette.
        // This ensures every HeroUI component that uses bg-default, bg-content*,
        // etc. stays within the same colour family as the rest of the UI.

        background: {
          DEFAULT: "#081430", // Dorj ink
          foreground: "#F5F7FB",
        },

        foreground: {
          DEFAULT: "#B3C2E3",
          "50": "#081430",
          "100": "#0F2152",
          "200": "#182850",
          "300": "#22345F",
          "400": "#2A3D6B",
          "500": "#3A4E7E",
          "600": "#4F6393",
          "700": "#6B7FAE",
          "800": "#8EA0CB",
          "900": "#B3C2E3",
        },

        // Surface layers: panel → card → inner card → inset
        content1: { DEFAULT: "#182850", foreground: "#E6ECF8" },
        content2: { DEFAULT: "#22345F", foreground: "#D0DAF0" },
        content3: { DEFAULT: "#2A3D6B", foreground: "#B3C2E3" },
        content4: { DEFAULT: "#3A4E7E", foreground: "#8EA0CB" },

        focus: {
          DEFAULT: "#FFD36B", // high-contrast gold ring on navy
        },
        default: {
          "50": "#081430",
          "100": "#0F2152",
          "200": "#182850",
          "300": "#22345F",
          "400": "#2A3D6B",
          "500": "#3A4E7E",
          "600": "#4F6393",
          "700": "#6B7FAE",
          "800": "#8EA0CB",
          "900": "#B3C2E3",
          DEFAULT: "#2A3D6B",
          foreground: "#F5F7FB",
        },
      },
    },
  },
});
