// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { LocalToolsSidecarClient } from "#/api/local-tools-sidecar/client";
import { LOCAL_TOOLS_PROTOCOL_VERSION } from "#/api/local-tools-sidecar/constants";
import { createLocalToolsSidecarServer } from "../../../scripts/local-tools-sidecar/server.mjs";

const tempDirs: string[] = [];
const servers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  while (servers.length) {
    const s = servers.pop();
    if (s) await s.close().catch(() => undefined);
  }
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      if (!addr || typeof addr === "string") {
        s.close();
        reject(new Error("no port"));
        return;
      }
      const { port } = addr;
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function startSidecar(root: string, token = "test-token") {
  const port = await freePort();
  const sidecar = createLocalToolsSidecarServer({
    host: "127.0.0.1",
    port,
    token,
    roots: [root],
  });
  await new Promise<void>((resolve, reject) => {
    sidecar.server.once("error", reject);
    sidecar.listen(() => resolve());
  });
  servers.push(sidecar);
  return { port, token, client: new LocalToolsSidecarClient({ port, token }) };
}

describe("local tools sidecar server", () => {
  it("serves health without auth", async () => {
    const root = mkdtempSync(join(tmpdir(), "sidecar-health-"));
    tempDirs.push(root);
    const { client } = await startSidecar(root);
    const health = await client.health();
    expect(health).toEqual({
      ok: true,
      protocol: LOCAL_TOOLS_PROTOCOL_VERSION,
    });
  });

  it("rejects missing token on /v1", async () => {
    const root = mkdtempSync(join(tmpdir(), "sidecar-auth-"));
    tempDirs.push(root);
    const { port } = await startSidecar(root, "secret");
    const res = await fetch(`http://127.0.0.1:${port}/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ v: 1, id: "1", type: "hello" }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("lists dir under allowlisted root and denies escape", async () => {
    const root = mkdtempSync(join(tmpdir(), "sidecar-list-"));
    tempDirs.push(root);
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "nested", "a.txt"), "hello");

    const { client } = await startSidecar(root);
    const listed = await client.listDir({ path: root });
    expect(listed.entries.some((e) => e.name === "nested")).toBe(true);

    await expect(client.listDir({ path: "/etc" })).rejects.toMatchObject({
      code: "path_denied",
    });
  });

  it("reads and writes files under roots", async () => {
    const root = mkdtempSync(join(tmpdir(), "sidecar-rw-"));
    tempDirs.push(root);
    const { client } = await startSidecar(root);

    const written = await client.writeFile({
      path: join(root, "out", "note.txt"),
      content: "nova",
      create_parents: true,
    });
    expect(written.bytes_written).toBe(4);

    const read = await client.readFile({ path: join(root, "out", "note.txt") });
    expect(read.content).toBe("nova");
  });

  it("execs argv without shell under allowlisted cwd", async () => {
    const root = mkdtempSync(join(tmpdir(), "sidecar-exec-"));
    tempDirs.push(root);
    const { client } = await startSidecar(root);
    const result = await client.exec({
      argv: ["printf", "sidecar-ok"],
      cwd: root,
      timeout_ms: 5000,
    });
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toBe("sidecar-ok");
    expect(result.timed_out).toBe(false);
  });
});
