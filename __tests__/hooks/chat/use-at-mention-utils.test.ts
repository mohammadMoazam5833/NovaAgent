import { describe, expect, it } from "vitest";
import {
  buildMentionItems,
  buildMentionReplacement,
  filterMentionItems,
  replaceMentionText,
} from "#/hooks/chat/use-at-mention";

const paths = [
  "src/components/README.md",
  "README.md",
  "src/index.ts",
  "AGENTS.md",
  ".openhands/memory/MEMORY.md",
  "package.json",
];

describe("workspace @mention logic", () => {
  it("derives unique files and ancestor folders from workspace paths", () => {
    const items = buildMentionItems(paths);

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "file", path: "README.md" }),
        expect.objectContaining({ kind: "folder", path: "src" }),
        expect.objectContaining({ kind: "rules", path: "AGENTS.md" }),
      ]),
    );
    expect(items.filter((item) => item.path === "src")).toHaveLength(1);
  });

  it("fuzzy filters case-insensitively and ranks closer matches first", () => {
    const items = buildMentionItems(paths);
    const results = filterMentionItems(items, "readm").map((item) => item.path);

    expect(results[0]).toBe("README.md");
    expect(results).toContain("src/components/README.md");
    expect(results).not.toContain("src/index.ts");
  });

  it("limits suggestions to 50 rows", () => {
    const paths = Array.from({ length: 80 }, (_, index) => `file-${index}.txt`);
    const items = buildMentionItems(paths);

    expect(filterMentionItems(items, "")).toHaveLength(50);
  });

  it("lists project rules for @rules and inserts a plain-text token", () => {
    const items = buildMentionItems(paths);
    const rules = filterMentionItems(items, "rules").map((item) => item.path);

    expect(rules).toContain("AGENTS.md");
    expect(rules).toContain(".openhands/memory/MEMORY.md");

    const replaced = replaceMentionText(
      "Review @rea please",
      { start: 7, end: 11 },
      { kind: "file", path: "README.md" },
    );

    expect(replaced.text).toBe("Review @README.md  please");
    expect(replaced.cursor).toBe(18);
    expect(buildMentionReplacement({ kind: "folder", path: "src" })).toBe(
      "@src/ ",
    );
  });
});
