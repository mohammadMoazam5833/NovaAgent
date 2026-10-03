/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  clearCompanyLlmSession,
  readCompanyLlmSession,
  resetCompanyLlmSessionCacheForTests,
  writeCompanyLlmSession,
} from "#/api/company-llm/company-llm-session";
import { COMPANY_LLM_SESSION_STORAGE_KEY } from "#/constants/company-llm";

describe("company-llm-session snapshot cache", () => {
  afterEach(() => {
    window.localStorage.removeItem(COMPANY_LLM_SESSION_STORAGE_KEY);
    resetCompanyLlmSessionCacheForTests();
  });

  it("returns a referentially stable snapshot while localStorage is unchanged", () => {
    writeCompanyLlmSession({
      access_token: "tok",
      selected_model: "model-a",
    });

    const first = readCompanyLlmSession();
    const second = readCompanyLlmSession();

    expect(first).not.toBeNull();
    expect(second).toBe(first);
  });

  it("returns a new snapshot after write / clear", () => {
    writeCompanyLlmSession({ access_token: "tok-1" });
    const before = readCompanyLlmSession();

    writeCompanyLlmSession({
      access_token: "tok-2",
      selected_model: "m",
    });
    const afterWrite = readCompanyLlmSession();
    expect(afterWrite).not.toBe(before);
    expect(afterWrite?.access_token).toBe("tok-2");

    clearCompanyLlmSession();
    expect(readCompanyLlmSession()).toBeNull();
    expect(readCompanyLlmSession()).toBeNull();
  });
});
