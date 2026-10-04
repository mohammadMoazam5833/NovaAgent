import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  applyAppearance,
  persistAppearance,
  readPersistedAppearance,
} from "#/themes/appearance";

describe("appearance", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.getElementById("oh-appearance-override")?.remove();
    document.body.setAttribute("data-agent-server-ui", "");
    document.body.setAttribute("data-theme", "dark");
  });

  afterEach(() => {
    document.getElementById("oh-appearance-override")?.remove();
    document.body.removeAttribute("data-agent-server-ui");
    document.body.removeAttribute("data-theme");
    document.body.classList.remove("dark", "light");
  });

  it("defaults to light appearance", () => {
    expect(readPersistedAppearance()).toBe("light");
  });

  it("persists and applies light mode with an override stylesheet", () => {
    persistAppearance("light");
    applyAppearance("light");

    expect(readPersistedAppearance()).toBe("light");
    expect(document.body.getAttribute("data-theme")).toBe("light");
    const css = document.getElementById("oh-appearance-override")?.textContent;
    expect(css).toContain("--cool-grey-975: #ffffff");
    expect(css).toContain("--oh-foreground: #0f172a");
    expect(css).toContain("--oh-modal-title-foreground: #0f172a");
    expect(css).toContain(".text-white");
    expect(css).toContain(".text-red-200");
  });

  it("removes the light override when switching back to dark", () => {
    applyAppearance("light");
    applyAppearance("dark");

    expect(document.body.getAttribute("data-theme")).toBe("dark");
    expect(document.getElementById("oh-appearance-override")).toBeNull();
  });
});
