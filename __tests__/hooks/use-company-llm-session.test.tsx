/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  clearCompanyLlmSession,
  resetCompanyLlmSessionCacheForTests,
  writeCompanyLlmSession,
} from "#/api/company-llm/company-llm-session";
import { COMPANY_LLM_SESSION_STORAGE_KEY } from "#/constants/company-llm";
import { useCompanyLlmSession } from "#/hooks/use-company-llm-session";

function SessionProbe() {
  const session = useCompanyLlmSession();
  return (
    <div data-testid="session-probe">
      {session?.access_token ?? "none"}
    </div>
  );
}

describe("useCompanyLlmSession", () => {
  afterEach(() => {
    window.localStorage.removeItem(COMPANY_LLM_SESSION_STORAGE_KEY);
    resetCompanyLlmSessionCacheForTests();
  });

  it("renders with a stored session without exceeding max update depth", () => {
    writeCompanyLlmSession({
      access_token: "live-token",
      selected_model: "gpt-test",
    });

    // Would throw React max-update-depth (#185) if getSnapshot allocated a
    // new object on every call.
    render(<SessionProbe />);
    expect(screen.getByTestId("session-probe")).toHaveTextContent("live-token");
  });

  it("renders null session when cleared", () => {
    clearCompanyLlmSession();
    render(<SessionProbe />);
    expect(screen.getByTestId("session-probe")).toHaveTextContent("none");
  });
});
