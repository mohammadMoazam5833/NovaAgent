/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loginToCompanyLlm,
  listCompanyLlmModels,
  normalizeCompanyModelIds,
  parseCompanyLlmLoginResponse,
  CompanyLlmClientError,
} from "#/api/company-llm/company-llm-client";

describe("normalizeCompanyModelIds", () => {
  it("reads OpenAI-style data[].id", () => {
    expect(
      normalizeCompanyModelIds({
        data: [{ id: "a" }, { id: "b" }, { id: "a" }],
      }),
    ).toEqual(["a", "b"]);
  });

  it("accepts models[] and bare string arrays", () => {
    expect(normalizeCompanyModelIds({ models: ["x", "y"] })).toEqual([
      "x",
      "y",
    ]);
    expect(normalizeCompanyModelIds(["p", "q"])).toEqual(["p", "q"]);
  });
});

describe("parseCompanyLlmLoginResponse", () => {
  it("accepts access_token and optional fields", () => {
    expect(
      parseCompanyLlmLoginResponse({
        access_token: "tok",
        expires_in: 3600,
        refresh_token: "ref",
      }),
    ).toEqual({
      access_token: "tok",
      expires_in: 3600,
      refresh_token: "ref",
    });
  });

  it("rejects missing token", () => {
    expect(() => parseCompanyLlmLoginResponse({})).toThrow(
      CompanyLlmClientError,
    );
  });
});

describe("loginToCompanyLlm / listCompanyLlmModels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs username/password to /auth/login", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "abc" }),
    });

    const result = await loginToCompanyLlm("alice", "secret", {
      baseUrl: "https://llm.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.access_token).toBe("abc");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://llm.example.com/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ username: "alice", password: "secret" }),
      }),
    );
  });

  it("GETs /v1/models with Bearer token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "m1" }] }),
    });

    const models = await listCompanyLlmModels("tok", {
      baseUrl: "https://llm.example.com/",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(models).toEqual(["m1"]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://llm.example.com/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
        }),
      }),
    );
  });

  it("surfaces non-OK login as CompanyLlmClientError", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: "bad creds" }),
    });

    await expect(
      loginToCompanyLlm("u", "p", {
        baseUrl: "https://llm.example.com",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      name: "CompanyLlmClientError",
      status: 401,
      message: "bad creds",
    });
  });
});
