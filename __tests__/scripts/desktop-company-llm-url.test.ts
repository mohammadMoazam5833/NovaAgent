// @vitest-environment node
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  normalizeCompanyLlmUrl,
  resolveDesktopCompanyLlmUrl,
} from "../../scripts/desktop-company-llm-url.mjs";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("normalizeCompanyLlmUrl", () => {
  it("strips trailing slash on root path", () => {
    expect(normalizeCompanyLlmUrl("https://llm.example.com/")).toBe(
      "https://llm.example.com",
    );
  });
});

describe("resolveDesktopCompanyLlmUrl", () => {
  it("returns null when unset", () => {
    expect(resolveDesktopCompanyLlmUrl({})).toBeNull();
    expect(
      resolveDesktopCompanyLlmUrl({ NOVAAGENT_COMPANY_LLM_URL: "  " }),
    ).toBeNull();
  });

  it("reads env URL", () => {
    expect(
      resolveDesktopCompanyLlmUrl({
        NOVAAGENT_COMPANY_LLM_URL: "https://llm.example.com/",
      }),
    ).toBe("https://llm.example.com");
  });

  it("reads baked config when env is empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "company-llm-"));
    tempDirs.push(dir);
    const baked = join(dir, "baked.json");
    writeFileSync(
      baked,
      JSON.stringify({ companyLlmUrl: "https://baked.example.com/gw" }),
    );
    expect(resolveDesktopCompanyLlmUrl({}, { bakedConfigPath: baked })).toBe(
      "https://baked.example.com/gw",
    );
  });

  it("rejects non-http(s) schemes", () => {
    expect(() =>
      resolveDesktopCompanyLlmUrl({
        NOVAAGENT_COMPANY_LLM_URL: "file:///tmp/x",
      }),
    ).toThrow(/http/);
  });
});
