import { AxiosError } from "axios";
import { describe, expect, it } from "vitest";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";

describe("retrieveAxiosErrorMessage", () => {
  it("prefers agent-server exception over generic detail on 500 responses", () => {
    const error = new AxiosError(
      "Request failed with status code 500",
      "ERR_BAD_RESPONSE",
      undefined,
      undefined,
      {
        status: 500,
        statusText: "Internal Server Error",
        headers: {},
        config: {} as never,
        data: {
          detail: "Internal Server Error",
          exception:
            "Client tool 'canvas_ui_control' is already registered with a different parameters schema.",
          error_id: "abc",
        },
      },
    );

    expect(retrieveAxiosErrorMessage(error)).toBe(
      "Client tool 'canvas_ui_control' is already registered with a different parameters schema.",
    );
  });
});
