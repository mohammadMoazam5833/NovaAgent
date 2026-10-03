import { describe, expect, it } from "vitest";
import {
  AGENTS_MD_FILENAME,
  PROJECT_MEMORY_RELATIVE_PATH,
  resolveProjectRulesPath,
} from "#/api/project-rules-files";

describe("project-rules-files", () => {
  it("resolves AGENTS.md under the workspace root", () => {
    expect(resolveProjectRulesPath("/tmp/proj/", "agents")).toBe(
      `/tmp/proj/${AGENTS_MD_FILENAME}`,
    );
  });

  it("resolves MEMORY.md under .openhands/memory", () => {
    expect(resolveProjectRulesPath("/tmp/proj", "memory")).toBe(
      `/tmp/proj/${PROJECT_MEMORY_RELATIVE_PATH}`,
    );
  });
});
