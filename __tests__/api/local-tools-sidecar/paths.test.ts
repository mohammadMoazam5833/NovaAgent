// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  isPathInsideRoot,
  parseRoots,
  resolveUnderRoots,
} from "../../../scripts/local-tools-sidecar/paths.mjs";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function makeRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "sidecar-roots-"));
  tempDirs.push(dir);
  return dir;
}

describe("parseRoots", () => {
  it("falls back to cwd when empty", () => {
    const cwd = makeRoot();
    expect(parseRoots("", cwd)).toEqual([resolve(cwd)]);
    expect(parseRoots(undefined, cwd)).toEqual([resolve(cwd)]);
  });

  it("splits colon and comma lists", () => {
    const a = makeRoot();
    const b = makeRoot();
    expect(parseRoots(`${a}:${b}`, "/tmp")).toEqual([resolve(a), resolve(b)]);
    expect(parseRoots(`${a},${b}`, "/tmp")).toEqual([resolve(a), resolve(b)]);
  });
});

describe("isPathInsideRoot", () => {
  it("accepts the root itself and children", () => {
    expect(isPathInsideRoot("/home/user", "/home/user")).toBe(true);
    expect(isPathInsideRoot("/home/user/proj", "/home/user")).toBe(true);
  });

  it("rejects sibling prefix matches", () => {
    expect(isPathInsideRoot("/home/user2", "/home/user")).toBe(false);
    expect(isPathInsideRoot("/home/user-extra", "/home/user")).toBe(false);
  });
});

describe("resolveUnderRoots", () => {
  it("allows paths under an allowlisted root", () => {
    const root = makeRoot();
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "a.txt"), "hi");
    const { absolute } = resolveUnderRoots(join(root, "src", "a.txt"), [root], {
      mustExist: true,
    });
    expect(absolute).toBe(resolve(root, "src", "a.txt"));
  });

  it("rejects .. escapes outside roots", () => {
    const root = makeRoot();
    mkdirSync(join(root, "src"));
    expect(() =>
      resolveUnderRoots(join(root, "src", "..", "..", "etc", "passwd"), [root]),
    ).toThrow(/allowlisted|escapes/);
  });

  it("rejects absolute paths outside roots", () => {
    const root = makeRoot();
    expect(() => resolveUnderRoots("/etc/passwd", [root])).toThrow(
      /allowlisted|escapes/,
    );
  });

  it("rejects symlink escapes outside roots when the link exists", () => {
    const root = makeRoot();
    const outside = makeRoot();
    writeFileSync(join(outside, "secret.txt"), "nope");
    const link = join(root, "escape");
    try {
      symlinkSync(outside, link);
    } catch {
      // Some environments disallow symlinks — skip rather than fail CI.
      return;
    }
    expect(() =>
      resolveUnderRoots(join(link, "secret.txt"), [root], { mustExist: true }),
    ).toThrow(/allowlisted|escapes/);
  });

  it("returns not_found when mustExist and path missing", () => {
    const root = makeRoot();
    try {
      resolveUnderRoots(join(root, "missing.txt"), [root], { mustExist: true });
      expect.unreachable();
    } catch (err) {
      expect((err as { code?: string }).code).toBe("not_found");
    }
  });
});
