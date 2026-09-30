// @vitest-environment node
import { describe, expect, it } from "vitest";

import { LOCAL_TOOLS_PROTOCOL_VERSION } from "#/api/local-tools-sidecar/constants";
import { parseLocalToolsRequest } from "#/api/local-tools-sidecar/protocol";
import { parseRequest } from "../../../scripts/local-tools-sidecar/protocol.mjs";

describe("parseLocalToolsRequest (TS)", () => {
  it("accepts a valid hello envelope", () => {
    const parsed = parseLocalToolsRequest({
      v: LOCAL_TOOLS_PROTOCOL_VERSION,
      id: "1",
      type: "hello",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.message.type).toBe("hello");
      expect(parsed.message.params).toEqual({});
    }
  });

  it("rejects wrong protocol version", () => {
    const parsed = parseLocalToolsRequest({
      v: 999,
      id: "1",
      type: "hello",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("invalid_request");
    }
  });

  it("rejects unknown type", () => {
    const parsed = parseLocalToolsRequest({
      v: 1,
      id: "1",
      type: "delete_everything",
    });
    expect(parsed.ok).toBe(false);
  });

  it("parses JSON strings", () => {
    const parsed = parseLocalToolsRequest(
      JSON.stringify({
        v: 1,
        id: "abc",
        type: "list_dir",
        params: { path: "/tmp" },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.message.params).toEqual({ path: "/tmp" });
    }
  });
});

describe("parseRequest (mjs) stays in sync", () => {
  it("accepts the same hello envelope", () => {
    const parsed = parseRequest({
      v: LOCAL_TOOLS_PROTOCOL_VERSION,
      id: "1",
      type: "hello",
    });
    expect(parsed.ok).toBe(true);
  });

  it("rejects missing id", () => {
    const parsed = parseRequest({ v: 1, type: "hello" });
    expect(parsed.ok).toBe(false);
  });
});
