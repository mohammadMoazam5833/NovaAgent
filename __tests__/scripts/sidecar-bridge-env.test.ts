// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildAgentServerCliExtraArgs,
  buildAgentServerEnv,
  buildSafeDevConfig,
  resolveLocalToolsSidecarBridgeEnv,
} from "../../scripts/dev-safe.mjs";

describe("resolveLocalToolsSidecarBridgeEnv", () => {
  it("is disabled without token", () => {
    expect(
      resolveLocalToolsSidecarBridgeEnv({
        NOVAAGENT_LOCAL_TOOLS_SIDECAR: "1",
        NOVAAGENT_LOCAL_TOOLS_URL: "http://127.0.0.1:18765",
      }),
    ).toMatchObject({ enabled: false, importModules: null });
  });

  it("defaults URL when SIDECAR=1 and token is set", () => {
    expect(
      resolveLocalToolsSidecarBridgeEnv({
        NOVAAGENT_LOCAL_TOOLS_SIDECAR: "1",
        NOVAAGENT_LOCAL_TOOLS_TOKEN: "tok",
      }),
    ).toEqual({
      enabled: true,
      url: "http://127.0.0.1:18765",
      token: "tok",
      importModules: "sidecar_bridge",
    });
  });

  it("honors explicit URL", () => {
    expect(
      resolveLocalToolsSidecarBridgeEnv({
        NOVAAGENT_LOCAL_TOOLS_URL: "http://127.0.0.1:19999",
        NOVAAGENT_LOCAL_TOOLS_TOKEN: "tok",
      }),
    ).toMatchObject({
      enabled: true,
      url: "http://127.0.0.1:19999",
      importModules: "sidecar_bridge",
    });
  });

  it("defaults to company-local gateway :18766 when GATEWAY=1", () => {
    expect(
      resolveLocalToolsSidecarBridgeEnv({
        NOVAAGENT_CUSTOMER_WORKSPACE_GATEWAY: "1",
        NOVAAGENT_LOCAL_TOOLS_TOKEN: "tok",
      }),
    ).toMatchObject({
      enabled: true,
      url: "http://127.0.0.1:18766",
      importModules: "sidecar_bridge",
    });
  });
});

describe("buildAgentServerCliExtraArgs", () => {
  it("returns import-modules when bridge enabled", () => {
    expect(
      buildAgentServerCliExtraArgs({
        NOVAAGENT_LOCAL_TOOLS_SIDECAR: "1",
        NOVAAGENT_LOCAL_TOOLS_TOKEN: "tok",
      }),
    ).toEqual(["--import-modules", "sidecar_bridge"]);
  });

  it("returns empty when disabled", () => {
    expect(buildAgentServerCliExtraArgs({})).toEqual([]);
  });
});

describe("buildAgentServerEnv sidecar passthrough", () => {
  it("injects sidecar URL/token when bridge enabled", () => {
    const config = buildSafeDevConfig(undefined, {
      OH_CANVAS_SAFE_STATE_DIR: "/tmp/novaagent-bridge-test-state",
      OH_CANVAS_SAFE_BACKEND_PORT: "18000",
      OH_CANVAS_SAFE_VSCODE_PORT: "18001",
      LOCAL_BACKEND_API_KEY: "session-key",
      OH_SECRET_KEY: "secret-key",
    });
    const env = buildAgentServerEnv(config, {
      NOVAAGENT_LOCAL_TOOLS_SIDECAR: "1",
      NOVAAGENT_LOCAL_TOOLS_TOKEN: "tok",
      NOVAAGENT_LOCAL_TOOLS_ROOTS: "/tmp/ws",
    });
    expect(env.NOVAAGENT_LOCAL_TOOLS_URL).toBe("http://127.0.0.1:18765");
    expect(env.NOVAAGENT_LOCAL_TOOLS_TOKEN).toBe("tok");
    expect(env.NOVAAGENT_LOCAL_TOOLS_ROOTS).toBe("/tmp/ws");
    expect(env.OH_EXTRA_PYTHON_PATH).toContain("tools");
  });
});
