import { describe, expect, it } from "vitest";
import {
  AUTO_CONTINUE_MAX_ATTEMPTS,
  buildAutoContinueNudge,
} from "#/constants/auto-continue";

describe("auto-continue", () => {
  it("builds a nudge listing unfinished tasks", () => {
    const text = buildAutoContinueNudge(["Fix tests", "Commit"]);
    expect(text).toContain("Fix tests");
    expect(text).toContain("Commit");
    expect(text.toLowerCase()).toContain("continue");
  });

  it("caps attempts at 3", () => {
    expect(AUTO_CONTINUE_MAX_ATTEMPTS).toBe(3);
  });
});
