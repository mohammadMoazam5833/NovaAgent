import { AxiosError } from "axios";

export const isAxiosErrorWithErrorField = (
  error: AxiosError,
): error is AxiosError<{ error: string }> =>
  typeof error.response?.data === "object" &&
  error.response?.data !== null &&
  "error" in error.response.data &&
  typeof error.response?.data?.error === "string";

export const isAxiosErrorWithMessageField = (
  error: AxiosError,
): error is AxiosError<{ message: string }> =>
  typeof error.response?.data === "object" &&
  error.response?.data !== null &&
  "message" in error.response.data &&
  typeof error.response?.data?.message === "string";

/** Agent-server unhandled 500s return `{ detail, exception, error_id }`. */
export const isAxiosErrorWithExceptionField = (
  error: AxiosError,
): error is AxiosError<{ exception: string }> =>
  typeof error.response?.data === "object" &&
  error.response?.data !== null &&
  "exception" in error.response.data &&
  typeof error.response?.data?.exception === "string";

export const isAxiosErrorWithDetailField = (
  error: AxiosError,
): error is AxiosError<{ detail: string }> =>
  typeof error.response?.data === "object" &&
  error.response?.data !== null &&
  "detail" in error.response.data &&
  typeof error.response?.data?.detail === "string";
