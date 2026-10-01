import { describe, expect, it } from "vitest";

import {
  AUTO_HEAVY_DIR_THRESHOLD,
  WORKSPACE_EXCLUDED_DIRS,
  WORKSPACE_HEAVY_DIRS,
  WORKSPACE_IGNORE_FILE,
  buildAutoFatDirDetectionScript,
  buildIgnoreAwarePruneScript,
  captureFindWithTimeout,
  findWithTimeout,
} from "#/utils/workspace-excluded-dirs";

describe("workspace-excluded-dirs", () => {
  it("keeps .git out of the heavy-dir list so nested-git probes can discover it", () => {
    expect(WORKSPACE_HEAVY_DIRS).not.toContain(".git");
    expect(WORKSPACE_EXCLUDED_DIRS).toContain(".git");
    expect(WORKSPACE_EXCLUDED_DIRS).toEqual([".git", ...WORKSPACE_HEAVY_DIRS]);
  });

  it("covers common hang sources by default without any user ignore file", () => {
    for (const dir of [
      "node_modules",
      ".venv",
      "venv",
      "__pycache__",
      "dist",
      "build",
      "target",
      "models",
      "checkpoints",
      "weights",
      "datasets",
    ]) {
      expect(WORKSPACE_HEAVY_DIRS).toContain(dir);
    }
  });

  describe("buildIgnoreAwarePruneScript", () => {
    it("seeds the bash array with every default directory", () => {
      const script = buildIgnoreAwarePruneScript("prunes", [
        "node_modules",
        ".venv",
      ]);
      expect(script).toContain(
        "prunes=( -name 'node_modules' -o -name '.venv' )",
      );
    });

    it("optionally reads ignore files but never requires them", () => {
      const script = buildIgnoreAwarePruneScript("prunes");
      expect(script).toContain(`'${WORKSPACE_IGNORE_FILE}'`);
      expect(script).toContain("'.gitignore'");
      expect(script).toContain('[ -f "$_oh_ig" ] || continue');
      expect(script).toContain('prunes+=( -o -name "$_oh_p" )');
    });
  });

  describe("buildAutoFatDirDetectionScript", () => {
    it("emits an automatic fat-directory detector using the threshold", () => {
      const script = buildAutoFatDirDetectionScript("prunes", "path_prunes");
      expect(script).toContain(`-ge ${AUTO_HEAVY_DIR_THRESHOLD}`);
      expect(script).toContain('path_prunes+=( -o -path "$_oh_d" )');
      expect(script).toContain('"${prunes[@]}"');
    });
  });

  describe("find timeouts", () => {
    it("runs find in the current shell so array prunes still expand", () => {
      const out = findWithTimeout(
        `. \\( "\${prunes[@]}" \\) -prune -o -type f -print`,
        8,
        " | sort",
      );
      expect(out).toContain("timeout 8s find");
      expect(out).toContain('"${prunes[@]}"');
      expect(out).not.toContain("bash -c");
    });

    it("captures find output into a variable with the same guarantee", () => {
      const out = captureFindWithTimeout("n", ". -name .git -print", 5);
      expect(out).toContain("n=$(timeout 5s find");
      expect(out).not.toContain("bash -c");
    });
  });
});
