/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  getCompanyLlmOpenAiBaseUrl,
  getCompanyLlmUrl,
  isCompanyLlmManagedMode,
  toCompanyLlmAgentServerModel,
  toCompanyLlmCatalogModelId,
} from "#/api/company-llm/company-llm-config";
import { COMPANY_LLM_URL_WINDOW_KEY } from "#/constants/company-llm";

describe("company-llm-config", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)[
      COMPANY_LLM_URL_WINDOW_KEY
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (import.meta as any).env.VITE_NOVAAGENT_COMPANY_LLM_URL = "";
  });

  it("is off when URL is unset", () => {
    expect(getCompanyLlmUrl()).toBeNull();
    expect(isCompanyLlmManagedMode()).toBe(false);
  });

  it("reads window injection", () => {
    (window as unknown as Record<string, unknown>)[COMPANY_LLM_URL_WINDOW_KEY] =
      "https://gw.example.com/";
    expect(getCompanyLlmUrl()).toBe("https://gw.example.com");
    expect(isCompanyLlmManagedMode()).toBe(true);
  });

  it("appends /v1 for OpenAI-compatible base URL", () => {
    expect(getCompanyLlmOpenAiBaseUrl("https://gw.example.com")).toBe(
      "https://gw.example.com/v1",
    );
    expect(getCompanyLlmOpenAiBaseUrl("https://gw.example.com/v1")).toBe(
      "https://gw.example.com/v1",
    );
  });

  it("prefixes bare catalog ids with openai/ for LiteLLM", () => {
    expect(toCompanyLlmAgentServerModel("qwen3-coder-30b")).toBe(
      "openai/qwen3-coder-30b",
    );
    expect(toCompanyLlmAgentServerModel("openai/qwen3-coder-30b")).toBe(
      "openai/qwen3-coder-30b",
    );
    expect(toCompanyLlmAgentServerModel("  anthropic/claude  ")).toBe(
      "anthropic/claude",
    );
  });

  it("strips openai/ for catalog matching", () => {
    expect(toCompanyLlmCatalogModelId("openai/qwen3-coder-30b")).toBe(
      "qwen3-coder-30b",
    );
    expect(toCompanyLlmCatalogModelId("qwen3-coder-30b")).toBe(
      "qwen3-coder-30b",
    );
  });
});
