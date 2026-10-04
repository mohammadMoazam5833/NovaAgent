// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { LOCAL_TOOLS_PROTOCOL_VERSION } from "#/api/local-tools-sidecar/constants";
import { LocalToolsSidecarClient } from "#/api/local-tools-sidecar/client";
import { createLocalToolsSidecarServer } from "../../../scripts/local-tools-sidecar/server.mjs";
import { createCustomerWorkspaceGateway } from "../../../scripts/customer-workspace/gateway.mjs";
import { startCustomerWorkspaceClient } from "../../../scripts/customer-workspace/client.mjs";
import {
  buildCustomerWorkspaceWsUrl,
  isCustomerWorkspaceWsPath,
} from "../../../scripts/customer-workspace/urls.mjs";
import { parseRoots } from "../../../scripts/local-tools-sidecar/paths.mjs";

const tempDirs: string[] = [];
const closers: Array<{ close?: () => Promise<unknown> | unknown; stop?: () => void }> =
  [];

afterEach(async () => {
  while (closers.length) {
    const c = closers.pop();
    try {
      c?.stop?.();
      await c?.close?.();
    } catch {
      // ignore
    }
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

async function listen(
  server: { server: { once: Function }; listen: (cb?: () => void) => void },
) {
  await new Promise<void>((resolve, reject) => {
    server.server.once("error", reject);
    server.listen(() => resolve());
  });
}

describe("customer workspace URL helpers", () => {
  it("builds ws URL from the VPN door origin", () => {
    expect(buildCustomerWorkspaceWsUrl("http://172.16.40.188:8000")).toBe(
      "ws://172.16.40.188:8000/customer-workspace",
    );
    expect(
      buildCustomerWorkspaceWsUrl("https://nova.example.com/canvas"),
    ).toBe("wss://nova.example.com/customer-workspace");
  });

  it("recognizes gateway WS paths", () => {
    expect(isCustomerWorkspaceWsPath("/customer-workspace")).toBe(true);
    expect(isCustomerWorkspaceWsPath("/customer-workspace/ws")).toBe(true);
    expect(isCustomerWorkspaceWsPath("/v1/ws")).toBe(true);
    expect(isCustomerWorkspaceWsPath("/v1")).toBe(false);
    expect(isCustomerWorkspaceWsPath("/auth/login")).toBe(false);
  });

  it("accepts an explicit splitter so Windows drive letters can stay intact", () => {
    const a = mkdtempSync(join(tmpdir(), "cw-root-a-"));
    const b = mkdtempSync(join(tmpdir(), "cw-root-b-"));
    tempDirs.push(a, b);
    expect(parseRoots(`${a};${b}`, "/tmp", /[,;]/)).toEqual([a, b].map((p) => join(p)));
    // Colon splitting would break `C:\Users\...` — the win32 default avoids that.
    expect("C:\\Users\\alice".split(/[,:]/)).toHaveLength(2);
    expect("C:\\Users\\alice".split(/[,;]/)).toHaveLength(1);
  });
});

describe("reverse customer workspace bridge", () => {
  it("returns not_connected until a client attaches", async () => {
    const port = await freePort();
    const gateway = createCustomerWorkspaceGateway({
      host: "127.0.0.1",
      port,
      token: "tok",
    });
    await listen(gateway);
    closers.push(gateway);

    const res = await fetch(`http://127.0.0.1:${port}/v1`, {
      method: "POST",
      headers: {
        Authorization: "Bearer tok",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ v: 1, id: "1", type: "hello" }),
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_connected");
  });

  it("list_dir and exec via gateway HTTP after outbound WS (agent-server path)", async () => {
    const root = mkdtempSync(join(tmpdir(), "cw-bridge-"));
    tempDirs.push(root);
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "a.txt"), "hello");

    const sidecarPort = await freePort();
    const gatewayPort = await freePort();
    const token = "reverse-ws-token";

    const sidecar = createLocalToolsSidecarServer({
      host: "127.0.0.1",
      port: sidecarPort,
      token,
      roots: [root],
    });
    await listen(sidecar);
    closers.push(sidecar);

    const gateway = createCustomerWorkspaceGateway({
      host: "127.0.0.1",
      port: gatewayPort,
      token,
    });
    await listen(gateway);
    closers.push(gateway);

    const client = startCustomerWorkspaceClient({
      gatewayWsUrl: `ws://127.0.0.1:${gatewayPort}/customer-workspace`,
      sidecarBaseUrl: `http://127.0.0.1:${sidecarPort}`,
      token,
      reconnect: false,
    });
    closers.push(client);
    await client.ready;

    await expect
      .poll(async () => {
        const res = await fetch(`http://127.0.0.1:${gatewayPort}/health`);
        const body = (await res.json()) as { connected?: boolean };
        return body.connected;
      })
      .toBe(true);

    const health = await fetch(`http://127.0.0.1:${gatewayPort}/health`);
    expect(health.status).toBe(200);
    const healthBody = (await health.json()) as {
      ok: boolean;
      protocol: number;
      connected: boolean;
    };
    expect(healthBody.ok).toBe(true);
    expect(healthBody.protocol).toBe(LOCAL_TOOLS_PROTOCOL_VERSION);
    expect(healthBody.connected).toBe(true);

    const agent = new LocalToolsSidecarClient({
      host: "127.0.0.1",
      port: gatewayPort,
      token,
    });

    const listed = await agent.listDir({ path: root });
    expect(listed.entries.some((e) => e.name === "src")).toBe(true);

    const exe = await agent.exec({
      argv: ["printf", "reverse-ok"],
      cwd: root,
      timeout_ms: 5000,
    });
    expect(exe.exit_code).toBe(0);
    expect(exe.stdout).toBe("reverse-ok");
  });

  it("rejects a bad gateway token on WS", async () => {
    const gatewayPort = await freePort();
    const gateway = createCustomerWorkspaceGateway({
      host: "127.0.0.1",
      port: gatewayPort,
      token: "good",
    });
    await listen(gateway);
    closers.push(gateway);

    const client = startCustomerWorkspaceClient({
      gatewayWsUrl: `ws://127.0.0.1:${gatewayPort}/customer-workspace`,
      sidecarBaseUrl: "http://127.0.0.1:9",
      token: "bad",
      reconnect: false,
    });
    closers.push(client);
    await expect(client.ready).rejects.toThrow(/401|handshake/i);
  });
});
