/**
 * Protocol parse / response helpers for Local Tools Sidecar.
 */

import { LOCAL_TOOLS_PROTOCOL_VERSION } from "./constants.mjs";

/** @typedef {'hello'|'list_dir'|'read_file'|'write_file'|'exec'} LocalToolsRequestType */
/** @typedef {'result'|'error'} LocalToolsResponseType */

export const REQUEST_TYPES = Object.freeze([
  "hello",
  "list_dir",
  "read_file",
  "write_file",
  "exec",
]);

/**
 * @param {unknown} raw
 * @returns {{ ok: true, message: object } | { ok: false, error: { code: string, message: string } }}
 */
export function parseRequest(raw) {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        error: { code: "invalid_request", message: "body must be JSON" },
      };
    }
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      error: { code: "invalid_request", message: "body must be a JSON object" },
    };
  }

  const v = /** @type {Record<string, unknown>} */ (value).v;
  if (v !== LOCAL_TOOLS_PROTOCOL_VERSION) {
    return {
      ok: false,
      error: {
        code: "invalid_request",
        message: `unsupported protocol version (expected ${LOCAL_TOOLS_PROTOCOL_VERSION})`,
      },
    };
  }

  const id = /** @type {Record<string, unknown>} */ (value).id;
  if (typeof id !== "string" || id.trim() === "") {
    return {
      ok: false,
      error: { code: "invalid_request", message: "id must be a non-empty string" },
    };
  }

  const type = /** @type {Record<string, unknown>} */ (value).type;
  if (typeof type !== "string" || !REQUEST_TYPES.includes(type)) {
    return {
      ok: false,
      error: {
        code: "invalid_request",
        message: `type must be one of: ${REQUEST_TYPES.join(", ")}`,
      },
    };
  }

  const params = /** @type {Record<string, unknown>} */ (value).params;
  if (
    params !== undefined &&
    (params === null || typeof params !== "object" || Array.isArray(params))
  ) {
    return {
      ok: false,
      error: { code: "invalid_request", message: "params must be an object when present" },
    };
  }

  return {
    ok: true,
    message: {
      v: LOCAL_TOOLS_PROTOCOL_VERSION,
      id,
      type,
      params: params ?? {},
    },
  };
}

/**
 * @param {string} id
 * @param {unknown} result
 */
export function makeResult(id, result) {
  return {
    v: LOCAL_TOOLS_PROTOCOL_VERSION,
    id,
    type: "result",
    ok: true,
    result,
  };
}

/**
 * @param {string} id
 * @param {string} code
 * @param {string} message
 */
export function makeError(id, code, message) {
  return {
    v: LOCAL_TOOLS_PROTOCOL_VERSION,
    id,
    type: "error",
    ok: false,
    error: { code, message },
  };
}
