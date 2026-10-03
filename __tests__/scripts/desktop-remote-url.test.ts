// @vitest-environment node
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  normalizeDesktopRemoteUiUrl,
  readRemoteUiUrlFromConfigFile,
  resolveDesktopRemoteUiUrl,
} from "../../scripts/desktop-remote-url.mjs";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("normalizeDesktopRemoteUiUrl", () => {
  it("strips trailing slash on root path", () => {
    expect(normalizeDesktopRemoteUiUrl("https://nova.example.com/")).toBe(
      "https://nova.example.com",
    );
  });
});

describe("resolveDesktopRemoteUiUrl", () => {
  it("returns null when unset", () => {
    expect(resolveDesktopRemoteUiUrl({})).toBeNull();
    expect(resolveDesktopRemoteUiUrl({ NOVAAGENT_REMOTE_URL: "  " })).toBeNull();
  });

  it("prefers NOVAAGENT_REMOTE_URL over OH_REMOTE_UI_URL", () => {
    expect(
      resolveDesktopRemoteUiUrl({
        NOVAAGENT_REMOTE_URL: "https://nova.example.com/",
        OH_REMOTE_UI_URL: "https://other.example.com/",
      }),
    ).toBe("https://nova.example.com");
  });

  it("reads baked config when env is empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "remote-ui-"));
    tempDirs.push(dir);
    const baked = join(dir, "baked.json");
    writeFileSync(
      baked,
      JSON.stringify({ remoteUrl: "https://baked.example.com/app" }),
    );
    expect(resolveDesktopRemoteUiUrl({}, { bakedConfigPath: baked })).toBe(
      "https://baked.example.com/app",
    );
  });

  it("prefers env over baked config", () => {
    const dir = mkdtempSync(join(tmpdir(), "remote-ui-"));
    tempDirs.push(dir);
    const baked = join(dir, "baked.json");
    writeFileSync(
      baked,
      JSON.stringify({ remoteUrl: "https://baked.example.com" }),
    );
    expect(
      resolveDesktopRemoteUiUrl(
        { NOVAAGENT_REMOTE_URL: "https://env.example.com" },
        { bakedConfigPath: baked },
      ),
    ).toBe("https://env.example.com");
  });

  it("rejects non-http(s) schemes", () => {
    expect(() =>
      resolveDesktopRemoteUiUrl({ NOVAAGENT_REMOTE_URL: "file:///tmp/x" }),
    ).toThrow(/http/);
  });
});

describe("readRemoteUiUrlFromConfigFile", () => {
  it("returns null for missing file", () => {
    expect(readRemoteUiUrlFromConfigFile("/no/such/file.json")).toBeNull();
  });
});
